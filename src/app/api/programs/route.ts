// GET /api/programs
//
// Lists active programs. Requires auth. Per CONTRACTS §4.2, sort by
// `sortOrder` ASC; this route additionally returns name-sorted-equivalent
// rows because the seed assigns sortOrder in the same order names appear
// in the brief — but we sort by name ASC per the explicit Phase 1 spec.

import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongoose";
import { Program } from "@/lib/db/models/program";
import { requireAuth } from "@/lib/auth/requireAuth";
import { jsonErrorFromException } from "@/lib/api/errors";
import type { Program as WireProgram } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAuth();
    await connectMongo();

    const docs = await Program.find({}).sort({ name: 1 });
    const programs: WireProgram[] = docs.map((d) => d.toJSON() as unknown as WireProgram);

    return NextResponse.json({ programs });
  } catch (err) {
    return jsonErrorFromException(err);
  }
}
