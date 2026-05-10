// GET /api/catalog — list active catalog items (CONTRACTS §4.1).
// POST /api/catalog — volunteer creates a catalog item from Quick Pick. The
// new row is shared (the catalog is a single shelter-wide collection) and a
// `item.created` audit event lands in History so other volunteers see it.

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

const createBodySchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  categoryId: z.string().refine(objectIdRefinement, { message: "Invalid categoryId" }),
  defaultUnit: z.enum(["count", "lbs"]),
  estimatedValuePerUnit: z
    .number()
    .min(0, "estimatedValuePerUnit must be >= 0"),
  aliases: z.array(z.string().trim().min(1)).optional(),
});

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request) {
  try {
    await requireAuth();
    await connectMongo();

    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const q = searchParams.get("q");
    const activeParam = searchParams.get("active");

    const filter: Record<string, unknown> = {};

    if (activeParam === "false") {
      filter.active = false;
    } else if (activeParam === null || activeParam === "true") {
      filter.active = true;
    } else {
      throw new ApiError(400, "VALIDATION_ERROR", "active must be 'true' or 'false'");
    }

    if (categoryId) {
      if (!Types.ObjectId.isValid(categoryId)) {
        throw new ApiError(400, "VALIDATION_ERROR", "Invalid categoryId");
      }
      filter.categoryId = new Types.ObjectId(categoryId);
    }

    if (q && q.trim()) {
      const rx = new RegExp(escapeRegex(q.trim()), "i");
      filter.$or = [{ name: rx }, { aliases: rx }];
    }

    const docs = await CatalogItem.find(filter).sort({ name: 1 });
    const items: WireCatalogItem[] = docs.map(
      (d) => d.toJSON() as unknown as WireCatalogItem,
    );

    return NextResponse.json({ items });
  } catch (err) {
    return jsonErrorFromException(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    await connectMongo();

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError(400, "VALIDATION_ERROR", "Body must be JSON");
    }

    const parsed = createBodySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return jsonError(400, "VALIDATION_ERROR", first.message, {
        field: first.path.join("."),
      });
    }
    const body = parsed.data;

    const category = await Category.findById(body.categoryId);
    if (!category || !category.active) {
      return jsonError(400, "VALIDATION_ERROR", "Unknown or inactive categoryId", {
        field: "categoryId",
      });
    }

    let doc;
    try {
      doc = await CatalogItem.create({
        name: body.name,
        categoryId: category._id,
        categoryName: category.name,
        programName: category.programName,
        defaultUnit: body.defaultUnit,
        estimatedValuePerUnit: body.estimatedValuePerUnit,
        aliases: body.aliases ?? [],
        active: true,
      });
    } catch (e: unknown) {
      // Duplicate (categoryId, name, active) per the model's case-insensitive
      // compound unique index.
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

    const summary = `${auth.displayName} added ${doc.name} (${doc.categoryName}) to the catalog`;
    await recordEvent(
      "item.created",
      { actorId: auth.userId, fullName: auth.fullName, displayName: auth.displayName },
      { id: String(doc._id), label: doc.name },
      summary,
    );

    return NextResponse.json(
      { item: doc.toJSON() as unknown as WireCatalogItem },
      { status: 201 },
    );
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
