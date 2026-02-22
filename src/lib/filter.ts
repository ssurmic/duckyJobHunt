import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@trigger.dev/sdk";
import type { UserConfig } from "../../config/userProfile.js";
import type { ScrapedJob } from "./scraper.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FilterResult {
  isMatch: boolean;
  score: number; // 0-100
  reason: string;
}

// ── Anthropic Client (Haiku for cheap/fast filtering) ────────────────────────

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  return new Anthropic({ apiKey: key });
}

// ── Filter ───────────────────────────────────────────────────────────────────

export async function filterJob(
  job: ScrapedJob,
  userConfig: UserConfig
): Promise<FilterResult> {
  const client = getClient();

  const skillsList = userConfig.skills
    .map((cat) => `${cat.category}: ${cat.items.join(", ")}`)
    .join("\n");

  const experienceSummary = userConfig.experience
    .map((exp) => `${exp.role} at ${exp.company} (${exp.startDate} - ${exp.endDate})`)
    .join("\n");

  const prompt = `You are a job-matching assistant. Evaluate whether this job posting is a good fit for the candidate.

## Candidate Profile
**Target Roles**: ${userConfig.preferences.jobTitles.join(", ")}
**Preferred Locations**: ${userConfig.preferences.locations.join(", ")}
**Remote Only**: ${userConfig.preferences.remoteOnly ? "Yes" : "No"}
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
{
  "isMatch": true/false,
  "score": <0-100>,
  "reason": "<one sentence explanation>"
}

A job is a match (score >= 60) if:
- The role aligns with the candidate's target roles and experience level
- The required skills overlap significantly with the candidate's skills
- The location matches preferences (or is remote when preferred)
- The salary meets minimum requirements (if specified and listed)

Be practical — a "Senior Software Engineer" posting matches a candidate targeting "Software Engineer" roles.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const parsed = JSON.parse(text.trim()) as FilterResult;

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
    logger.error("Filter AI call failed", {
      job: `${job.title} @ ${job.company}`,
      error: error instanceof Error ? error.message : String(error),
    });

    // On failure, be optimistic — let the job through for manual review
    return {
      isMatch: true,
      score: 50,
      reason: "AI filter failed — passed through for manual review",
    };
  }
}
