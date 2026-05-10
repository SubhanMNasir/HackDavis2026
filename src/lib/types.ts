// Canonical wire-format types for Wellspring.
// MIRROR of `src/imports/CONTRACTS.md §3`.
// Backend: regenerate this file whenever CONTRACTS §3 changes (per PLAN §5).
// Frontend: import from here, never edit.

// ---- Enums ----
// CHANGED 2026-05-10: removed "oz" — every category is now exactly count OR lbs.
export type Unit = "count" | "lbs";

export type DonationSource = "photo_ai" | "quick_pick" | "manual" | "barcode";

export type AuditEventType =
  | "donation.created"
  | "donation.updated"
  | "donation.deleted"
  | "category.created"
  | "category.renamed"
  | "category.archived"
  | "item.created"
  | "item.archived";

// ---- Programs (4 seeded, never user-creatable) ----
export interface Program {
  id: string; // ObjectId hex
  name: string; // "Nutritious Meals Program"
  slug: string; // "nutritious-meals"
  sortOrder: number;
}

// ---- Categories (seeded ~25, runtime CRUD) ----
export interface Category {
  id: string; // ObjectId hex
  name: string; // "Tea and Coffee"
  programId: string;
  programName: string; // denormalized
  defaultUnit: Unit;
  active: boolean; // soft-delete flag
  createdBy: string; // Clerk userId
  updatedAt: string; // ISO
}

// ---- Catalog items ----
export interface CatalogItem {
  id: string; // ObjectId hex
  name: string; // "Canned Black Beans"
  categoryId: string;
  categoryName: string; // denormalized
  programName: string; // denormalized
  defaultUnit: Unit;
  estimatedValuePerUnit: number; // USD per unit
  aliases: string[]; // for AI fuzzy-matching
  active: boolean;
}

// ---- Donations ----
export interface Donation {
  id: string; // ObjectId hex
  loggedBy: string; // Clerk user ID
  // CHANGED 2026-05-09: full name from Clerk; UI abbreviates via lib/format-name.ts
  loggedByName: string; // denormalized — full name (e.g. "Jessica Martinez")
  itemId: string | null; // null when item is not in catalog (manual)
  itemName: string; // always present (denormalized)
  categoryId: string;
  categoryName: string; // snapshot — survives category renames
  programName: string; // snapshot
  quantity: number; // > 0; integer for "count", up to 1dp otherwise
  unit: Unit;
  estimatedValue: number; // USD, total for this entry
  source: DonationSource;
  photoUrl: string | null; // MVP: always null (Vercel Blob deferred)
  notes: string | null;
  donatedAt: string; // ISO date — when received
  createdAt: string; // ISO date — when logged (immutable)
  updatedAt: string; // ISO date — last PATCH; equals createdAt on create
  deleted: boolean; // soft-delete flag (default false)
}

// ---- AI recognition output ----
export interface RecognizedItem {
  // What the AI saw, possibly already matched against the catalog
  itemId: string | null; // null = no catalog match
  name: string; // canonical name if matched, else AI-suggested name
  categoryId: string | null; // null when category itself was unmatched
  categoryName: string; // canonical if matched, AI-suggested otherwise
  programName: string | null; // null when category was unmatched
  // null = AI declined to guess (e.g. lbs items where weight needs a scale).
  // The Review screen shows an empty input and requires the volunteer to fill in.
  suggestedQuantity: number | null;
  unit: Unit;
  estimatedValue: number | null; // qty × catalog price, or null when qty is null
  matched: boolean; // true if itemId !== null
  warning?: "not_in_catalog"; // shown as a red chip in the UI
}

// ---- Reports ----
export interface ReportRow {
  itemName: string;
  categoryId: string;
  categoryName: string; // current name (post-rename)
  programName: string;
  unit: Unit;
  totalQuantity: number;
  totalValue: number;
  entryCount: number;
  averageValue: number; // totalValue / entryCount, rounded to 2dp
}

export interface ReportSummary {
  from: string; // ISO date (inclusive)
  to: string; // ISO date (inclusive)
  totalValue: number; // grand total $
  entryCount: number; // grand total entries
  topItem: string | null; // itemName with highest totalValue, null if empty
  topCategory: string | null; // category name with highest totalValue, null if empty
  rows: ReportRow[]; // sorted by totalValue DESC, ties broken by itemName ASC
}

// ---- Audit log entries (History feed) ----
export interface AuditEvent {
  id: string; // ObjectId hex
  type: AuditEventType;
  actorId: string; // Clerk userId
  actorName: string; // denormalized — full name; UI abbreviates via lib/format-name.ts
  targetId: string; // donation/category/item id
  targetLabel: string; // human label, e.g. "Size 4 Diapers" or "Diapers → Adult Diapers"
  // CHANGED 2026-05-09: backend pre-formats summary with abbreviated actor name via formatDisplayName()
  summary: string; // pre-formatted display string ("Jessica M. logged 24 Size 4 Diapers")
  createdAt: string; // ISO
}

// ---- Profile ----
export interface ProfileResponse {
  user: {
    id: string; // Clerk userId
    name: string; // full name (e.g. "Jessica Martinez"); UI abbreviates
    email: string;
    initials: string; // "JM"
    joinedAt: string; // ISO; first donation OR user.createdAt
  };
  range: { from: string; to: string };
  stats: {
    entryCount: number; // donations logged by this user in range
    totalValue: number; // USD
  };
  topCategories: Array<{
    categoryName: string;
    totalValue: number;
    pct: number; // 0–100, rounded to whole number; sum may be 99–101
  }>; // sorted desc by totalValue, capped to top 5; 6th+ collapsed into "Other"
  recentEntries: Array<{
    donationId: string;
    itemName: string;
    quantity: number;
    unit: Unit;
    estimatedValue: number;
    donatedAt: string; // ISO
  }>; // last 4 by donatedAt DESC, regardless of range
}

// ---- Error envelope ----
export interface ApiError {
  error: {
    code: string; // e.g. "VALIDATION_ERROR"
    message: string; // human-readable
    details?: unknown; // optional structured info (field errors, etc.)
  };
}
