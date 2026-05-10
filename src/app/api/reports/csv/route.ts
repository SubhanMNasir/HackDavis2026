// GET /api/reports/csv — CONTRACTS §4.6.
//
// Streams a CSV download of donations in the [from, to] range using the
// SNAPSHOT names on each donation row (categoryName, programName) — that
// preserves historical categorization for tax filing, even if the
// underlying category was renamed or archived. This is the deliberate
// counterpart to /api/reports, which uses current names.
//
// Filename + Date column are formatted in America/Los_Angeles. The wire
// format on individual donation rows is still UTC ISO; only the rendered
// date strings get the Pacific offset.

import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongoose";
import { Donation } from "@/lib/db/models/donation";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ApiError, jsonErrorFromException } from "@/lib/api/errors";
import { APP_TZ } from "@/lib/timezone";
import type { DonationSource } from "@/lib/types";

export const runtime = "nodejs";

const CSV_HEADER =
  "Date,Item,Category,Program,Quantity,Unit,Estimated Value,Source,Logged By,Notes\n";

const SOURCE_LABEL: Record<DonationSource, string> = {
  photo_ai: "AI Photo",
  quick_pick: "Quick Pick",
  manual: "Manual",
  barcode: "Barcode",
};

/**
 * Render a UTC `Date` as a YYYY-MM-DD string in America/Los_Angeles.
 * Used for both the Date column and the filename. en-CA locale formats
 * dates in ISO-style YYYY-MM-DD by default.
 */
function pacificDateString(input: Date | string): string {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Render a quantity as either an integer ("12") or trimmed decimal ("1.5"),
 * never "12.0". Non-finite values fall back to "0".
 */
function formatQuantity(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // Number.toString() naturally drops trailing zeros: 12 -> "12", 1.5 -> "1.5".
  return Number(n).toString();
}

/**
 * RFC 4180 escape: wrap in quotes when value contains comma, double-quote,
 * or any newline character; double up internal quotes.
 */
function csvEscape(value: string | null | undefined): string {
  const s = value ?? "";
  const needsQuoting = /[",\r\n]/.test(s);
  if (!needsQuoting) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  try {
    await requireAuth();
    await connectMongo();

    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    if (!fromStr || !toStr) {
      throw new ApiError(400, "VALIDATION_ERROR", "from and to are required");
    }
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new ApiError(400, "VALIDATION_ERROR", "from/to must be ISO dates");
    }

    const donations = await Donation.find({
      deleted: { $ne: true },
      donatedAt: { $gte: from, $lte: to },
    })
      .sort({ donatedAt: 1 })
      .lean();

    const lines: string[] = [CSV_HEADER];
    for (const d of donations) {
      const row = [
        pacificDateString(d.donatedAt),
        csvEscape(d.itemName),
        csvEscape(d.categoryName),
        csvEscape(d.programName),
        formatQuantity(d.quantity),
        d.unit,
        Number(d.estimatedValue ?? 0).toFixed(2),
        SOURCE_LABEL[d.source as DonationSource] ?? d.source,
        csvEscape(d.loggedByName),
        csvEscape(d.notes),
      ].join(",");
      lines.push(row + "\n");
    }

    const csv = lines.join("");
    const filename = `wellspring-donations-${pacificDateString(from)}-to-${pacificDateString(to)}.csv`;
    const buffer = Buffer.from(csv, "utf8");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
