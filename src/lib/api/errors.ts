// Standard error-envelope helper. Every non-2xx response from /api/**
// MUST go through this so the wire format matches CONTRACTS §7.

import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_IMAGE"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "AI_UNAVAILABLE";

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
) {
  const body: { error: { code: ApiErrorCode; message: string; details?: unknown } } = {
    error: { code, message },
  };
  if (details !== undefined) body.error.details = details;
  return NextResponse.json(body, { status });
}

export function jsonErrorFromException(err: unknown) {
  if (err instanceof ApiError) {
    return jsonError(err.status, err.code, err.message, err.details);
  }
  // eslint-disable-next-line no-console
  console.error("[api] unhandled error:", err);
  return jsonError(500, "INTERNAL", "Internal server error");
}
