/**
 * POST /api/bulk/courses/upload
 * CSV columns: code, title, credit_hours, is_scoring (optional)
 */

import { type NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/config";
import { can } from "@/lib/auth/permissions";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { z } from "zod";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2_000;

const rowSchema = z.object({
  code: z.string().min(1, "Course code is required").max(50),
  title: z.string().min(1, "Course title is required").max(255),
  creditHours: z.coerce
    .number({
      invalid_type_error: "credit_hours must be a whole number (e.g. 2, 3, 6)",
    })
    .int("credit_hours must be a whole number — no decimals")
    .min(1, "credit_hours must be at least 1"),
  isScoring: z.string().transform((v) => v.toLowerCase() !== "false"),
  category: z
    .enum(["OSIS_OLD", "OSIS_NEW", "ITS", "OSIS_2"])
    .default("OSIS_NEW"),
});

function friendlyColError(field: string, raw: string, msg: string): string {
  const labels: Record<string, string> = {
    code: "code column",
    title: "title column",
    creditHours: "credit_hours column",
    isScoring: "is_scoring column",
  };
  return `${labels[field] ?? field} "${raw || "(empty)"}" — ${msg}`;
}

/**
 * Parse a single CSV line respecting quoted fields.
 * Handles commas inside quotes and escaped quotes ("").
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside a quoted field
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session, "manage_courses"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart/form-data file upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json(
      { error: "No file was attached. Please select a CSV file." },
      { status: 400 },
    );
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      {
        error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`,
      },
      { status: 413 },
    );
  if (!file.name.toLowerCase().endsWith(".csv"))
    return NextResponse.json(
      {
        error:
          "Only CSV files are accepted. In Excel: File → Save As → CSV UTF-8.",
      },
      { status: 400 },
    );

  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2)
    return NextResponse.json(
      {
        error:
          "The CSV has no data rows. Add course data below the header row.",
      },
      { status: 400 },
    );
  if (lines.length > MAX_ROWS + 1)
    return NextResponse.json(
      {
        error: `File has ${lines.length - 1} data rows. Maximum is ${MAX_ROWS}. Split into smaller batches.`,
      },
      { status: 400 },
    );

  const header = parseCSVLine(lines[0].toLowerCase()).map((h) =>
    h.replace(/^"|"$/g, ""),
  );
  const codeIdx = header.indexOf("code");
  const titleIdx = header.indexOf("title");
  const creditIdx = header.findIndex((h) =>
    ["credit_hours", "credithours", "credits"].includes(h),
  );
  const scoringIdx = header.findIndex((h) =>
    ["is_scoring", "isscoring", "scoring"].includes(h),
  );
  const categoryIdx = header.findIndex((h) =>
    ["category", "course_category", "cat"].includes(h),
  );

  const missing = [
    codeIdx === -1 && "code",
    titleIdx === -1 && "title",
    creditIdx === -1 && "credit_hours",
  ].filter(Boolean);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Missing required column(s): ${missing.join(", ")}. Your header row is: [${header.join(", ")}]. Download the template for the correct format.`,
      },
      { status: 400 },
    );
  }

  const dataLines = lines.slice(1).slice(0, MAX_ROWS);
  type ValidRow = {
    sourceCourseId?: number;
    code: string;
    title: string;
    creditHours: number;
    isScoring: boolean;
    category: "OSIS_OLD" | "OSIS_NEW" | "ITS" | "OSIS_2";
    rowNum: number;
  };
  type FailedRow = { row: number; message: string };
  const valid: ValidRow[] = [];
  const failures: FailedRow[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = i + 2;
    const cols = parseCSVLine(dataLines[i]);
    const rawCode = cols[codeIdx] ?? "";
    const rawTitle = cols[titleIdx] ?? "";
    const rawCredits = cols[creditIdx] ?? "";
    const rawScoring = scoringIdx >= 0 ? (cols[scoringIdx] ?? "true") : "true";
    const rawCategory =
      categoryIdx >= 0 ? (cols[categoryIdx] ?? "OSIS_NEW") : "OSIS_NEW";

    if (!rawCode && !rawTitle) continue; // blank row

    const parsed = rowSchema.safeParse({
      code: rawCode,
      title: rawTitle,
      creditHours: rawCredits,
      isScoring: rawScoring,
      category: rawCategory,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const rawMap: Record<string, string> = {
        code: rawCode,
        title: rawTitle,
        creditHours: rawCredits,
        isScoring: rawScoring,
      };
      failures.push({
        row: rowNum,
        message: friendlyColError(
          String(issue.path[0]),
          rawMap[String(issue.path[0])] ?? "",
          issue.message,
        ),
      });
      continue;
    }

    const dup = valid.find(
      (v) => v.code.toLowerCase() === parsed.data.code.toLowerCase(),
    );
    if (dup) {
      failures.push({
        row: rowNum,
        message: `Course code "${parsed.data.code}" appears more than once in this file. Each code must be unique.`,
      });
      continue;
    }
    valid.push({
      ...parsed.data,
      category: parsed.data.category ?? "OSIS_NEW",
      rowNum,
    });
  }

  // DB duplicate check
  const existing = await db
    .select({ code: courses.code, category: courses.category })
    .from(courses);
  const existingKeys = new Set(
    existing.map((e) => `${e.code.toLowerCase()}::${e.category}`),
  );

  const toInsert: ValidRow[] = [];
  for (const row of valid) {
    const key = `${row.code.toLowerCase()}::${row.category}`;
    if (existingKeys.has(key)) {
      failures.push({
        row: 0,
        message: `Course "${row.code}" in category "${row.category}" already exists. Remove this row or change the category.`,
      });
    } else {
      toInsert.push(row);
    }
  }

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100);
    try {
      await db.insert(courses).values(
        batch.map((r) => ({
          code: r.code.toUpperCase(),
          sourceCourseId: r.sourceCourseId ?? 0,
          title: r.title,
          category: r.category,
          creditHours: r.creditHours,
          isScoring: r.isScoring,
          isActive: true,
        })),
      );
      inserted += batch.length;
    } catch {
      for (const row of batch) {
        try {
          await db.insert(courses).values({
            code: row.code.toUpperCase(),
            sourceCourseId: row.sourceCourseId ?? 0,
            title: row.title,
            category: row.category,
            creditHours: row.creditHours,
            isScoring: row.isScoring,
            isActive: true,
          });
          inserted++;
        } catch (e) {
          const msg = e instanceof Error ? e.message.toLowerCase() : "";
          const friendly =
            msg.includes("unique") || msg.includes("duplicate")
              ? `Course code "${row.code}" already exists. Remove this row.`
              : `Could not save course "${row.code}": ${e instanceof Error ? e.message : "Unknown error"}`;
          failures.push({ row: 0, message: friendly });
        }
      }
    }
  }

  return NextResponse.json({
    successCount: inserted,
    failureCount: failures.length,
    totalRows: dataLines.length,
    failures,
  });
}
