// GET /api/categories
//
// Lists active categories (CONTRACTS §4.3). Requires auth.
//
// Query params:
//   - programId (ObjectId hex, optional) — filter by program
//   - active   ("true" | "false", default "true")
//
// Response: { categories: Category[] } sorted by name ASC.

import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/db/mongoose";
import { Category } from "@/lib/db/models/category";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ApiError, jsonErrorFromException } from "@/lib/api/errors";
import type { Category as WireCategory } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAuth();
    await connectMongo();

    const { searchParams } = new URL(req.url);
    const programId = searchParams.get("programId");
    const activeParam = searchParams.get("active");

    const filter: Record<string, unknown> = {};

    // Default to active: true; only opt out if the caller explicitly
    // passes active=false.
    if (activeParam === "false") {
      filter.active = false;
    } else if (activeParam === null || activeParam === "true") {
      filter.active = true;
    } else {
      throw new ApiError(400, "VALIDATION_ERROR", "active must be 'true' or 'false'");
    }

    if (programId) {
      if (!Types.ObjectId.isValid(programId)) {
        throw new ApiError(400, "VALIDATION_ERROR", "Invalid programId");
      }
      filter.programId = new Types.ObjectId(programId);
    }

    const docs = await Category.find(filter).sort({ name: 1 });
    const categories: WireCategory[] = docs.map((d) => d.toJSON() as unknown as WireCategory);

    return NextResponse.json({ categories });
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
