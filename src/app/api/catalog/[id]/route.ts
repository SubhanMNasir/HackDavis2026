// PATCH/DELETE /api/catalog/:id — runtime catalog edits surfaced from
// Quick Pick and AI Review (CONTRACTS §4.1).
//
// PATCH renames / re-prices / re-categorizes an active catalog item. When
// categoryId changes the denormalized categoryName + programName are
// re-snapshot from the target category. Duplicate (categoryId, name)
// among active rows returns 409 (case-insensitive, per the model's
// compound unique index). Emits an `item.updated` audit event summarizing
// which fields changed so the edit shows up in History.
//
// DELETE soft-archives by setting active: false and emits item.archived.
// Existing donations keep their snapshot fields so they continue to render.

import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectMongo } from "@/lib/db/mongoose";
import { CatalogItem } from "@/lib/db/models/catalogItem";
import { Category } from "@/lib/db/models/category";
import { requireAuth } from "@/lib/auth/requireAuth";
import { recordEvent } from "@/lib/audit";
import { ApiError, jsonError, jsonErrorFromException } from "@/lib/api/errors";
import type { CatalogItem as WireCatalogItem } from "@/lib/types";

export const runtime = "nodejs";

const objectIdRefinement = (val: string) => Types.ObjectId.isValid(val);

const patchSchema = z
  .object({
    name: z.string().trim().min(1, "name must be non-empty").optional(),
    defaultUnit: z.enum(["count", "lbs"]).optional(),
    estimatedValuePerUnit: z.number().min(0, "estimatedValuePerUnit must be >= 0").optional(),
    categoryId: z
      .string()
      .refine(objectIdRefinement, { message: "Invalid categoryId" })
      .optional(),
    aliases: z.array(z.string().trim().min(1)).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.defaultUnit !== undefined ||
      v.estimatedValuePerUnit !== undefined ||
      v.categoryId !== undefined ||
      v.aliases !== undefined,
    { message: "Body must include at least one editable field" },
  );

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAuth();
    await connectMongo();
    const { id } = await ctx.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid item id");
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

    const item = await CatalogItem.findById(id);
    if (!item || !item.active) {
      throw new ApiError(404, "NOT_FOUND", "Item not found");
    }

    const prev = {
      name: item.name,
      categoryName: item.categoryName,
      defaultUnit: item.defaultUnit,
      estimatedValuePerUnit: item.estimatedValuePerUnit,
      aliasesCount: item.aliases?.length ?? 0,
    };

    if (body.categoryId !== undefined && body.categoryId !== String(item.categoryId)) {
      const cat = await Category.findById(body.categoryId);
      if (!cat || !cat.active) {
        return jsonError(400, "VALIDATION_ERROR", "Unknown or inactive categoryId", {
          field: "categoryId",
        });
      }
      item.categoryId = cat._id;
      item.categoryName = cat.name;
      item.programName = cat.programName;
    }

    if (body.name !== undefined) item.name = body.name;
    if (body.defaultUnit !== undefined) item.defaultUnit = body.defaultUnit;
    if (body.estimatedValuePerUnit !== undefined) {
      item.estimatedValuePerUnit = body.estimatedValuePerUnit;
    }
    if (body.aliases !== undefined) item.aliases = body.aliases;

    try {
      await item.save();
    } catch (e: unknown) {
      if ((e as { code?: number })?.code === 11000) {
        return jsonError(
          409,
          "CONFLICT",
          "An item with this name already exists in that category",
          { field: "name" },
        );
      }
      throw e;
    }

    const changes: string[] = [];
    if (item.name !== prev.name) changes.push(`renamed ${prev.name} -> ${item.name}`);
    if (item.categoryName !== prev.categoryName) {
      changes.push(`moved to ${item.categoryName}`);
    }
    if (item.defaultUnit !== prev.defaultUnit) {
      changes.push(`unit ${prev.defaultUnit} -> ${item.defaultUnit}`);
    }
    if (item.estimatedValuePerUnit !== prev.estimatedValuePerUnit) {
      changes.push(
        `price $${prev.estimatedValuePerUnit.toFixed(2)} -> $${item.estimatedValuePerUnit.toFixed(2)}`,
      );
    }
    if ((item.aliases?.length ?? 0) !== prev.aliasesCount) {
      changes.push(`aliases updated`);
    }

    if (changes.length > 0) {
      const targetLabel =
        item.name !== prev.name ? `${prev.name} -> ${item.name}` : item.name;
      const summary = `${auth.displayName} updated ${prev.name} (${changes.join(", ")})`;
      await recordEvent(
        "item.updated",
        { actorId: auth.userId, fullName: auth.fullName, displayName: auth.displayName },
        { id: String(item._id), label: targetLabel },
        summary,
      );
    }

    return NextResponse.json({ item: item.toJSON() as unknown as WireCatalogItem });
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
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid item id");
    }

    const item = await CatalogItem.findById(id);
    if (!item || !item.active) {
      throw new ApiError(404, "NOT_FOUND", "Item not found");
    }

    item.active = false;
    await item.save();

    const summary = `${auth.displayName} archived ${item.name} (${item.categoryName})`;
    await recordEvent(
      "item.archived",
      { actorId: auth.userId, fullName: auth.fullName, displayName: auth.displayName },
      { id: String(item._id), label: item.name },
      summary,
    );

    return NextResponse.json({ archived: true, id: String(item._id) });
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
