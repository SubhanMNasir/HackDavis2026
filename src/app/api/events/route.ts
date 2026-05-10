// GET /api/events — History feed per CONTRACTS §4.7.
//
// Filters: from / to / actor / type (comma-separated AuditEventType list)
// / limit (default 50, max 200). Sort: createdAt DESC.
//
// Synthetic seed events use the sentinel actorId
// "000000000000000000000000" with the embedded actorName already set —
// we return the row's denormalized fields directly without trying to
// populate a User doc.

import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongoose";
import { AuditEvent } from "@/lib/db/models/event";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ApiError, jsonErrorFromException } from "@/lib/api/errors";
import type { AuditEvent as WireAuditEvent, AuditEventType } from "@/lib/types";

export const runtime = "nodejs";

const VALID_TYPES: AuditEventType[] = [
  "donation.created",
  "donation.updated",
  "donation.deleted",
  "category.created",
  "category.renamed",
  "category.archived",
  "item.created",
  "item.archived",
];

export async function GET(req: Request) {
  try {
    await requireAuth();
    await connectMongo();

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const actor = searchParams.get("actor");
    const typeParam = searchParams.get("type");
    const limitParam = searchParams.get("limit");

    let limit = 50;
    if (limitParam !== null) {
      const n = Number(limitParam);
      if (!Number.isFinite(n) || n < 1) {
        throw new ApiError(400, "VALIDATION_ERROR", "limit must be a positive number");
      }
      limit = Math.min(200, Math.floor(n));
    }

    const filter: Record<string, unknown> = {};

    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) {
        const d = new Date(from);
        if (Number.isNaN(d.getTime())) {
          throw new ApiError(400, "VALIDATION_ERROR", "from must be ISO");
        }
        range.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (Number.isNaN(d.getTime())) {
          throw new ApiError(400, "VALIDATION_ERROR", "to must be ISO");
        }
        range.$lte = d;
      }
      filter.createdAt = range;
    }

    if (actor) filter.actorId = actor;

    if (typeParam) {
      const requested = typeParam.split(",").map((s) => s.trim()).filter(Boolean);
      const invalid = requested.filter(
        (t): t is string => !(VALID_TYPES as string[]).includes(t),
      );
      if (invalid.length > 0) {
        throw new ApiError(400, "VALIDATION_ERROR", `Unknown audit event type: ${invalid[0]}`, {
          field: "type",
        });
      }
      filter.type = { $in: requested };
    }

    const docs = await AuditEvent.find(filter).sort({ createdAt: -1 }).limit(limit);
    const events: WireAuditEvent[] = docs.map(
      (d) => d.toJSON() as unknown as WireAuditEvent,
    );

    return NextResponse.json({ events });
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
