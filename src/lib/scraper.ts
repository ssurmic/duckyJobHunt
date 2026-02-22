import { ApifyClient } from "apify-client";
import { logger } from "@trigger.dev/sdk";
import type { Preferences } from "../../config/userProfile.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  salary?: string;
  postedAt?: string;
  jobType?: string;
}

// ── Apify Client ─────────────────────────────────────────────────────────────

const apifyToken = process.env.APIFY_TOKEN;

function getApifyClient(): ApifyClient {
  if (!apifyToken) {
    throw new Error("APIFY_TOKEN environment variable is not set");
  }
  return new ApifyClient({ token: apifyToken });
}

// ── Scraper ──────────────────────────────────────────────────────────────────

export async function scrapeJobs(
  preferences: Preferences,
  maxResults: number = 20
): Promise<ScrapedJob[]> {
  const client = getApifyClient();

  const allJobs: ScrapedJob[] = [];

  // Run a search for each job title + location combination
  for (const jobTitle of preferences.jobTitles) {
    for (const location of preferences.locations) {
      logger.info("Scraping jobs", { jobTitle, location });

      try {
        const run = await client.actor("hMvNSpz3JnHgl5jkh").call(
          {
            title: jobTitle,
            location: location,
            rows: Math.ceil(maxResults / preferences.jobTitles.length),
            proxy: {
              useApifyProxy: true,
            },
          },
          {
            waitSecs: 120,
          }
        );

        if (!run?.defaultDatasetId) {
          logger.warn("No dataset returned from Apify run", {
            jobTitle,
            location,
          });
          continue;
        }

        const { items } = await client
          .dataset(run.defaultDatasetId)
          .listItems();

        for (const item of items) {
          const job = normalizeJob(item);
          if (job) {
            allJobs.push(job);
          }
        }

        logger.info("Scraped batch", {
          jobTitle,
          location,
          count: items.length,
        });
      } catch (error) {
        logger.error("Apify scrape failed for query", {
          jobTitle,
          location,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other searches — don't crash the whole workflow
      }
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = allJobs.filter((job) => {
    if (seen.has(job.url)) return false;
    seen.add(job.url);
    return true;
  });

  // Filter out blacklisted companies
  const filtered = deduped.filter(
    (job) =>
      !preferences.blacklistedCompanies.some((blocked) =>
        job.company.toLowerCase().includes(blocked.toLowerCase())
      )
  );

  logger.info("Scraping complete", {
    total: allJobs.length,
    deduplicated: deduped.length,
    afterBlacklist: filtered.length,
  });

  return filtered.slice(0, maxResults);
}

// ── Normalizer ───────────────────────────────────────────────────────────────

function normalizeJob(raw: Record<string, unknown>): ScrapedJob | null {
  const title = String(raw.title || raw.jobTitle || "").trim();
  const company = String(
    raw.company || raw.companyName || raw.organization || ""
  ).trim();
  const location = String(
    raw.location || raw.jobLocation || raw.place || ""
  ).trim();
  const description = String(
    raw.description || raw.jobDescription || raw.descriptionText || ""
  ).trim();
  const url = String(raw.url || raw.link || raw.jobUrl || "").trim();

  if (!title || !company || !url) {
    return null;
  }

  return {
    title,
    company,
    location,
    description,
    url,
    salary: raw.salary ? String(raw.salary) : undefined,
    postedAt: raw.postedAt ? String(raw.postedAt) : undefined,
    jobType: raw.jobType ? String(raw.jobType) : undefined,
  };
}
