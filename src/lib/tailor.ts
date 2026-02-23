import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@trigger.dev/sdk";
import type { UserConfig } from "../../config/userProfile.js";
import type { ScrapedJob } from "./scraper.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TailoredResume {
  markdown: string;
  coverLetter: string;
  matchedBullets: string[]; // Which experience bullets were selected
}

// ── Anthropic Client (Sonnet for quality tailoring) ──────────────────────────

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  return new Anthropic({ apiKey: key });
}

// ── Resume Tailor ────────────────────────────────────────────────────────────

export async function tailorResume(
  job: ScrapedJob,
  userConfig: UserConfig
): Promise<TailoredResume> {
  const client = getClient();

  const fullExperience = userConfig.experience
    .map(
      (exp) =>
        `### ${exp.role} | ${exp.company} | ${exp.startDate} – ${exp.endDate}\n${exp.bullets.map((b) => `- ${b}`).join("\n")}`
    )
    .join("\n\n");

  const fullProjects = userConfig.projects
    .map(
      (proj) =>
        `### ${proj.name}\n${proj.description}\nTech: ${proj.technologies.join(", ")}${proj.url ? `\nURL: ${proj.url}` : ""}`
    )
    .join("\n\n");

  const fullSkills = userConfig.skills
    .map((cat) => `**${cat.category}**: ${cat.items.join(", ")}`)
    .join("\n");

  const education = userConfig.education
    .map((edu) => `${edu.degree} ${edu.field}, ${edu.institution} (${edu.graduationDate})`)
    .join("\n");

  const prompt = `You are an expert resume writer. Create a tailored resume and cover letter for this specific job posting.

## Job Posting
**Title**: ${job.title}
**Company**: ${job.company}
**Location**: ${job.location}
${job.salary ? `**Salary**: ${job.salary}` : ""}

**Description**:
${job.description.slice(0, 4000)}

## Candidate's Full Background

**Name**: ${userConfig.identity.name}
**Email**: ${userConfig.identity.email}
${userConfig.identity.phone ? `**Phone**: ${userConfig.identity.phone}` : ""}
**LinkedIn**: ${userConfig.identity.linkedinUrl}
${userConfig.identity.portfolioUrl ? `**Portfolio**: ${userConfig.identity.portfolioUrl}` : ""}
**Location**: ${userConfig.identity.location}

### Experience
${fullExperience}

### Projects
${fullProjects}

### Skills
${fullSkills}

### Education
${education}

### Cover Letter Template
${userConfig.coverLetterTemplate}

## Instructions

Generate a JSON response with EXACTLY this structure (no markdown fences):
{
  "resume": "<full markdown resume tailored to this job>",
  "coverLetter": "<cover letter with template placeholders filled in>",
  "matchedBullets": ["<bullet 1>", "<bullet 2>", ...]
}

**Resume rules**:
1. Use clean markdown formatting with clear sections: Header, Summary, Experience, Projects, Skills, Education
2. For each experience entry, select the 3-5 MOST RELEVANT bullet points for this specific job
3. Reword bullets slightly to emphasize skills mentioned in the job posting (but never fabricate)
4. Put the most relevant experience and projects first
5. In the Summary, directly address what the job is looking for

**Cover letter rules**:
1. Fill in ALL template placeholders ({{jobTitle}}, {{company}}, {{name}}, etc.)
2. Write a compelling {{customParagraph}} that connects the candidate's specific achievements to the job requirements
3. Keep it concise — 3-4 paragraphs max

**matchedBullets**: List the exact original bullet points you selected (for tracking).`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Strip markdown fences if the model wraps the response
    const text = rawText
      .trim()
      .replace(/^```(?:json)?\n?/g, "")
      .replace(/\n?```$/g, "");

    const parsed = JSON.parse(text);

    logger.info("Resume tailored", {
      job: `${job.title} @ ${job.company}`,
      bulletCount: parsed.matchedBullets?.length ?? 0,
    });

    return {
      markdown: parsed.resume,
      coverLetter: parsed.coverLetter,
      matchedBullets: parsed.matchedBullets || [],
    };
  } catch (error) {
    logger.error("Tailor AI call failed", {
      job: `${job.title} @ ${job.company}`,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return a basic fallback resume so the pipeline doesn't crash
    return {
      markdown: generateFallbackResume(userConfig),
      coverLetter: "Cover letter generation failed — please write manually.",
      matchedBullets: [],
    };
  }
}

// ── Fallback ─────────────────────────────────────────────────────────────────

function generateFallbackResume(config: UserConfig): string {
  const header = `# ${config.identity.name}
${config.identity.email} | ${config.identity.linkedinUrl}${config.identity.phone ? ` | ${config.identity.phone}` : ""}
${config.identity.location}`;

  const experience = config.experience
    .map(
      (exp) =>
        `## ${exp.role} | ${exp.company}\n*${exp.startDate} – ${exp.endDate}*\n${exp.bullets.map((b) => `- ${b}`).join("\n")}`
    )
    .join("\n\n");

  const skills = config.skills
    .map((cat) => `**${cat.category}**: ${cat.items.join(", ")}`)
    .join("\n");

  const education = config.education
    .map((edu) => `${edu.degree} ${edu.field}, ${edu.institution} (${edu.graduationDate})`)
    .join("\n");

  return `${header}\n\n---\n\n## Experience\n${experience}\n\n## Skills\n${skills}\n\n## Education\n${education}`;
}
