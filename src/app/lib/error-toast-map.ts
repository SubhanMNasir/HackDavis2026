// User-facing toast strings for every ApiError.code from CONTRACTS §7.
// Frontend never displays raw stacks — always look up the code here first.

export const ERROR_TOAST_MAP: Record<string, string> = {
  VALIDATION_ERROR: "Please check the form and try again.",
  INVALID_IMAGE: "We couldn't read that image. Try a different photo.",
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You can only edit donations you logged.",
  NOT_FOUND: "We couldn't find that record.",
  CONFLICT: "A category with that name already exists in this program.",
  RATE_LIMITED: "AI is busy right now — try Quick Pick or wait a moment.",
  AI_UNAVAILABLE: "AI is unavailable — try Quick Pick.",
  INTERNAL: "Something went wrong on our side. Please try again.",
  NETWORK: "Network error — check your connection.",
};

/** Look up a toast string for a given error code, with a sensible fallback. */
export function toastForCode(code: string | undefined, fallback?: string): string {
  if (code && ERROR_TOAST_MAP[code]) return ERROR_TOAST_MAP[code];
  return fallback ?? ERROR_TOAST_MAP.INTERNAL;
}
