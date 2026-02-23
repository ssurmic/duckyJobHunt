# Ducky Job Hunt

Automated job **discovery and resume tailoring** pipeline. Scrapes Indeed daily, AI-filters jobs against your profile, generates a custom resume + cover letter for each match, and tracks everything in Google Sheets.

**This does NOT auto-apply.** It does the grunt work — finding relevant jobs and writing tailored resumes — so you just review and click "Apply" yourself.

---

## How It Works

```text
                          DUCKY JOB HUNT — DAILY PIPELINE
                          ================================

  ┌──────────────────────────────────────────────────────────────────────┐
  │                        TRIGGER.DEV (Orchestrator)                   │
  │                     Runs daily at 9 AM UTC via cron                 │
  │                                                                     │
  │  ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────┐  │
  │  │  STEP 1 │    │   STEP 2    │    │   STEP 3    │    │ STEP 4  │  │
  │  │  Scrape │───▶│   Filter    │───▶│   Tailor    │───▶│  Output │  │
  │  └────┬────┘    └──────┬──────┘    └──────┬──────┘    └────┬────┘  │
  │       │                │                  │                │       │
  └───────┼────────────────┼──────────────────┼────────────────┼───────┘
          │                │                  │                │
          ▼                ▼                  ▼                ▼
    ┌───────────┐   ┌────────────┐   ┌──────────────┐  ┌────────────┐
    │   APIFY   │   │  GEMINI    │   │  ANTHROPIC   │  │   GOOGLE   │
    │           │   │  2.5 Flash │   │  Claude      │  │   SHEETS   │
    │ Indeed    │   │            │   │  Sonnet 4    │  │            │
    │ Jobs      │   │ "Is this   │   │              │  │ Tracking   │
    │ Scraper   │   │  a fit?"   │   │ "Write a     │  │ spreadsheet│
    │           │   │            │   │  tailored    │  │ + PDF link │
    │ Returns   │   │ Score 0-100│   │  resume"     │  │            │
    │ ~20 jobs  │   │ Pass >= 60 │   │              │  │ "Ready to  │
    │           │   │ Fail < 60  │   │ Returns MD   │  │  Apply"    │
    └───────────┘   └────────────┘   │ resume +     │  └────────────┘
                                     │ cover letter │
                         ┌───────┐   └──────────────┘
                         │PDF-LIB│
                         │       │
                         │ MD →  │
                         │ PDF   │
                         └───────┘
```

### Pipeline Detail

```text
 20 raw jobs            ~8-12 pass filter         ~8-12 tailored PDFs
      │                       │                          │
      ▼                       ▼                          ▼
 ┌─────────┐  discard   ┌──────────┐  generate    ┌──────────┐
 │ Scrape  │───(no)────▶│  Filter  │───(yes)─────▶│  Tailor  │──▶ PDF + Sheet Row
 │ (Apify) │            │ (Gemini) │              │ (Claude) │
 └─────────┘            └──────────┘              └──────────┘
                         ~8 rejected                 per job:
                         (silently                   - Custom resume
                          skipped)                   - Cover letter
                                                     - Match score
```

### What Ends Up in Google Sheets

| Date       | Company        | Role                 | Location           | Salary      | Job Type  | Score | Reason                 | Status         | Job URL | Resume PDF  |
|------------|----------------|----------------------|--------------------|-------------|-----------|-------|------------------------|----------------|---------|-------------|
| 2026-02-22 | Stripe         | Sr. Software Engineer| San Francisco, CA  | $180K-$260K | Full-time | 85    | Strong skills match    | Ready to Apply | link    | /output/... |
| 2026-02-22 | Datadog        | Backend Engineer     | New York, NY       | -           | Full-time | 72    | Strong skills alignment| Ready to Apply | link    | /output/... |

---

## Setup Guide — All API Keys, Step by Step

You need **5 credentials** from **4 services**. Each section below walks through every click.

---

### 1. Trigger.dev — `TRIGGER_SECRET_KEY`

**What it does**: Trigger.dev is the workflow orchestration engine. It runs your scrape/filter/tailor pipeline on a schedule and manages retries, logging, and task queues.

**Pricing**: Free tier available. Pay-as-you-go after that.

**Steps:**

