# Development Notes

Tracking known issues, fixes, and lessons learned during development. If you pull this repo and run into problems, check here first.

---

## Known Issues & Fixes

### 1. Apify Indeed Scraper — Input Field Name

**Problem**: The Apify actor `hMvNSpz3JnHgl5jkh` (misceres/indeed-scraper) expects `position` as the search term, not `title`. Sending `title` results in the actor searching for random jobs because the search query is undefined.

**Fix**: Use `position` in the actor call input:
```ts
client.actor("hMvNSpz3JnHgl5jkh").call({
  position: jobTitle,  // NOT "title"
  location: location,
  country: "US",
  rows: 10,
});
```

**How we found it**: Actor logs showed `"position undefined"` despite jobs being scraped. The actor was returning random Indeed listings instead of targeted results.

---

### 2. Gemini Model Deprecation

**Problem**: `gemini-2.0-flash` was deprecated for new users, returning 404 errors. The filter silently fell back to score 50 ("AI filter failed — passed through for manual review").

**Fix**: Updated to `gemini-2.5-flash` in `src/lib/filter.ts`.

**Lesson**: Always check the model name if the filter gives every job a score of exactly 50. That means the Gemini call is failing silently.

---

### 3. Google Sheets `googleapis` Package — OOM Crash

**Problem**: The full `googleapis` package (~90MB) causes the Trigger.dev dev worker to crash with "JavaScript heap out of memory".

**Fix**: Use the lightweight `@googleapis/sheets` (~2MB) instead:
```ts
// GOOD
import { sheets_v4, auth as gauth } from "@googleapis/sheets";

// BAD — causes OOM
import { google } from "googleapis";
```

---

### 4. Apify Dataset Locked

**Problem**: If your Apify free plan runs out of monthly credits, datasets return `"dataset-locked"` errors and the scraper returns 0 jobs.

**Fix**: Upgrade Apify billing or wait for monthly reset. Check at [apify.com/billing](https://console.apify.com/billing).

---

### 5. Google Sheet Headers Not Updating

**Problem**: If you change the sheet columns (e.g., add Salary, Job Type), old headers persist because `initializeSheet()` only wrote headers when row 1 was empty.

**Fix**: `initializeSheet()` now compares current headers against expected headers and overwrites if they differ.

---

### 6. Cross-Day Deduplication

**Problem**: The same job postings appear day after day in scraping results. Without dedup, the system would re-process, re-tailor, and re-add the same jobs to the Google Sheet every run.

**Solution**: Before processing, the pipeline reads all existing Job URLs from column J of the Google Sheet (`getExistingJobUrls()`). Any scraped job whose URL is already in the sheet is skipped entirely — no AI filter call, no resume tailoring, no duplicate row.

**How it works**:

1. After scraping, `getExistingJobUrls()` fetches column J from the sheet
2. Scraped jobs are filtered against this set
3. Only new (unseen) jobs proceed to the AI filter + tailor pipeline
4. The summary includes `duplicatesSkipped` and `newJobsProcessed` counts

**Edge case**: If the sheet read fails (permissions, network), the function returns an empty set and the pipeline continues without dedup (safe fallback).

---

## Architecture Decisions

### Why Indeed (not LinkedIn)?

The Apify actor `hMvNSpz3JnHgl5jkh` scrapes **Indeed**, not LinkedIn. Indeed is more reliable to scrape and the actor is well-maintained (17K+ users, 1M+ runs). LinkedIn scrapers tend to break frequently due to aggressive anti-bot measures.

### Why Gemini for Filtering?

Cost. Gemini 2.5 Flash is extremely cheap (~$0.15/M input tokens) and fast enough for a binary pass/fail on job relevance. We use Claude Sonnet only for the expensive resume tailoring step where quality matters.

### Why Local PDF (not Google Drive)?

Simplicity. PDFs are generated locally in `output/resumes/`. For a production deployment, you'd want to upload them to Google Drive or S3 and store the link in the sheet.

---

## Your Knowledge Base (Resume & Profile)

**Everything about you goes in `config/userProfile.ts`.**

This is the single source of truth for:
- Your identity (name, email, LinkedIn, location)
- Target job preferences (titles, seniority, locations, H1B, salary)
- Work experience (company, role, dates, bullet points)
- Skills (categorized)
- Projects
- Education
- Cover letter template

### How to fill it in

1. Open `config/userProfile.ts`
2. Replace all the placeholder values in `defaultProfile` with your real info
3. **Experience bullets matter most** — write 5-10 strong bullets per role. The AI picks the most relevant ones for each job application
4. **Skills should be categorized** — Languages, Frontend, Backend, Infrastructure, etc.
5. **Job titles should be broad** — e.g., `["Software Engineer", "Backend Engineer", "Full Stack Engineer"]` catches more results than just `["Senior Software Engineer"]`

### Tips for good results

- **More experience bullets = better tailoring.** The AI selects and rewrites the most relevant ones per job. Give it 8-10 per role.
- **Include quantified achievements** — "Reduced deploy times by 70%" beats "Improved deployment process"
- **List all relevant skills** — even if they're minor. The AI knows when to highlight them.
- **Cover letter template** — use `{{placeholders}}` for dynamic fields: `{{jobTitle}}`, `{{company}}`, `{{relevantSkills}}`, `{{customParagraph}}`, `{{topAchievement}}`, `{{companyReason}}`, `{{name}}`

### Multi-user support

Each user gets their own config file:
1. Copy `config/userProfile.ts` to `config/user2Profile.ts`
2. Change the `id` field to something unique
3. Create a new trigger task that imports the new profile
4. Each user can have their own cron schedule and Google Sheet

---

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Fill in your .env (copy from .env.example)
cp .env.example .env

# 3. Fill in config/userProfile.ts with your real info

# 4. Start the Trigger.dev dev server
npx trigger dev

# 5. Test with a small run (in the Trigger.dev dashboard, or via MCP)
# Payload: {"maxResults": 3, "jobTitles": ["Software Engineer"], "locations": ["San Francisco, CA"]}
```

---

## Deployment Checklist

- [ ] All API keys in `.env` are valid
- [ ] `config/userProfile.ts` has your real profile (not placeholders)
- [ ] Google Sheet is shared with service account email as Editor
- [ ] Test with `manual-job-hunt` (small run) before deploying
- [ ] Verify Google Sheet gets populated with correct columns
- [ ] Verify filter scores are real numbers (not all 50)
- [ ] Deploy: `npx trigger deploy`
