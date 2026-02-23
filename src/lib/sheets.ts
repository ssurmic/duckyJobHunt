import { sheets_v4, auth as gauth } from "@googleapis/sheets";
import { logger } from "@trigger.dev/sdk";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SheetRow {
  date: string;
  company: string;
  role: string;
  location: string;
  salary: string;
  jobType: string;
  matchScore: number;
  matchReason: string;
  status: "Ready to Apply";
  jobUrl: string;
  resumePath: string;
}

// ── Google Sheets Client ─────────────────────────────────────────────────────

function getSheets() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!credentialsJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set");
  }
  if (!sheetId) {
    throw new Error("GOOGLE_SHEET_ID environment variable is not set");
  }

  const credentials = JSON.parse(credentialsJson);
  const authClient = new gauth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = new sheets_v4.Sheets({ auth: authClient });

  return { sheets, sheetId };
}

// ── Initialize Sheet Headers ─────────────────────────────────────────────────

export async function initializeSheet(): Promise<void> {
  try {
    const { sheets, sheetId } = getSheets();

    // Check if headers exist
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!A1:K1",
    });

    const expectedHeaders = [
      "Date",
      "Company",
      "Role",
      "Location",
      "Salary",
      "Job Type",
      "Match Score",
      "Match Reason",
      "Status",
      "Job URL",
      "Resume Path",
    ];

    const currentHeaders = existing.data.values?.[0] ?? [];
    const needsUpdate =
      currentHeaders.length !== expectedHeaders.length ||
      expectedHeaders.some((h, i) => currentHeaders[i] !== h);

    if (needsUpdate) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: "Sheet1!A1:K1",
        valueInputOption: "RAW",
        requestBody: {
          values: [expectedHeaders],
        },
      });
      logger.info("Sheet headers updated", {
        old: currentHeaders,
        new: expectedHeaders,
      });
    }
  } catch (error) {
    logger.warn("Could not initialize sheet headers", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── Append Row ───────────────────────────────────────────────────────────────

export async function appendRow(row: SheetRow): Promise<void> {
  try {
    const { sheets, sheetId } = getSheets();

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Sheet1!A:K",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            row.date,
            row.company,
            row.role,
            row.location,
            row.salary,
            row.jobType,
            row.matchScore,
            row.matchReason,
            row.status,
            row.jobUrl,
            row.resumePath,
          ],
        ],
      },
    });

    logger.info("Row appended to sheet", {
      company: row.company,
      role: row.role,
      status: row.status,
    });
  } catch (error) {
    logger.error("Failed to append row to sheet", {
      company: row.company,
      role: row.role,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw — sheet failures shouldn't crash the pipeline
  }
}

// ── Get Existing Job URLs (for cross-run dedup) ─────────────────────────────

export async function getExistingJobUrls(): Promise<Set<string>> {
  try {
    const { sheets, sheetId } = getSheets();

    // Job URL is column J (10th column)
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!J:J",
    });

    const rows = result.data.values ?? [];
    const urls = new Set<string>();

    // Skip header row (index 0)
    for (let i = 1; i < rows.length; i++) {
      const url = rows[i]?.[0];
      if (url && typeof url === "string" && url.trim()) {
        urls.add(url.trim());
      }
    }

    logger.info("Loaded existing job URLs for dedup", { count: urls.size });
    return urls;
  } catch (error) {
    logger.warn("Could not load existing job URLs — skipping dedup", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Return empty set so pipeline continues without dedup
    return new Set();
  }
}

// ── Append Multiple Rows ─────────────────────────────────────────────────────

export async function appendRows(rows: SheetRow[]): Promise<void> {
  if (rows.length === 0) return;

  try {
    const { sheets, sheetId } = getSheets();

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Sheet1!A:K",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: rows.map((row) => [
          row.date,
          row.company,
          row.role,
          row.location,
          row.salary,
          row.jobType,
          row.matchScore,
          row.matchReason,
          row.status,
          row.jobUrl,
          row.resumePath,
        ]),
      },
    });

    logger.info("Batch rows appended", { count: rows.length });
  } catch (error) {
    logger.error("Failed to batch append rows", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Fallback: try one at a time
    for (const row of rows) {
      await appendRow(row);
    }
  }
}