1. Open your browser and go to **[cloud.trigger.dev](https://cloud.trigger.dev)**
2. Click **"Sign up"** (GitHub or email — GitHub is fastest)
3. Once logged in, you'll land on the **Dashboard**
4. Click **"New Project"** in the top-left
5. Give it a name (e.g., `ducky-job-hunt`) and click **Create**
6. You'll be taken to the project overview. Look at the left sidebar
7. Click **"Environment Variables"** in the sidebar (or go to Project Settings)
8. You'll see your **Development** environment listed
9. Find the **"Secret Key"** — it starts with `tr_dev_`
10. Click the **copy icon** next to it
11. Paste it into your `.env` file as:

    ```text
    TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxxxxxxxxxx
    ```

> **Note**: There are separate keys for `dev`, `staging`, and `prod` environments. Use `tr_dev_` for local development. When you deploy, you'll use `tr_prod_`.

---

### 2. Apify — `APIFY_TOKEN`

**What it does**: Apify is a web scraping platform. We use their hosted Indeed Jobs Scraper actor to pull job listings without maintaining any browser automation ourselves.

**Pricing**: Free tier gives **$5/month** in platform credits (~1,000 scraper runs). More than enough for daily use.

**Steps:**

1. Go to **[apify.com](https://apify.com)** and click **"Sign up free"**
2. Sign up with Google, GitHub, or email
3. After signing in, you'll land on the Apify Console dashboard
4. Click your **profile avatar** (top-right corner)
5. Click **"Settings"** from the dropdown menu
6. In the left sidebar of Settings, click **"Integrations"**
7. You'll see a section called **"API token"**
8. Your personal API token is displayed here — it starts with `apify_api_`
9. Click the **copy button** next to it
10. Paste it into your `.env` file as:

    ```text
    APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxx
    ```

> **Verify it works**: After setup, you can visit [console.apify.com/actors](https://console.apify.com/actors) and search for "Indeed Scraper" to see the actor we use. No need to configure it — the code handles that.

---

### 3. Google Gemini — `GEMINI_API_KEY`

**What it does**: Gemini 2.5 Flash is Google's fast, cheap AI model. We use it for the job filtering step — it reads each job description and your profile, then scores whether the job is a good fit (0-100). At $0.10 per million input tokens, it costs fractions of a penny per run.

**Pricing**: Free tier gives **1,500 requests/day**. More than enough.

**Steps:**

1. Go to **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**
2. Sign in with your Google account if prompted
3. You'll see the **"API Keys"** page in Google AI Studio
4. Click the blue **"Create API Key"** button
5. A dialog will ask you to select a Google Cloud project:
   - If you already have a project, select it
   - If not, click **"Create API key in new project"** — Google will auto-create one
6. Your API key will appear on screen — it starts with `AIzaSy`
7. Click the **copy icon** next to it
8. Paste it into your `.env` file as:

    ```text
    GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxx
    ```

> **Security note**: This key has no usage cap by default on the paid tier. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) to set a daily quota limit if you want to prevent accidental overspend.

---

### 4. Anthropic — `ANTHROPIC_API_KEY`

**What it does**: Claude Sonnet 4 by Anthropic is used for the high-quality step — reading a job description and your full work history, then generating a tailored resume and cover letter. This is where the real value is, so we use a premium model.

**Pricing**: Pay-per-use. ~$3/M input tokens, ~$15/M output tokens. Each resume costs ~$0.02-0.04.

**Steps:**

1. Go to **[console.anthropic.com](https://console.anthropic.com)**
2. Click **"Sign up"** if you don't have an account (email + phone verification)
3. After signing in, you'll land on the Console dashboard
4. Click **"Settings"** in the left sidebar (gear icon at bottom)
5. Click **"API Keys"** in the Settings menu
6. Click the **"Create Key"** button (top-right)
7. Give it a name (e.g., `ducky-job-hunt`) and click **Create**
8. Your key will be shown **once** — it starts with `sk-ant-api03-`
9. **Copy it immediately** (you cannot see it again after closing the dialog)
10. Paste it into your `.env` file as:

    ```text
    ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxx
    ```

> **Important**: You need to add credits to your account before the API works. Go to **Settings → Billing → Add Credits**. $5-10 is enough for months of use.

---

### 5. Google Sheets — `GOOGLE_SERVICE_ACCOUNT_JSON` + `GOOGLE_SHEET_ID`

**What it does**: Google Sheets acts as your application tracker. Every time the pipeline processes a job, it adds a row with the company name, role, match score, status ("Ready to Apply" or "Filtered Out"), and a link to your generated PDF resume.

**Pricing**: Completely free.

This is the most involved setup because it requires Google Cloud configuration. Follow each step carefully.

#### Part A: Enable the Google Sheets API

1. Go to **[console.cloud.google.com](https://console.cloud.google.com)**
2. Sign in with your Google account
3. At the top of the page, you'll see a project selector dropdown (next to "Google Cloud")
4. **If you already have a project** from the Gemini step: select it
5. **If not**: Click the dropdown → **"New Project"** → Name it (e.g., `ducky-job-hunt`) → **Create**
6. Make sure your project is selected in the top dropdown
7. In the left sidebar, click **"APIs & Services"** (you may need to click the hamburger menu ☰ first)
8. Click **"Library"** in the APIs & Services submenu
9. In the search bar, type **"Google Sheets API"**
10. Click on **"Google Sheets API"** in the results
11. Click the blue **"Enable"** button
12. Wait for it to activate (takes a few seconds)

#### Part B: Create a Service Account

1. Still in the Google Cloud Console, go to the left sidebar
2. Click **"IAM & Admin"** → **"Service Accounts"**
3. Click **"+ Create Service Account"** at the top
4. Fill in the details:
   - **Service account name**: `ducky-sheets` (or anything you want)
   - **Service account ID**: auto-fills (e.g., `ducky-sheets@your-project.iam.gserviceaccount.com`)
   - **Description**: optional
5. Click **"Create and Continue"**
6. **Skip** the "Grant this service account access" step — click **"Continue"**
7. **Skip** the "Grant users access" step — click **"Done"**
8. You'll see your new service account in the list

#### Part C: Download the JSON Key

1. In the Service Accounts list, click on the service account you just created
2. Click the **"Keys"** tab at the top
3. Click **"Add Key"** → **"Create new key"**
4. Select **"JSON"** and click **"Create"**
5. A `.json` file will download to your computer automatically
6. Open the downloaded file in a text editor
7. **Copy the entire contents** (it's one JSON object with fields like `type`, `project_id`, `private_key`, etc.)
8. Paste it into your `.env` file as a **single line** (no line breaks):

    ```text
    GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"your-project","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEv...etc\n-----END PRIVATE KEY-----\n","client_email":"ducky-sheets@your-project.iam.gserviceaccount.com","client_id":"123456","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/ducky-sheets%40your-project.iam.gserviceaccount.com"}
    ```

> **Tip**: Most text editors have a "Join Lines" or "Remove Line Breaks" feature. In VS Code, select all the JSON text and use `Ctrl+J` / `Cmd+J` to join lines.

#### Part D: Create and Share Your Google Sheet

1. Go to **[sheets.google.com](https://sheets.google.com)**
2. Click **"+ Blank spreadsheet"** to create a new sheet
3. Name it something like **"Ducky Job Hunt Tracker"**
4. Look at the URL in your browser. It looks like:

    ```text
    https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit
                                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                            This is your GOOGLE_SHEET_ID
    ```

5. Copy that long string between `/d/` and `/edit`
6. Paste it into your `.env` file as:

    ```text
    GOOGLE_SHEET_ID=1aBcDeFgHiJkLmNoPqRsTuVwXyZ
    ```

7. Now **share the sheet** with your service account:
   - Click the green **"Share"** button (top-right of the sheet)
   - In the "Add people" field, paste the **service account email**
   - This email is in your downloaded JSON file under `client_email` — it looks like `ducky-sheets@your-project.iam.gserviceaccount.com`
   - Set permission to **"Editor"**
   - Uncheck "Notify people" (it's a bot, not a person)
   - Click **"Share"**

> **Verify**: The first time the pipeline runs, it will automatically create headers in Row 1: Date, Company, Role, Location, Match Score, Match Reason, Status, Job URL, Resume Path.

---

## Your `.env` File (Complete)

After completing all the steps above, your `.env` should look like this:

```bash
# Trigger.dev
TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxxxxxxxxxx

# Apify
APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxx

# Gemini (cheap filtering)
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxx

# Anthropic (resume tailoring)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxx

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"...@...iam.gserviceaccount.com",...}
GOOGLE_SHEET_ID=1aBcDeFgHiJkLmNoPqRsTuVwXyZ
```

---

## Quick Start (After Keys Are Set)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up your knowledge base (resume & profile)

Your entire professional profile lives in **one file**: **`config/userProfile.ts`**.

This is the single source of truth the AI uses to filter jobs and tailor resumes. There are no Google Docs, no external databases — just this TypeScript file. When you clone this repo, the file has example data. You **must** replace it with your real info before running the pipeline.

#### Fastest way: let AI do it

Copy this prompt into **Claude Code, Cursor, Copilot, or any AI coding assistant** and paste your resume text after it:

```text
Read config/userProfile.ts in this project. Replace the defaultProfile with my real
information extracted from the resume below. Keep the Zod schema and TypeScript structure
unchanged. For each experience entry, write 3-5 strong, quantified bullet points.

After filling in the profile, ask me about:
- Target job titles (what roles I'm looking for)
- Preferred locations (cities + Remote?)
- Companies to blacklist (already applied, current employer, etc.)
- Whether I need H1B visa sponsorship
- Minimum salary threshold

Then validate the profile by running: npx tsx --eval "import { validateUserConfig, defaultProfile } from './config/userProfile.ts'; console.log(validateUserConfig(defaultProfile));"

Here is my resume:
<PASTE YOUR RESUME TEXT, LATEX SOURCE, OR DESCRIBE YOUR BACKGROUND HERE>
```

The AI will read the Zod schema, parse your resume, fill in every field, and validate it compiles. You just answer the 5 preference questions at the end.

#### Manual setup — field-by-field guide

**`identity`** — Your contact info (resume header + cover letter signature)

| Field | Example | Notes |
| ----- | ------- | ----- |
| `name` | `"Jane Doe"` | Full legal name |
| `email` | `"jane@example.com"` | Primary email |
| `phone` | `"+1-555-123-4567"` | Optional |
| `linkedinUrl` | `"https://linkedin.com/in/janedoe"` | Required |
| `portfolioUrl` | `"https://janedoe.dev"` | Optional |
| `location` | `"San Francisco, CA"` | Current city |

**`preferences`** — Controls what jobs are scraped and how they're filtered

| Field | Example | What it does |
| ----- | ------- | ------------ |
| `jobTitles` | `["Software Engineer", "Backend Engineer"]` | Search queries sent to Indeed. Broader = more results |
| `seniority` | `["Mid", "Senior", "Staff"]` | AI rejects jobs outside these levels (e.g., skips "Junior" or "Intern") |
| `locations` | `["San Francisco, CA", "Remote"]` | Indeed search locations. One per job title (round-robin) |
| `remoteOnly` | `false` | If `true`, AI penalizes non-remote jobs |
| `requireH1bSponsorship` | `true` | If `true`, jobs that say "no sponsorship" get scored 0 automatically |
| `minSalary` | `120000` | AI checks against posted salary range |
| `maxJobAgeDays` | `7` | How recent the posting should be |
| `blacklistedCompanies` | `["Amazon", "Meta"]` | Filtered **before** AI calls — saves money. Case-insensitive substring match |

**`experience`** — Your work history (most important for tailoring quality)

```ts
{
  company: "Acme Inc.",
  role: "Senior Software Engineer",
  startDate: "2022-01",
  endDate: "Present",     // or "2024-06"
  bullets: [
    "Led migration of monolithic API to microservices, reducing deploy times by 70%",
    "Built data pipeline processing 2M+ events/day using Kafka and TypeScript",
    // ... 5-10 bullets per role. The AI picks the best ones per job.
  ],
}
```

**Write 5-10 strong bullets per role.** The AI selects and lightly rewords the most relevant ones for each job application. More bullets = better tailoring. Quantify everything.

**`skills`** — Categorized skill list

```ts
{ category: "Languages", items: ["TypeScript", "Python", "Go", "SQL"] },
{ category: "Frontend", items: ["React", "Next.js", "Tailwind CSS"] },
{ category: "Backend", items: ["Node.js", "FastAPI", "GraphQL"] },
{ category: "Infrastructure", items: ["AWS", "Docker", "Kubernetes", "Terraform"] },
```

List everything, even minor skills. The AI knows when to highlight them based on the job description.

**`projects`** — Side projects, open source, hackathons

```ts
{ name: "My CLI Tool", description: "Developer productivity CLI with 500+ GitHub stars", technologies: ["TypeScript", "Node.js"], url: "https://github.com/you/tool" }
```

**`education`** — Degrees

```ts
{ institution: "UC Berkeley", degree: "B.S.", field: "Computer Science", graduationDate: "2020" }
```

**`coverLetterTemplate`** — Template with `{{placeholders}}`

Available placeholders: `{{jobTitle}}`, `{{company}}`, `{{name}}`, `{{relevantSkills}}`, `{{customParagraph}}`, `{{topAchievement}}`, `{{companyReason}}`. The AI fills these in per job.

#### Tips for best results

- **More experience bullets = better tailoring.** Give the AI 8-10 per role to choose from
- **Quantify achievements**: "Reduced deploy times by 70%" beats "Improved deployment process"
- **Broad job titles**: `["Software Engineer", "Backend Engineer", "Full Stack Engineer"]` catches more results than just `["Senior Software Engineer"]`
- **List all skills**, even minor ones — the AI knows when to highlight them
- **Blacklist strategically**: Companies you have referrals for, already applied to, or just don't want

### 3. Set your Trigger.dev project ref

Open `trigger.config.ts` and replace the placeholder with your actual project ref from the Trigger.dev dashboard:

```ts
export default defineConfig({
  project: "proj_YOUR_PROJECT_REF", // ← paste your project ref here
  // ...
});
```

You can find this in **[cloud.trigger.dev](https://cloud.trigger.dev)** → your project → Settings.

### 4. Run locally

```bash
npx trigger.dev@latest dev
```

This starts the Trigger.dev dev server and connects to the cloud dashboard. You'll see a link to the dashboard in the terminal output.

### 5. Test with a small run

Go to the Trigger.dev dashboard (link shown in terminal) → **Tasks** → **`manual-job-hunt`** → **Test**

Use this payload:

```json
{
  "maxResults": 3,
  "jobTitles": ["Software Engineer"],
  "locations": ["Remote"]
}
```

This will scrape 3 jobs, filter them, and generate tailored resumes for matches. Check the run trace in the dashboard to verify each step completes successfully.

**What to verify on first run:**

- Apify scraper returns jobs (not 0)
- Filter scores are real numbers (not all 50 — that means Gemini is failing)
- Google Sheet gets rows with "Ready to Apply" status
- PDFs appear in `output/resumes/`

### 6. Deploy to production

```bash
npx trigger.dev@latest deploy
```

> **Before deploying**: Add all 5 environment variables (APIFY_TOKEN, GEMINI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID) to your **Production** environment in the Trigger.dev dashboard under **Environment Variables**. The `TRIGGER_SECRET_KEY` in `.env` is only for local dev — production uses its own key.

Once deployed, the `daily-job-hunt` task fires at **9 AM UTC every day** automatically. Check your Google Sheet each morning for new "Ready to Apply" rows.

---

## Project Structure

```text
duckyJobHunt/
├── config/
│   └── userProfile.ts        # YOUR profile — identity, experience, skills, preferences
│
├── src/
│   ├── lib/
│   │   ├── scraper.ts         # Apify wrapper — fetches Indeed jobs
│   │   ├── filter.ts          # Gemini 2.5 Flash — fast pass/fail scoring
│   │   ├── tailor.ts          # Claude Sonnet 4 — generates custom resume + cover letter
│   │   ├── pdfGenerator.ts    # Converts markdown resume → PDF file
│   │   └── sheets.ts          # Appends results to Google Sheets
│   │
│   └── trigger/
│       └── dailyJobHunt.ts    # Trigger.dev tasks (scheduled + manual + child)
│
├── output/
│   └── resumes/               # Generated PDFs land here (gitignored)
│
├── trigger.config.ts          # Trigger.dev v4 project config
├── .env                       # Your API keys (gitignored, never committed)
├── .env.example               # Template for .env
└── package.json
```

## Tasks

| Task ID              | Type            | Description                                        |
|----------------------|-----------------|----------------------------------------------------|
| `daily-job-hunt`     | Cron (9 AM UTC) | Full pipeline: scrape, filter, tailor, PDF, sheet  |
| `manual-job-hunt`    | On-demand       | Same pipeline but triggered manually with overrides|
| `process-single-job` | Child task      | Handles one job: filter, tailor, PDF, sheet row    |

## End-to-End Workflow (What Happens Each Day)

1. **9 AM UTC** — Trigger.dev fires the `daily-job-hunt` cron task
2. **Scrape** — Apify searches Indeed for each of your `jobTitles` + `locations` (round-robin), returning ~20 raw listings. Companies in `blacklistedCompanies` are filtered out here (before any AI calls)
3. **Dedup** — The pipeline reads all existing Job URLs from your Google Sheet. Any job already in the sheet is skipped entirely — no AI calls wasted
4. **Filter** — Each new job is scored 0-100 by Gemini 2.5 Flash against your profile (skills, seniority, H1B, salary). Jobs scoring below 60 are silently skipped
5. **Tailor** — For each passing job, Claude Sonnet 4 reads the full job description + your complete work history and generates a custom resume (markdown) + cover letter with the most relevant experience bullets
6. **PDF** — The tailored markdown resume is converted to a formatted PDF saved in `output/resumes/`
7. **Track** — A row is appended to Google Sheets: date, company, role, location, salary, job type, match score, match reason, status ("Ready to Apply"), job URL, resume path
8. **Done** — You open your spreadsheet, review the matches, and apply with the pre-tailored resume

**You review and apply manually.** The system handles discovery and resume generation only.

## Error Resilience

The pipeline is designed so that **no single job failure crashes the entire run**:

- If **Apify scraping** fails → the run stops early and reports the error, but no partial data is written
- If **Google Sheet dedup** fails → the pipeline continues without dedup (safe fallback)
- If **Gemini filtering** fails for a job → that job passes through with score 50 for manual review
- If **Claude resume tailoring** fails for a job → the job is still logged to the sheet with `TAILOR_FAILED` so you can apply manually
- If **PDF generation** fails → the job is still logged with `PDF_FAILED` and you get the match score + cover letter
- If **Google Sheets write** fails → the task logs the error but doesn't throw

Each job is processed as an independent child task with its own retry policy (2 attempts with exponential backoff).

## Adding Another User

1. Create `config/user2Profile.ts` with their info (copy `userProfile.ts` as a template)
2. Create a new scheduled task in `src/trigger/` that imports the new profile
3. Each user gets their own cron schedule, Google Sheet, and preferences

## Cost Per Daily Run (~20 jobs scraped)

| Service        | What it does                   | ~Cost            |
|----------------|--------------------------------|------------------|
| Apify          | Scrape ~20 Indeed jobs         | $0.01-0.05       |
| Gemini Flash   | Filter all 20 jobs (pass/fail) | ~$0.0005         |
| Claude Sonnet  | Tailor ~8-12 matching resumes  | ~$0.15-0.30      |
| Trigger.dev    | Orchestration                  | Free tier        |
| **Total**      |                                | **~$0.20-0.35/day**|

That's roughly **$6-10/month** to auto-generate tailored resumes every morning.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `APIFY_TOKEN is not set` | Check your `.env` file has the token, restart dev server |
| `GEMINI_API_KEY is not set` | Make sure the key is in `.env` (no spaces around `=`) |
| Apify scraper returns 0 jobs | Check Apify billing (free tier may be exhausted); try broader job titles |
| Google Sheets "permission denied" | Make sure you shared the sheet with the service account email as Editor |
| `GOOGLE_SERVICE_ACCOUNT_JSON` parse error | The JSON must be on a **single line** in `.env` with no line breaks |
| All filter scores are exactly 50 | The Gemini model may be deprecated — check `DEVELOPMENT.md` for the current model name |
| Claude returns garbled JSON | The tailor has a fallback — it generates a basic resume instead of crashing |
| Trigger.dev can't connect | Make sure `TRIGGER_SECRET_KEY` matches your project and environment |
| Wrong/random jobs scraped | The Apify actor expects `position` (not `title`) as the search field — see `DEVELOPMENT.md` |

For a full list of known issues and fixes, see **[DEVELOPMENT.md](DEVELOPMENT.md)**.
