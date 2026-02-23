import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@trigger.dev/sdk";
import type { UserConfig } from "../../config/userProfile.js";
import type { ScrapedJob } from "./scraper.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FilterResult {
  isMatch: boolean;
  score: number; // 0-100
  reason: string;
}

// ── Gemini Client (Flash for dirt-cheap filtering) ───────────────────────────

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY environment variable is not set");
  return new GoogleGenerativeAI(key);
}

// ── Filter ───────────────────────────────────────────────────────────────────

export async function filterJob(
  job: ScrapedJob,
  userConfig: UserConfig
): Promise<FilterResult> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

  const skillsList = userConfig.skills
    .map((cat) => `${cat.category}: ${cat.items.join(", ")}`)
    .join("\n");

  const experienceSummary = userConfig.experience
    .map((exp) => `${exp.role} at ${exp.company} (${exp.startDate} - ${exp.endDate})`)
    .join("\n");

  const prompt = `You are a job-matching assistant. Evaluate whether this job posting is a good fit for the candidate.

## Candidate Profile
**Target Roles**: ${userConfig.preferences.jobTitles.join(", ")}
**Target Seniority**: ${userConfig.preferences.seniority.join(", ")}
**Preferred Locations**: ${userConfig.preferences.locations.join(", ")}
**Remote Only**: ${userConfig.preferences.remoteOnly ? "Yes" : "No"}
**Requires H-1B Visa Sponsorship**: ${userConfig.preferences.requireH1bSponsorship ? "Yes — MUST NOT say 'no sponsorship' or 'unable to sponsor'" : "No"}
${userConfig.preferences.minSalary ? `**Minimum Salary**: $${userConfig.preferences.minSalary.toLocaleString()}` : ""}

**Skills**:
${skillsList}

**Experience**:
${experienceSummary}

## Job Posting
**Title**: ${job.title}
**Company**: ${job.company}
**Location**: ${job.location}
${job.salary ? `**Salary**: ${job.salary}` : ""}
${job.jobType ? `**Type**: ${job.jobType}` : ""}

**Description**:
${job.description.slice(0, 3000)}

## Instructions
Respond with ONLY a valid JSON object (no markdown fences, no extra text):
{"isMatch": true, "score": 75, "reason": "one sentence explanation"}

Scoring rules:
- Score 0-100 where >= 60 is a match
- The role must align with target roles AND seniority level (e.g. don't match a Junior role if targeting Senior)
- Required skills must overlap significantly with candidate's skills
- Location must match preferences (or be remote-friendly)
- Salary must meet minimum if both are specified
${userConfig.preferences.requireH1bSponsorship ? `- CRITICAL: If the job posting explicitly says "no visa sponsorship", "unable to sponsor", "must be authorized to work without sponsorship", or similar — score it 0 and set isMatch to false. If the posting is silent on sponsorship, that's fine (don't penalize).` : ""}

Be practical — "Senior AI Engineer" matches someone targeting "AI Engineer" at Senior level. "Staff ML Engineer" matches "Machine Learning Engineer" at Staff level.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Strip markdown fences if Gemini wraps the response
    const jsonText = text.replace(/^```(?:json)?\n?/g, "").replace(/\n?```$/g, "");
    const parsed = JSON.parse(jsonText) as FilterResult;

    logger.info("Job filter result", {
      job: `${job.title} @ ${job.company}`,
      score: parsed.score,
      isMatch: parsed.isMatch,
      reason: parsed.reason,
    });

    return {
      isMatch: parsed.isMatch && parsed.score >= 60,
      score: parsed.score,
      reason: parsed.reason,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error("Filter AI call failed", {
      job: `${job.title} @ ${job.company}`,
      error: errorMsg,
      stack: errorStack,
      hasApiKey: !!process.env.GEMINI_API_KEY,
      apiKeyPrefix: process.env.GEMINI_API_KEY?.slice(0, 10),
    });

    // On failure, be optimistic — let the job through for manual review
    return {
      isMatch: true,
      score: 50,
      reason: `AI filter failed (${errorMsg.slice(0, 80)}) — passed through for manual review`,
    };
  }
}
