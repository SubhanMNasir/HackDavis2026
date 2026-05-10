// GET /api/profile/me — CONTRACTS §4.9.
//
// Aggregates the signed-in volunteer's stats over [from, to]:
//   - stats: count + sum of estimatedValue
//   - topCategories: grouped by categoryId (so renames consolidate);
//     uses CURRENT category name (lookup) but falls back to the donation
//     snapshot when the category was archived. Top 5; rest collapsed into
//     "Other".
//   - recentEntries: last 4 donations by donatedAt DESC, IGNORES from/to.
//
// All aggregations filter loggedBy === userId AND deleted: { $ne: true }.

import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/db/mongoose";
import { Donation } from "@/lib/db/models/donation";
import { Category } from "@/lib/db/models/category";
import { User } from "@/lib/db/models/user";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ApiError, jsonErrorFromException } from "@/lib/api/errors";
import type { ProfileResponse } from "@/lib/types";

export const runtime = "nodejs";

interface CategoryAgg {
  _id: Types.ObjectId;
  totalValue: number;
  count: number;
  latestSnapshotName: string;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
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
      throw new ApiError(400, "VALIDATION_ERROR", "from/to must be ISO");
    }

    // Pull current user (created via JIT-upsert in requireAuth) for joinedAt
    // fallback. Also grab the user's earliest donation (any time) so the
    // "first donation" rule from §4.9 holds.
    const [userDoc, firstDonation, recentDocs] = await Promise.all([
      User.findById(auth.userId).lean(),
      Donation.findOne({ loggedBy: auth.userId, deleted: { $ne: true } })
        .sort({ donatedAt: 1 })
        .lean(),
      Donation.find({ loggedBy: auth.userId, deleted: { $ne: true } })
        .sort({ donatedAt: -1 })
        .limit(4)
        .lean(),
    ]);

    const baseFilter = {
      loggedBy: auth.userId,
      deleted: { $ne: true },
      donatedAt: { $gte: from, $lte: to },
    };

    const [statsAgg, categoryAgg] = await Promise.all([
      Donation.aggregate<{ entryCount: number; totalValue: number }>([
        { $match: baseFilter },
        {
          $group: {
            _id: null,
            entryCount: { $sum: 1 },
            totalValue: { $sum: "$estimatedValue" },
          },
        },
        { $project: { _id: 0, entryCount: 1, totalValue: 1 } },
      ]),
      Donation.aggregate<CategoryAgg>([
        { $match: baseFilter },
        { $sort: { donatedAt: -1 } },
        {
          $group: {
            _id: "$categoryId",
            totalValue: { $sum: "$estimatedValue" },
            count: { $sum: 1 },
            // The first doc in each group is the most recent (we sorted DESC),
            // so its snapshot name is the freshest.
            latestSnapshotName: { $first: "$categoryName" },
          },
        },
        { $sort: { totalValue: -1 } },
      ]),
    ]);

    const stats = statsAgg[0] ?? { entryCount: 0, totalValue: 0 };
    const grandTotal = stats.totalValue;

    // Resolve current names for categories that still exist (active or
    // archived doesn't matter for naming — only deletion would).
    const categoryIds = categoryAgg.map((c) => c._id).filter(Boolean);
    const currentCats = categoryIds.length
      ? await Category.find({ _id: { $in: categoryIds } })
          .select({ name: 1, active: 1 })
          .lean()
      : [];
    const currentCatMap = new Map<string, { name: string; active: boolean }>();
    for (const c of currentCats) {
      currentCatMap.set(String(c._id), { name: c.name, active: c.active });
    }

    interface ResolvedCat {
      categoryName: string;
      totalValue: number;
    }
    const resolved: ResolvedCat[] = categoryAgg.map((c) => {
      const current = currentCatMap.get(String(c._id));
      // Per CONTRACTS §4.9: prefer the current name; fall back to the
      // snapshot when the category was archived (active:false).
      const name =
        current && current.active ? current.name : c.latestSnapshotName;
      return { categoryName: name, totalValue: c.totalValue };
    });

    const top5 = resolved.slice(0, 5);
    const tail = resolved.slice(5);
    const topCategories: ProfileResponse["topCategories"] = [];

    if (resolved.length > 0) {
      for (const r of top5) {
        const pct = grandTotal > 0 ? Math.round((r.totalValue / grandTotal) * 100) : 0;
        topCategories.push({
          categoryName: r.categoryName,
          totalValue: r.totalValue,
          pct,
        });
      }
      if (tail.length > 0) {
        const tailValue = tail.reduce((s, r) => s + r.totalValue, 0);
        const pct = grandTotal > 0 ? Math.round((tailValue / grandTotal) * 100) : 0;
        topCategories.push({ categoryName: "Other", totalValue: tailValue, pct });
      }
    }

    const recentEntries: ProfileResponse["recentEntries"] = recentDocs.map((d) => ({
      donationId: String(d._id),
      itemName: d.itemName,
      quantity: d.quantity,
      unit: d.unit,
      estimatedValue: d.estimatedValue,
      donatedAt: d.donatedAt.toISOString(),
    }));

    const joinedAtSource =
      firstDonation?.donatedAt ?? userDoc?.createdAt ?? new Date();
    const joinedAt =
      joinedAtSource instanceof Date
        ? joinedAtSource.toISOString()
        : new Date(joinedAtSource).toISOString();

    const body: ProfileResponse = {
      user: {
        id: auth.userId,
        name: auth.fullName,
        email: auth.email,
        initials: auth.initials,
        joinedAt,
      },
      range: { from: from.toISOString(), to: to.toISOString() },
      stats: { entryCount: stats.entryCount, totalValue: stats.totalValue },
      topCategories,
      recentEntries,
    };

    return NextResponse.json(body);
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
