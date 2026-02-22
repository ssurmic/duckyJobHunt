import { google } from "googleapis";
import { logger } from "@trigger.dev/sdk";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SheetRow {
  date: string;
  company: string;
  role: string;
  location: string;
  matchScore: number;
  matchReason: string;
  status: "Ready to Apply" | "Filtered Out" | "Error";
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
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return {
    sheets: google.sheets({ version: "v4", auth }),
    sheetId,
  };
}

// ── Initialize Sheet Headers ─────────────────────────────────────────────────

export async function initializeSheet(): Promise<void> {
  try {
    const { sheets, sheetId } = getSheets();

    // Check if headers exist
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!A1:I1",
    });

    if (!existing.data.values || existing.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: "Sheet1!A1:I1",
        valueInputOption: "RAW",
        requestBody: {
          values: [
            [
              "Date",
              "Company",
              "Role",
              "Location",
              "Match Score",
              "Match Reason",
              "Status",
              "Job URL",
              "Resume Path",
            ],
          ],
        },
      });
      logger.info("Sheet headers initialized");
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
      range: "Sheet1!A:I",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            row.date,
            row.company,
            row.role,
            row.location,
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

// ── Append Multiple Rows ─────────────────────────────────────────────────────

export async function appendRows(rows: SheetRow[]): Promise<void> {
  if (rows.length === 0) return;

  try {
    const { sheets, sheetId } = getSheets();

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Sheet1!A:I",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: rows.map((row) => [
          row.date,
          row.company,
          row.role,
          row.location,
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
