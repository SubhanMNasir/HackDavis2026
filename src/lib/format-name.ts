// Single source of truth for display-name + initials formatting.
// Imported by both frontend (UI rendering) and backend (audit summary strings).
// See PLAN §Decisions #5: full names stored in DB, abbreviated for display.

/**
 * "Jessica Martinez" -> "Jessica M."
 * Single-word names ("Jessica") are returned unchanged.
 * Falsy / empty input falls back to "Volunteer".
 */
export function formatDisplayName(fullName: string | null | undefined): string {
  if (!fullName) return "Volunteer";
  const trimmed = fullName.trim();
  if (!trimmed) return "Volunteer";

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];

  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() ?? "";
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

/**
 * "Jessica Martinez" -> "JM"
 * Single-word names use the first character only ("Jessica" -> "J").
 * Falsy / empty input falls back to "??".
 */
export function getInitials(fullName: string | null | undefined): string {
  if (!fullName) return "??";
  const trimmed = fullName.trim();
  if (!trimmed) return "??";

  const parts = trimmed.split(/\s+/);
  const first = parts[0][0]?.toUpperCase() ?? "";
  if (parts.length === 1) return first || "?";

  const last = parts[parts.length - 1][0]?.toUpperCase() ?? "";
  return `${first}${last}`;
}
