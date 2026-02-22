import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@trigger.dev/sdk";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PdfResult {
  filePath: string;
  fileName: string;
  bytes: Uint8Array;
}

// ── Config ───────────────────────────────────────────────────────────────────

const OUTPUT_DIR = join(process.cwd(), "output", "resumes");
const PAGE_MARGIN = 50;
const LINE_HEIGHT = 14;
const HEADING_SIZE = 16;
const SUBHEADING_SIZE = 12;
const BODY_SIZE = 10;
const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MAX_TEXT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

// ── PDF Generator ────────────────────────────────────────────────────────────

export async function generateResumePdf(
  markdownContent: string,
  fileName: string
): Promise<PdfResult> {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let yPosition = PAGE_HEIGHT - PAGE_MARGIN;

  const lines = markdownContent.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines but add spacing
    if (!trimmed) {
      yPosition -= LINE_HEIGHT * 0.5;
      if (yPosition < PAGE_MARGIN) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        yPosition = PAGE_HEIGHT - PAGE_MARGIN;
      }
      continue;
    }

    // Horizontal rule
    if (trimmed === "---" || trimmed === "***") {
      yPosition -= 4;
      page.drawLine({
        start: { x: PAGE_MARGIN, y: yPosition },
        end: { x: PAGE_WIDTH - PAGE_MARGIN, y: yPosition },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      yPosition -= LINE_HEIGHT;
      continue;
    }

    // Determine style
    let font = helvetica;
    let fontSize = BODY_SIZE;
    let extraSpacing = 0;
    let text = trimmed;

    if (trimmed.startsWith("# ")) {
      text = trimmed.slice(2);
      font = helveticaBold;
      fontSize = HEADING_SIZE;
      extraSpacing = 4;
    } else if (trimmed.startsWith("## ")) {
      text = trimmed.slice(3);
      font = helveticaBold;
      fontSize = SUBHEADING_SIZE;
      extraSpacing = 6;
    } else if (trimmed.startsWith("### ")) {
      text = trimmed.slice(4);
      font = helveticaBold;
      fontSize = BODY_SIZE + 1;
      extraSpacing = 4;
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      text = `  •  ${trimmed.slice(2)}`;
    }

    // Strip inline markdown (**bold**, *italic*, etc.)
    text = text.replace(/\*\*(.*?)\*\*/g, "$1");
    text = text.replace(/\*(.*?)\*/g, "$1");
    text = text.replace(/`(.*?)`/g, "$1");

    // Word-wrap long lines
    const wrappedLines = wrapText(text, font, fontSize, MAX_TEXT_WIDTH);

    yPosition -= extraSpacing;

    for (const wl of wrappedLines) {
      if (yPosition < PAGE_MARGIN + LINE_HEIGHT) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        yPosition = PAGE_HEIGHT - PAGE_MARGIN;
      }

      page.drawText(wl, {
        x: PAGE_MARGIN,
        y: yPosition,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });

      yPosition -= LINE_HEIGHT;
    }
  }

  // Save
  const pdfBytes = await doc.save();
  const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fullFileName = `${safeName}.pdf`;
  const filePath = join(OUTPUT_DIR, fullFileName);

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(filePath, pdfBytes);

  logger.info("PDF generated", { filePath, size: pdfBytes.length });

  return {
    filePath,
    fileName: fullFileName,
    bytes: pdfBytes,
  };
}

// ── Word Wrap Helper ─────────────────────────────────────────────────────────

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  fontSize: number,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);

    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}
