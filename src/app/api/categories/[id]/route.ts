// PATCH/DELETE /api/categories/:id — CONTRACTS §4.3.
//
// PATCH renames or changes defaultUnit on an active category. Duplicate
// names within the same program (case-insensitive, active) return 409.
// DELETE soft-deletes by setting active: false; existing donations keep
// their snapshot fields and continue to render correctly.
//
// Both write paths invalidate the categories cache and emit one audit
// event after the DB write.

import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectMongo } from "@/lib/db/mongoose";
import { Category } from "@/lib/db/models/category";
import { requireAuth } from "@/lib/auth/requireAuth";
import { recordEvent } from "@/lib/audit";
import { invalidateCategoriesCache } from "@/lib/categories-cache";
import { ApiError, jsonError, jsonErrorFromException } from "@/lib/api/errors";
import type { Category as WireCategory } from "@/lib/types";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    name: z.string().trim().min(1, "name must be non-empty").optional(),
    defaultUnit: z.enum(["count", "lbs"]).optional(),
  })
  .refine((v) => v.name !== undefined || v.defaultUnit !== undefined, {
    message: "Body must include name or defaultUnit",
  });

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAuth();
    await connectMongo();
    const { id } = await ctx.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid category id");
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

    const category = await Category.findById(id);
    if (!category || !category.active) {
      throw new ApiError(404, "NOT_FOUND", "Category not found");
    }

    const prevName = category.name;
    const prevUnit = category.defaultUnit;
    const programName = category.programName;

    if (body.name !== undefined) category.name = body.name;
    if (body.defaultUnit !== undefined) category.defaultUnit = body.defaultUnit;

    try {
      await category.save();
    } catch (e: unknown) {
      if ((e as { code?: number })?.code === 11000) {
        return jsonError(
          409,
          "CONFLICT",
          "A category with this name already exists in that program",
          { field: "name" },
        );
      }
      throw e;
    }

    invalidateCategoriesCache();

    if (body.name !== undefined && body.name !== prevName) {
      const targetLabel = `${prevName} -> ${category.name}`;
      const summary = `${auth.displayName} renamed category ${prevName} -> ${category.name} (${programName})`;
      await recordEvent(
        "category.renamed",
        { actorId: auth.userId, fullName: auth.fullName, displayName: auth.displayName },
        { id: String(category._id), label: targetLabel },
        summary,
      );
    } else if (body.defaultUnit !== undefined && body.defaultUnit !== prevUnit) {
      // Unit-only edit. CONTRACTS §3 only enumerates category.{created,renamed,archived}
      // for our domain — fall through and skip the audit event rather than
      // invent a new event type.
    }

    return NextResponse.json({ category: category.toJSON() as unknown as WireCategory });
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
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid category id");
    }

    const category = await Category.findById(id);
    if (!category || !category.active) {
      throw new ApiError(404, "NOT_FOUND", "Category not found");
    }

    category.active = false;
    await category.save();

    invalidateCategoriesCache();

    const summary = `${auth.displayName} archived category ${category.name} (${category.programName})`;
    await recordEvent(
      "category.archived",
      { actorId: auth.userId, fullName: auth.fullName, displayName: auth.displayName },
      { id: String(category._id), label: category.name },
      summary,
    );

    return NextResponse.json({ archived: true, id: String(category._id) });
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
