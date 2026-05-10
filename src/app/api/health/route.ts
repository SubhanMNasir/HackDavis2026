// GET /api/health
//
// Public, unauthenticated. Used for deploy smoke-test (CONTRACTS §4.8).
// The middleware allowlists this path so Clerk doesn't intercept it.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() });
}
