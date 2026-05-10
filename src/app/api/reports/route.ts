// GET /api/reports — CONTRACTS §4.6.
//
// Date-range aggregation for the Reports screen. Filters out soft-deleted
// donations and groups by item / category / program. Names are resolved
// against the CURRENT category + program docs at request time so that
// renames consolidate (the CSV endpoint does the opposite — see
// /api/reports/csv).
//
// Empty range → ReportSummary with zeroes; never null/undefined collections.

import { NextResponse } from "next/server";
import { Types, type PipelineStage } from "mongoose";
import { connectMongo } from "@/lib/db/mongoose";
import { Donation } from "@/lib/db/models/donation";
import { Category } from "@/lib/db/models/category";
import { Program } from "@/lib/db/models/program";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ApiError, jsonErrorFromException } from "@/lib/api/errors";
import type { ReportRow, ReportSummary, Unit } from "@/lib/types";

export const runtime = "nodejs";

type GroupBy = "item" | "category" | "program";

// Per-row aggregation buckets. We always carry categoryId so we can resolve
// the current category name (and its program) regardless of groupBy.
interface AggBucket {
  groupKey: string; // synthetic — itemName, categoryId hex, or programName
  itemName: string; // preserved for groupBy=item; otherwise the group label
  categoryId: Types.ObjectId | null;
  snapshotCategoryName: string;
  snapshotProgramName: string;
  unit: Unit;
  totalQuantity: number;
  totalValue: number;
  entryCount: number;
}

