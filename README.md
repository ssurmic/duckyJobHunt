# Ducky Job Hunt

Automated job application engine powered by Trigger.dev v4, Apify, and Anthropic Claude.

Scrapes job listings daily, AI-filters for relevance, generates tailored resumes as PDFs, and tracks everything in Google Sheets.

## Architecture

```
┌─────────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌──────────────┐
│  Cron 9AM   │───▶│  Apify   │───▶│ Claude Haiku │───▶│  Claude  │───▶│ Google Sheet │
│ (Trigger.dev│    │ Scraper  │    │  (Filter)    │    │  Sonnet  │    │   + PDF      │
│  Scheduler) │    │          │    │  Pass/Fail   │    │ (Tailor) │    │              │
└─────────────┘    └──────────┘    └──────────────┘    └──────────┘    └──────────────┘
```

**Flow**: Schedule → Scrape → Filter (cheap) → Tailor (quality) → PDF → Sheet

## Setup

### 1. Clone and install

```bash
git clone <this-repo>
cd duckyJobHunt
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in your `.env`:

| Variable | Where to get it |
|----------|----------------|
| `TRIGGER_SECRET_KEY` | [Trigger.dev Dashboard](https://cloud.trigger.dev) → Project → API Keys |
| `APIFY_TOKEN` | [Apify Console](https://console.apify.com/account/integrations) |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/settings/keys) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud Console → IAM → Service Accounts → Keys → JSON (paste as single line) |
| `GOOGLE_SHEET_ID` | From your Sheet URL: `https://docs.google.com/spreadsheets/d/{THIS_ID}/edit` |

### 3. Configure your profile

Edit `config/userProfile.ts` and fill in:
- Your identity (name, email, LinkedIn)
- Job preferences (titles, locations, salary)
- Full experience with detailed bullet points
- Projects and skills
- Cover letter template

### 4. Google Sheets setup

1. Create a new Google Sheet
2. Share it with your service account email (the `client_email` from your JSON key)
3. Copy the Sheet ID from the URL into `.env`

## Running

### Local development

```bash
npx trigger.dev@latest dev
```

This starts the Trigger.dev dev server. The scheduled task runs at 9 AM UTC daily, or you can trigger `manual-job-hunt` from the dashboard for testing.

### Manual trigger (from Trigger.dev dashboard)

Go to your project dashboard → Tasks → `manual-job-hunt` → Test.

Example payload:
```json
{
  "maxResults": 5,
  "jobTitles": ["Software Engineer"],
  "locations": ["Remote"]
}
```

### Deploy to production

```bash
npx trigger.dev@latest deploy
```

## Project Structure

```
duckyJobHunt/
├── config/
│   └── userProfile.ts      # Your profile, preferences, experience
├── src/
│   ├── lib/
│   │   ├── scraper.ts       # Apify LinkedIn jobs scraper wrapper
│   │   ├── filter.ts        # Claude Haiku — fast job matching
│   │   ├── tailor.ts        # Claude Sonnet — resume customization
│   │   ├── sheets.ts        # Google Sheets read/write
│   │   └── pdfGenerator.ts  # Markdown → PDF via pdf-lib
│   └── trigger/
│       └── dailyJobHunt.ts  # Trigger.dev tasks & scheduled workflow
├── trigger.config.ts        # Trigger.dev project config
├── .env.example             # Environment template
└── README.md
```

## Tasks

| Task ID | Type | Description |
|---------|------|-------------|
| `daily-job-hunt` | Scheduled (cron) | Runs at 9 AM UTC daily. Full pipeline. |
| `manual-job-hunt` | On-demand | Manual trigger with payload overrides. |
| `process-single-job` | Child task | Processes one job (filter → tailor → PDF → sheet). |

## Adding another user

1. Create a new profile in `config/` (e.g., `config/user2Profile.ts`)
2. Import it in the trigger file or create a new scheduled task pointing to that profile
3. Each user gets their own cron schedule and Google Sheet

## Cost estimates (per run of 20 jobs)

| Service | Usage | ~Cost |
|---------|-------|-------|
| Apify | ~2-3 actor runs | $0.01-0.05 |
| Claude Haiku (filter) | ~20 calls × 1K tokens | ~$0.005 |
| Claude Sonnet (tailor) | ~5-10 calls × 4K tokens | ~$0.15-0.30 |
| Trigger.dev | Task execution time | Free tier / usage-based |

**Total**: ~$0.20-0.40 per daily run.
