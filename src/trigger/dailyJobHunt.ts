import { task, schedules, logger, metadata } from "@trigger.dev/sdk";
import { defaultProfile, type UserConfig } from "../../config/userProfile.js";
import { scrapeJobs, type ScrapedJob } from "../lib/scraper.js";
import { filterJob } from "../lib/filter.js";
import { tailorResume } from "../lib/tailor.js";
import { generateResumePdf } from "../lib/pdfGenerator.js";
import { appendRow, initializeSheet, type SheetRow } from "../lib/sheets.js";

// ── Child Task: Process a Single Job ─────────────────────────────────────────

export const processJob = task({
  id: "process-single-job",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15_000,
  },
  run: async (payload: { job: ScrapedJob; userConfig: UserConfig }) => {
    const { job, userConfig } = payload;
    const today = new Date().toISOString().split("T")[0];

    logger.info("Processing job", {
      title: job.title,
      company: job.company,
    });

    // Step 1: Filter
    const filterResult = await filterJob(job, userConfig);

    if (!filterResult.isMatch) {
      logger.info("Job filtered out", {
        title: job.title,
        company: job.company,
        score: filterResult.score,
        reason: filterResult.reason,
      });

      // Still log it to sheets as "Filtered Out"
      await appendRow({
        date: today,
        company: job.company,
        role: job.title,
        location: job.location,
        matchScore: filterResult.score,
        matchReason: filterResult.reason,
        status: "Filtered Out",
        jobUrl: job.url,
        resumePath: "",
      });

      return {
        status: "filtered_out" as const,
        job: `${job.title} @ ${job.company}`,
        score: filterResult.score,
        reason: filterResult.reason,
      };
    }

    // Step 2: Tailor resume
    logger.info("Tailoring resume", {
      title: job.title,
      company: job.company,
      score: filterResult.score,
    });

    const tailored = await tailorResume(job, userConfig);

    // Step 3: Generate PDF
    const sanitizedName = `${userConfig.identity.name.replace(/\s+/g, "_")}_${job.company.replace(/\s+/g, "_")}_${job.title.replace(/\s+/g, "_")}`;
    const pdf = await generateResumePdf(tailored.markdown, sanitizedName);

    // Step 4: Log to Google Sheets
    const sheetRow: SheetRow = {
      date: today,
      company: job.company,
      role: job.title,
      location: job.location,
      matchScore: filterResult.score,
      matchReason: filterResult.reason,
      status: "Ready to Apply",
      jobUrl: job.url,
      resumePath: pdf.filePath,
    };

    await appendRow(sheetRow);

    logger.info("Job processed successfully", {
      title: job.title,
      company: job.company,
      score: filterResult.score,
      resumePath: pdf.filePath,
    });

    return {
      status: "ready_to_apply" as const,
      job: `${job.title} @ ${job.company}`,
      score: filterResult.score,
      resumePath: pdf.filePath,
      coverLetterPreview: tailored.coverLetter.slice(0, 200),
    };
  },
});

// ── Main Scheduled Task: Daily Job Hunt ──────────────────────────────────────

