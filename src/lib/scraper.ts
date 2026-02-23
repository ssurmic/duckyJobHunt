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

  // Build a list of (title, location) pairs, one location per title (round-robin)
  // This avoids 6 titles × 7 locations = 42 Apify calls (each ~1-2 min)
  // Instead we make exactly `jobTitles.length` calls
  const queries = preferences.jobTitles.map((title, i) => ({
    title,
    location: preferences.locations[i % preferences.locations.length],
  }));

  const rowsPerQuery = Math.ceil(maxResults / queries.length);

  logger.info("Scraping plan", {
    queries: queries.map((q) => `${q.title} @ ${q.location}`),
    rowsPerQuery,
    totalCalls: queries.length,
  });

  for (const { title: jobTitle, location } of queries) {
    logger.info("Scraping jobs", { jobTitle, location });

    try {
      const run = await client.actor("hMvNSpz3JnHgl5jkh").call(
        {
          position: jobTitle,
          location: location,
          country: "US",
          rows: rowsPerQuery,
          parseCompanyDetails: false,
          saveOnlyUniqueItems: true,
          followApplyRedirects: false,
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

let hasLoggedSampleKeys = false;

function normalizeJob(raw: Record<string, unknown>): ScrapedJob | null {
  // Log the first item's keys so we can debug field mapping
  if (!hasLoggedSampleKeys) {
    hasLoggedSampleKeys = true;
    logger.info("Sample raw job keys", { keys: Object.keys(raw) });
    logger.info("Sample raw job data", {
      sample: JSON.stringify(raw).slice(0, 2000),
    });
  }

  // Indeed scraper uses "positionName" or "position" for title
  const title = String(
    raw.positionName || raw.position || raw.title || raw.jobTitle || ""
  ).trim();
  const company = String(
    raw.company || raw.companyName || raw.organization || raw.employer || ""
  ).trim();
  const location = String(
    raw.location || raw.jobLocation || raw.place || ""
  ).trim();
  const description = String(
    raw.description ||
      raw.descriptionText ||
      raw.descriptionHTML ||
      raw.jobDescription ||
      raw.snippet ||
      ""
  ).trim();
  const url = String(
    raw.url || raw.link || raw.jobUrl || raw.externalApplyLink || ""
  ).trim();

  if (!title || !url) {
    logger.warn("Job skipped — missing title or url", {
      rawTitle: raw.positionName ?? raw.position ?? raw.title ?? "(none)",
      rawUrl: raw.url ?? raw.link ?? "(none)",
      keys: Object.keys(raw).join(", "),
    });
    return null;
  }

  return {
    title,
    company: company || "Unknown Company",
    location,
    description,
    url,
    salary: raw.salary ? String(raw.salary) : undefined,
    postedAt: (raw.postedAt || raw.postingDate || raw.scrapedAt)
      ? String(raw.postedAt || raw.postingDate || raw.scrapedAt)
      : undefined,
    jobType: raw.jobType ? String(raw.jobType) : undefined,
  };
}