function parseGroupBy(raw: string | null): GroupBy {
  if (raw === "category" || raw === "program" || raw === "item") return raw;
  if (raw === null) return "item";
  throw new ApiError(
    400,
    "VALIDATION_ERROR",
    "groupBy must be 'item', 'category', or 'program'",
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
    const groupBy = parseGroupBy(searchParams.get("groupBy"));

    const baseFilter = {
      deleted: { $ne: true },
      donatedAt: { $gte: from, $lte: to },
    };

    // Group key per CONTRACTS §4.6: item by itemName, category by
    // categoryId (so renames consolidate), program by programName snapshot
    // (we resolve the CURRENT name later via the category → program lookup).
    let groupIdExpr: unknown;
    if (groupBy === "item") groupIdExpr = "$itemName";
    else if (groupBy === "category") groupIdExpr = "$categoryId";
    else groupIdExpr = "$programName";

    const pipeline: PipelineStage[] = [
      { $match: baseFilter },
      // Sort so the $first picks within each group are deterministic
      // (most recent snapshot wins for unit + program/category names).
      { $sort: { donatedAt: -1 } },
      {
        $group: {
          _id: groupIdExpr,
          itemName: { $first: "$itemName" },
          categoryId: { $first: "$categoryId" },
          snapshotCategoryName: { $first: "$categoryName" },
          snapshotProgramName: { $first: "$programName" },
          unit: { $first: "$unit" },
          totalQuantity: { $sum: "$quantity" },
          totalValue: { $sum: "$estimatedValue" },
          entryCount: { $sum: 1 },
        },
      },
    ];

    const grandTotalsPipeline: PipelineStage[] = [
      { $match: baseFilter },
      {
        $group: {
          _id: null,
          totalValue: { $sum: "$estimatedValue" },
          entryCount: { $sum: 1 },
        },
      },
    ];

    const topItemPipeline: PipelineStage[] = [
      { $match: baseFilter },
      {
        $group: {
          _id: "$itemName",
          totalValue: { $sum: "$estimatedValue" },
        },
      },
      { $sort: { totalValue: -1, _id: 1 } },
      { $limit: 1 },
    ];

    const topCategoryPipeline: PipelineStage[] = [
      { $match: baseFilter },
      {
        $group: {
          _id: "$categoryId",
          snapshotName: { $first: "$categoryName" },
          totalValue: { $sum: "$estimatedValue" },
        },
      },
      { $sort: { totalValue: -1 } },
      { $limit: 1 },
    ];

    const [rawBuckets, grandTotalsAgg, topItemAgg, topCategoryAgg] = await Promise.all([
      Donation.aggregate<{
        _id: unknown;
        itemName: string;
        categoryId: Types.ObjectId | null;
        snapshotCategoryName: string;
        snapshotProgramName: string;
        unit: Unit;
        totalQuantity: number;
        totalValue: number;
        entryCount: number;
      }>(pipeline),
      Donation.aggregate<{ totalValue: number; entryCount: number }>(grandTotalsPipeline),
      Donation.aggregate<{ _id: string; totalValue: number }>(topItemPipeline),
      Donation.aggregate<{
        _id: Types.ObjectId | null;
        snapshotName: string;
        totalValue: number;
      }>(topCategoryPipeline),
    ]);

    const grand = grandTotalsAgg[0] ?? { totalValue: 0, entryCount: 0 };

    if (rawBuckets.length === 0) {
      const empty: ReportSummary = {
        from: from.toISOString(),
        to: to.toISOString(),
        totalValue: 0,
        entryCount: 0,
        topItem: null,
        topCategory: null,
        rows: [],
      };
      return NextResponse.json(empty);
    }

    // Resolve the CURRENT names. Per the prompt, "current names" means we
    // look up category + program docs by id rather than trusting the
    // snapshot — handles renames cleanly.
    const categoryIdSet = new Set<string>();
    for (const b of rawBuckets) {
      if (b.categoryId) categoryIdSet.add(String(b.categoryId));
    }
    if (topCategoryAgg[0]?._id) categoryIdSet.add(String(topCategoryAgg[0]._id));

    const categoryDocs = categoryIdSet.size
      ? await Category.find({
          _id: { $in: Array.from(categoryIdSet).map((id) => new Types.ObjectId(id)) },
        })
          .select({ name: 1, programId: 1 })
          .lean()
      : [];

    const programIdSet = new Set<string>();
    for (const c of categoryDocs) programIdSet.add(String(c.programId));

    const programDocs = programIdSet.size
      ? await Program.find({
          _id: { $in: Array.from(programIdSet).map((id) => new Types.ObjectId(id)) },
        })
          .select({ name: 1 })
          .lean()
      : [];

    const programNameById = new Map<string, string>();
    for (const p of programDocs) programNameById.set(String(p._id), p.name);

    const categoryInfoById = new Map<
      string,
      { name: string; programName: string }
    >();
    for (const c of categoryDocs) {
      const programName = programNameById.get(String(c.programId)) ?? "";
      categoryInfoById.set(String(c._id), { name: c.name, programName });
    }

    const buckets: AggBucket[] = rawBuckets.map((b) => ({
      groupKey: String(b._id ?? ""),
      itemName: b.itemName ?? "",
      categoryId: b.categoryId ?? null,
      snapshotCategoryName: b.snapshotCategoryName ?? "",
      snapshotProgramName: b.snapshotProgramName ?? "",
      unit: b.unit,
      totalQuantity: b.totalQuantity,
      totalValue: b.totalValue,
      entryCount: b.entryCount,
    }));

    const rows: ReportRow[] = buckets.map((b) => {
      const current = b.categoryId ? categoryInfoById.get(String(b.categoryId)) : undefined;
      const categoryName = current?.name ?? b.snapshotCategoryName;
      const programName = current?.programName ?? b.snapshotProgramName;

      // For groupBy=category we want the row label to be the category's
      // current name (the FE table renders the row by `itemName`); for
      // groupBy=program we want the program's current name. Item mode
      // already has the right label.
      let rowItemName = b.itemName;
      if (groupBy === "category") rowItemName = categoryName;
      else if (groupBy === "program") rowItemName = programName;

      return {
        itemName: rowItemName,
        categoryId: b.categoryId ? String(b.categoryId) : "",
        categoryName,
        programName,
        unit: b.unit,
        totalQuantity: round2(b.totalQuantity),
        totalValue: round2(b.totalValue),
        entryCount: b.entryCount,
        averageValue: b.entryCount > 0 ? round2(b.totalValue / b.entryCount) : 0,
      };
    });

    rows.sort((a, b) => {
      if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue;
      return a.itemName.localeCompare(b.itemName);
    });

    const topItem = topItemAgg[0]?._id ?? null;
    const topCategory = topCategoryAgg[0]
      ? topCategoryAgg[0]._id
        ? categoryInfoById.get(String(topCategoryAgg[0]._id))?.name ??
          topCategoryAgg[0].snapshotName ??
          null
        : topCategoryAgg[0].snapshotName ?? null
      : null;

    const summary: ReportSummary = {
      from: from.toISOString(),
      to: to.toISOString(),
      totalValue: round2(grand.totalValue),
      entryCount: grand.entryCount,
      topItem,
      topCategory,
      rows,
    };

    return NextResponse.json(summary);
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