export const dailyJobHunt = schedules.task({
  id: "daily-job-hunt",
  cron: "0 9 * * *", // 9 AM daily (UTC)
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
  },
  run: async (payload) => {
    const startTime = Date.now();
    const userConfig = defaultProfile;

    logger.info("Daily job hunt started", {
      user: userConfig.id,
      name: userConfig.identity.name,
      titles: userConfig.preferences.jobTitles,
      locations: userConfig.preferences.locations,
    });

    metadata.set("status", "scraping");
    metadata.set("user", userConfig.id);

    // Step 1: Initialize Google Sheet headers
    await initializeSheet();

    // Step 2: Scrape jobs
    logger.info("Starting job scrape");
    let jobs: ScrapedJob[];

    try {
      jobs = await scrapeJobs(userConfig.preferences, 20);
    } catch (error) {
      logger.error("Scraping failed completely", {
        error: error instanceof Error ? error.message : String(error),
      });
      metadata.set("status", "failed_scraping");
      return {
        status: "error",
        phase: "scraping",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (jobs.length === 0) {
      logger.warn("No jobs found from scraper");
      metadata.set("status", "no_jobs_found");
      return { status: "no_jobs", jobsFound: 0 };
    }

    logger.info("Jobs scraped", { count: jobs.length });
    metadata.set("status", "processing");
    metadata.set("totalJobs", jobs.length);
    metadata.set("processedJobs", 0);

    // Step 3: Process each job (sequentially to avoid rate limits)
    const results: Array<{
      status: string;
      job: string;
      score?: number;
      error?: string;
    }> = [];

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];

      try {
        const result = await processJob.triggerAndWait({
          job,
          userConfig,
        });

        if (result.ok) {
          results.push(result.output);
        } else {
          logger.error("Job processing child task failed", {
            job: `${job.title} @ ${job.company}`,
            error: String(result.error),
          });
          results.push({
            status: "error",
            job: `${job.title} @ ${job.company}`,
            error: String(result.error),
          });
        }
      } catch (error) {
        logger.error("Unexpected error processing job", {
          job: `${job.title} @ ${job.company}`,
          error: error instanceof Error ? error.message : String(error),
        });
        results.push({
          status: "error",
          job: `${job.title} @ ${job.company}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      metadata.set("processedJobs", i + 1);
      metadata.set(
        "progress",
        Math.round(((i + 1) / jobs.length) * 100)
      );
    }

    // Step 4: Summary
    const readyToApply = results.filter((r) => r.status === "ready_to_apply");
    const filteredOut = results.filter((r) => r.status === "filtered_out");
    const errors = results.filter((r) => r.status === "error");

    const duration = Math.round((Date.now() - startTime) / 1000);

    const summary = {
      status: "completed",
      duration: `${duration}s`,
      totalScraped: jobs.length,
      readyToApply: readyToApply.length,
      filteredOut: filteredOut.length,
      errors: errors.length,
      topMatches: readyToApply
        .filter((r) => r.score !== undefined)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 5)
        .map((r) => ({ job: r.job, score: r.score ?? 0 })),
    };

    metadata.set("status", "completed");
    metadata.set("summary", summary);

    logger.info("Daily job hunt completed", summary);

    return summary;
  },
});

// ── On-Demand Trigger (for manual runs) ──────────────────────────────────────

export const manualJobHunt = task({
  id: "manual-job-hunt",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: {
    userId?: string;
    maxResults?: number;
    jobTitles?: string[];
    locations?: string[];
  }) => {
    const userConfig = { ...defaultProfile };

    // Allow overrides from payload
    if (payload.jobTitles) {
      userConfig.preferences = {
        ...userConfig.preferences,
        jobTitles: payload.jobTitles,
      };
    }
    if (payload.locations) {
      userConfig.preferences = {
        ...userConfig.preferences,
        locations: payload.locations,
      };
    }

    const maxResults = payload.maxResults ?? 10;

    logger.info("Manual job hunt started", {
      jobTitles: userConfig.preferences.jobTitles,
      locations: userConfig.preferences.locations,
      maxResults,
    });

    // Initialize sheet
    await initializeSheet();

    // Scrape
    const jobs = await scrapeJobs(userConfig.preferences, maxResults);

    if (jobs.length === 0) {
      return { status: "no_jobs", jobsFound: 0 };
    }

    // Process each job
    const results = [];

    for (const job of jobs) {
      try {
        const result = await processJob.triggerAndWait({
          job,
          userConfig,
        });

        if (result.ok) {
          results.push(result.output);
        } else {
          results.push({
            status: "error",
            job: `${job.title} @ ${job.company}`,
          });
        }
      } catch (error) {
        results.push({
          status: "error",
          job: `${job.title} @ ${job.company}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const readyToApply = results.filter((r) => r.status === "ready_to_apply");

    return {
      status: "completed",
      totalScraped: jobs.length,
      readyToApply: readyToApply.length,
      results,
    };
  },
});
