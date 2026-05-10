// /api/categories — list (existing) + create (CONTRACTS §4.3).
//
// GET lists active categories sorted by name ASC.
// POST creates a new active category and emits a category.created audit event.
// Both routes require auth; POST also invalidates the categories cache so
// the AI recognize flow picks up the new shape.

import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectMongo } from "@/lib/db/mongoose";
import { Category } from "@/lib/db/models/category";
import { Program } from "@/lib/db/models/program";
import { requireAuth } from "@/lib/auth/requireAuth";
import { recordEvent } from "@/lib/audit";
import { invalidateCategoriesCache } from "@/lib/categories-cache";
import { ApiError, jsonError, jsonErrorFromException } from "@/lib/api/errors";
import type { Category as WireCategory } from "@/lib/types";

export const runtime = "nodejs";

const objectIdRefinement = (val: string) => Types.ObjectId.isValid(val);

const createBodySchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  programId: z.string().refine(objectIdRefinement, { message: "Invalid programId" }),
  defaultUnit: z.enum(["count", "lbs"]),
});

export async function GET(req: Request) {
  try {
    await requireAuth();
    await connectMongo();

    const { searchParams } = new URL(req.url);
    const programId = searchParams.get("programId");
    const activeParam = searchParams.get("active");

    const filter: Record<string, unknown> = {};

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

    const program = await Program.findById(body.programId);
    if (!program) {
      return jsonError(400, "VALIDATION_ERROR", "Unknown programId", { field: "programId" });
    }

    let doc;
    try {
      doc = await Category.create({
        name: body.name,
        programId: program._id,
        programName: program.name,
        defaultUnit: body.defaultUnit,
        active: true,
        createdBy: auth.userId,
      });
    } catch (e: unknown) {
      // Duplicate (programId, name, active) per the model's case-insensitive
      // compound unique index.
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

    const summary = `${auth.displayName} created category ${doc.name} (${doc.programName})`;
    await recordEvent(
      "category.created",
      { actorId: auth.userId, fullName: auth.fullName, displayName: auth.displayName },
      { id: String(doc._id), label: doc.name },
      summary,
    );

    return NextResponse.json(
      { category: doc.toJSON() as unknown as WireCategory },
      { status: 201 },
    );
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
