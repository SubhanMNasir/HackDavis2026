// PATCH/DELETE /api/donations/:id
//
// Per CONTRACTS §4.4 — only the original logger may edit or delete their
// own row. Cross-volunteer attempts return 403. DELETE is soft (sets
// deleted: true). Both routes emit one audit event after the DB write.

import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectMongo } from "@/lib/db/mongoose";
import { Donation } from "@/lib/db/models/donation";
import { Category } from "@/lib/db/models/category";
import { requireAuth } from "@/lib/auth/requireAuth";
import { recordEvent } from "@/lib/audit";
import { ApiError, jsonError, jsonErrorFromException } from "@/lib/api/errors";
import { APP_TZ } from "@/lib/timezone";
import type { Donation as WireDonation } from "@/lib/types";

export const runtime = "nodejs";

const objectIdRefinement = (val: string) => Types.ObjectId.isValid(val);

const patchSchema = z
  .object({
    quantity: z.number().positive("quantity must be greater than 0").optional(),
    unit: z.enum(["count", "lbs"]).optional(),
    estimatedValue: z.number().min(0, "estimatedValue must be >= 0").optional(),
    notes: z.string().nullable().optional(),
    donatedAt: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)), { message: "donatedAt must be ISO" })
      .optional(),
    categoryId: z
      .string()
      .refine(objectIdRefinement, { message: "Invalid categoryId" })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Body must include at least one field" });

interface RouteCtx {
  params: Promise<{ id: string }>;
}

function fmtNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAuth();
    await connectMongo();
    const { id } = await ctx.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid donation id");
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, "VALIDATION_ERROR", "Body must be JSON");
    }

    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return jsonError(400, "VALIDATION_ERROR", first.message, {
        field: first.path.join("."),
      });
    }
    const body = parsed.data;

    const donation = await Donation.findById(id);
    if (!donation || donation.deleted) {
      throw new ApiError(404, "NOT_FOUND", "Donation not found");
    }
    if (donation.loggedBy !== auth.userId) {
      throw new ApiError(403, "FORBIDDEN", "You can only edit donations you logged");
    }

    // Capture previous values for the audit diff.
    const prev = {
      quantity: donation.quantity,
      unit: donation.unit,
      estimatedValue: donation.estimatedValue,
      notes: donation.notes,
      donatedAt: donation.donatedAt,
      categoryId: String(donation.categoryId),
      categoryName: donation.categoryName,
    };

    if (body.categoryId !== undefined && body.categoryId !== prev.categoryId) {
      const newCat = await Category.findById(body.categoryId);
      if (!newCat || !newCat.active) {
        return jsonError(400, "VALIDATION_ERROR", "Unknown or inactive categoryId", {
          field: "categoryId",
        });
      }
      donation.categoryId = newCat._id;
      donation.categoryName = newCat.name;
      donation.programName = newCat.programName;
    }

    if (body.quantity !== undefined) donation.quantity = body.quantity;
    if (body.unit !== undefined) donation.unit = body.unit;
    if (body.estimatedValue !== undefined) donation.estimatedValue = body.estimatedValue;
    if (body.notes !== undefined) donation.notes = body.notes;
    if (body.donatedAt !== undefined) donation.donatedAt = new Date(body.donatedAt);

    await donation.save();

    // Build the diff string. Only show fields that actually changed.
    const diffs: string[] = [];
    if (donation.quantity !== prev.quantity) {
      diffs.push(`qty ${fmtNumber(prev.quantity)} -> ${fmtNumber(donation.quantity)}`);
    }
    if (donation.unit !== prev.unit) {
      diffs.push(`unit ${prev.unit} -> ${donation.unit}`);
    }
    if (donation.estimatedValue !== prev.estimatedValue) {
      diffs.push(`value ${prev.estimatedValue} -> ${donation.estimatedValue}`);
    }
    if ((donation.notes ?? "") !== (prev.notes ?? "")) {
      diffs.push("notes updated");
    }
    if (donation.donatedAt.getTime() !== prev.donatedAt.getTime()) {
      diffs.push("date updated");
    }
    if (donation.categoryName !== prev.categoryName) {
      diffs.push(`category ${prev.categoryName} -> ${donation.categoryName}`);
    }

    const targetLabel =
      donation.categoryName !== prev.categoryName
        ? `${prev.categoryName} -> ${donation.categoryName}`
        : donation.itemName;
    const summary =
      diffs.length > 0
        ? `${auth.displayName} updated ${donation.itemName}: ${diffs.join(", ")}`
        : `${auth.displayName} updated ${donation.itemName}`;

    await recordEvent(
      "donation.updated",
      { actorId: auth.userId, fullName: auth.fullName, displayName: auth.displayName },
      { id: String(donation._id), label: targetLabel },
      summary,
    );

    return NextResponse.json({ donation: donation.toJSON() as unknown as WireDonation });
  } catch (err) {
    return jsonErrorFromException(err);
  }
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAuth();
    await connectMongo();
    const { id } = await ctx.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid donation id");
    }

    const donation = await Donation.findById(id);
    if (!donation || donation.deleted) {
      throw new ApiError(404, "NOT_FOUND", "Donation not found");
    }
    if (donation.loggedBy !== auth.userId) {
      throw new ApiError(403, "FORBIDDEN", "You can only edit donations you logged");
    }

    donation.deleted = true;
    await donation.save();

    const dateLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TZ,
      month: "short",
      day: "numeric",
    }).format(donation.donatedAt);

    const summary = `${auth.displayName} deleted ${fmtNumber(donation.quantity)} ${donation.unit} ${donation.itemName} donation from ${dateLabel}`;
    await recordEvent(
      "donation.deleted",
      { actorId: auth.userId, fullName: auth.fullName, displayName: auth.displayName },
      { id: String(donation._id), label: donation.itemName },
      summary,
    );

    return NextResponse.json({ deleted: true, id: String(donation._id) });
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
