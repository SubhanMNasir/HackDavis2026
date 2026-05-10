// GET /api/catalog
//
// Lists active catalog items (CONTRACTS §4.1). Requires auth.
//
// Query params:
//   - categoryId (ObjectId hex, optional) — filter by category
//   - q          (string, optional) — case-insensitive substring on name + aliases
//   - active     ("true" | "false", default "true")
//
// Phase 1 spec asks for the simple "list active catalog items, sorted by
// name ASC" path. We honor the optional categoryId / q params from
// CONTRACTS §4.1 here as well so the FE can use them in later phases
// without a follow-up change.

import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/db/mongoose";
import { CatalogItem } from "@/lib/db/models/catalogItem";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ApiError, jsonErrorFromException } from "@/lib/api/errors";
import type { CatalogItem as WireCatalogItem } from "@/lib/types";

export const runtime = "nodejs";

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
