# Wellspring — Frontend ↔ Backend Contract

This file is the **shared interface** between the frontend and backend agents. Each side may assume the other implements this contract exactly. If a change is needed, update this file *first*, then ping the other side.

- **Source of truth for**: API endpoints, request/response shapes, shared TypeScript types, enums, auth model, error format, AI flow.
- **Not the source of truth for**: UI styling (see `wellspring-build-brief.md`), build order or risk tracking (see `PLAN.md`), database internals beyond what crosses the wire.

When this file conflicts with `PLAN.md`, **this file wins** for the wire format. `PLAN.md` wins for build process and rationale.

---

## 1. Conventions

| Concern | Convention |
|---|---|
| **Dates on the wire** | ISO 8601 strings (`"2026-05-09T17:30:00.000Z"`). Backend always returns UTC. Frontend converts to local for display. |
| **Timezone** | All date *bucketing* (preset boundaries, "Today/Yesterday" grouping in History, CSV filename dates) is computed in `America/Los_Angeles`. Wire format stays UTC ISO. Both sides import a shared TZ constant from `lib/timezone.ts`. |
| **Money** | Numbers in **USD dollars** (not cents). Two-decimal precision is fine. `12.50`, not `1250`. |
| **IDs** | All `_id` fields are MongoDB ObjectId hex strings (24 chars) on the wire, **except** `User._id` which is the Clerk user ID string (e.g. `"user_2abc..."`). |
| **Casing** | JSON keys are `camelCase`. |
| **Pagination** | None for MVP. Endpoints that could grow large take a `limit` query param (default 50, max 200). |
| **Content-Type** | All POST/PUT/PATCH bodies are `application/json` unless explicitly noted (image upload uses base64 inside JSON, not multipart). |
| **CSV** | `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="..."`. |
| **Empty results** | Always return `[]` or the canonical shape with zeroes — never `null` or `undefined` for collections/aggregates. |
| **Quantity precision** | Integer for `unit: "count"`. Up to 1 decimal place for `unit: "lbs"`. |
| **Tiebreakers** | When sorting Reports rows by `totalValue` and two rows tie, fall back to alphabetical `itemName` ascending. |

---

## 2. Auth Contract (Clerk)

- Clerk's hosted components handle sign-in / sign-up / password reset. Frontend mounts `<SignIn />`, `<SignUp />`, `<UserButton />`.
- All API routes under `/api/**` (except `/api/health`) require an authenticated Clerk session. Backend gets the user via `auth()` from `@clerk/nextjs/server`.
- **No bearer tokens in headers.** Auth is via the Clerk session cookie, set automatically by Clerk middleware. Frontend does not need to attach anything.
- On every authenticated API call, backend ensures a `users` document exists for the Clerk user (just-in-time upsert on first request — no webhook for MVP).
- **Unauthenticated request → `401`** with the standard error envelope (see §7).
- **401 mid-session handling**: frontend wraps `fetch` once. On any 401 from `/api/**`, the wrapper redirects to `/sign-in`. Backend never returns the user to the previous page — frontend owns the redirect.

```ts
// Backend pattern (reference, not exhaustive):
import { auth } from "@clerk/nextjs/server";
const { userId } = await auth();
if (!userId) return jsonError(401, "UNAUTHENTICATED", "Sign in required");
```

---

## 3. Shared Types (TypeScript)

These types are **canonical**. Both sides should mirror them (a shared `lib/types.ts` is recommended). Backend serializes Mongoose docs to match these; frontend treats these as the API surface.

```ts
// ---- Enums ----
// CHANGED 2026-05-10: removed "oz" — every category is now exactly count OR lbs.
export type Unit = "count" | "lbs";

export type DonationSource = "photo_ai" | "quick_pick" | "manual" | "barcode";

export type AuditEventType =
  | "donation.created" | "donation.updated" | "donation.deleted"
  | "category.created" | "category.renamed" | "category.archived"
  | "item.created"     | "item.archived";

// ---- Programs (4 seeded, never user-creatable) ----
export interface Program {
  id: string;                       // ObjectId hex
  name: string;                     // "Nutritious Meals Program"
  slug: string;                     // "nutritious-meals"
  sortOrder: number;
}

// ---- Categories (seeded ~25, runtime CRUD) ----
export interface Category {
  id: string;                       // ObjectId hex
  name: string;                     // "Tea and Coffee"
  programId: string;
  programName: string;              // denormalized
  defaultUnit: Unit;
  active: boolean;                  // soft-delete flag
  createdBy: string;                // Clerk userId
  updatedAt: string;                // ISO
}

// ---- Catalog items ----
export interface CatalogItem {
  id: string;                       // ObjectId hex
  name: string;                     // "Canned Black Beans"
  categoryId: string;
  categoryName: string;             // denormalized
  programName: string;              // denormalized
  defaultUnit: Unit;
  estimatedValuePerUnit: number;    // USD per unit
  aliases: string[];                // for AI fuzzy-matching
  active: boolean;
}

// ---- Donations ----
export interface Donation {
  id: string;                       // ObjectId hex
  loggedBy: string;                 // Clerk user ID
  loggedByName: string;             // denormalized
  itemId: string | null;            // null when item is not in catalog (manual)
  itemName: string;                 // always present (denormalized)
  categoryId: string;
  categoryName: string;             // snapshot — survives category renames
  programName: string;              // snapshot
  quantity: number;                 // > 0; integer for "count", up to 1dp otherwise
  unit: Unit;
  estimatedValue: number;           // USD, total for this entry
  source: DonationSource;
  photoUrl: string | null;          // MVP: always null (Vercel Blob deferred)
  notes: string | null;
  donatedAt: string;                // ISO date — when received
  createdAt: string;                // ISO date — when logged (immutable)
  updatedAt: string;                // ISO date — last PATCH; equals createdAt on create
  deleted: boolean;                 // soft-delete flag (default false)
}

// ---- AI recognition output ----
export interface RecognizedItem {
  // What the AI saw, possibly already matched against the catalog
  itemId: string | null;            // null = no catalog match
  name: string;                     // canonical name if matched, else AI-suggested name
  categoryId: string | null;        // null when category itself was unmatched
  categoryName: string;             // canonical if matched, AI-suggested otherwise
  programName: string | null;       // null when category was unmatched
  suggestedQuantity: number;
  unit: Unit;
  estimatedValue: number;           // qty × catalog price, or AI guess for unmatched
  matched: boolean;                 // true if itemId !== null
  warning?: "not_in_catalog";       // shown as a red chip in the UI
}

// ---- Reports ----
export interface ReportRow {
  itemName: string;
  categoryId: string;
  categoryName: string;             // current name (post-rename)
  programName: string;
  unit: Unit;
  totalQuantity: number;
  totalValue: number;
  entryCount: number;
  averageValue: number;             // totalValue / entryCount, rounded to 2dp
}

export interface ReportSummary {
  from: string;                     // ISO date (inclusive)
  to: string;                       // ISO date (inclusive)
  totalValue: number;               // grand total $
  entryCount: number;               // grand total entries
  topItem: string | null;           // itemName with highest totalValue, null if empty
  topCategory: string | null;       // category name with highest totalValue, null if empty
  rows: ReportRow[];                // sorted by totalValue DESC, ties broken by itemName ASC
}

// ---- Audit log entries (History feed) ----
export interface AuditEvent {
  id: string;                       // ObjectId hex
  type: AuditEventType;
  actorId: string;                  // Clerk userId
  actorName: string;                // denormalized
  targetId: string;                 // donation/category/item id
  targetLabel: string;              // human label, e.g. "Size 4 Diapers" or "Diapers → Adult Diapers"
  summary: string;                  // pre-formatted display string ("Jessica M. logged 24 Size 4 Diapers")
  createdAt: string;                // ISO
}

// ---- Error envelope ----
export interface ApiError {
  error: {
    code: string;                   // e.g. "VALIDATION_ERROR"
    message: string;                // human-readable
    details?: unknown;              // optional structured info (field errors, etc.)
  };
}
```

---

## 4. API Endpoints

All endpoints are under the Next.js App Router at `/api/**`. All require auth except `/api/health`.

### 4.1 Catalog

#### `GET /api/catalog`

List active catalog items, optionally filtered by category. Used by Quick Pick and Manual Entry screens.

**Query params:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `categoryId` | ObjectId hex | (none) | If omitted, returns items across all categories. |
| `q` | `string` | (none) | Optional case-insensitive substring match on `name` + `aliases`. |
| `active` | `"true" \| "false"` | `"true"` | MVP only sends active items. |

**Response 200:**
```json
{ "items": [ /* CatalogItem[] */ ] }
```

---

### 4.2 Programs

#### `GET /api/programs`

List the 4 seeded programs. Sorted by `sortOrder` ASC. Used by the inline "+ New category" modal on AI Review (program select).

**Response 200:**
```json
{ "programs": [ /* Program[] */ ] }
```

No write endpoints — programs are static. Out-of-scope for MVP to add a 5th program.

---

### 4.3 Categories

Inline category CRUD lives here. The AI Review screen and (optionally) Manual Entry call into these.

#### `GET /api/categories`

**Query params:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `programId` | ObjectId hex | (none) | If set, only categories under that program. |
| `active` | `"true" \| "false"` | `"true"` | Pickers always send `true`. |

**Response 200:**
```json
{ "categories": [ /* Category[] */ ] }
```

#### `POST /api/categories`

Create a new category. Called by the "+ New category" modal on AI Review.

**Request body:**
```ts
{
  name: string;                     // non-empty, trimmed
  programId: string;                // must reference an existing Program
  defaultUnit: Unit;
}
```

**Response 201:**
```json
{ "category": /* Category */ }
```

**Errors:**
- `400 VALIDATION_ERROR` — empty name, unknown `programId`, bad `defaultUnit`.
- `409 CONFLICT` — `name` already exists (case-insensitive) within the same program among active rows.

Emits a `category.created` audit event.

#### `PATCH /api/categories/:id`

Edit fields of an existing category. Used for inline rename and unit change.

**Request body** (any subset):
```ts
{ name?: string; defaultUnit?: Unit; }
```

**Response 200:**
```json
{ "category": /* Category */ }
```

**Errors:** `400`, `404`, `409` (rename collides with another active category in the same program).

A rename emits `category.renamed`; the event's `summary` includes the old name (e.g. `"Diapers → Adult Diapers"`).

#### `DELETE /api/categories/:id`

**Soft delete.** Sets `active: false`. Items in `itemCatalog` referencing this category remain in the DB but are filtered from pickers. Past donations with snapshot `categoryName` continue to display correctly.

**Response 200:**
```json
{ "archived": true, "id": "..." }
```

**Errors:** `401`, `404`.

Emits `category.archived`.

---

### 4.4 Donations

#### `POST /api/donations`

Create one or more donations in a single call. **Always accepts an array** to keep the bulk-save path (AI Review, Quick Pick multi-select) and single-save path (Manual Entry) on the same endpoint.

**Request body:**
```ts
{
  donations: Array<{
    itemId: string | null;          // null for manual / not-in-catalog
    itemName: string;               // required even if itemId is set (snapshot)
    categoryId: string;             // must reference an active Category
    quantity: number;               // > 0; integer for "count", up to 1dp otherwise
    unit: Unit;
    estimatedValue: number;         // >= 0, total $ for this entry
    source: DonationSource;
    photoUrl?: string | null;       // MVP: always null
    notes?: string | null;
    donatedAt?: string;             // ISO date; defaults to server now if omitted (only Manual Entry sets this)
  }>
}
```

**Response 201:**
```json
{ "donations": [ /* Donation[] */ ], "createdCount": 3 }
```

**Errors:**
- `400 VALIDATION_ERROR` — invalid quantity, unknown enum, missing required field, unknown `categoryId`.
- `401 UNAUTHENTICATED`.

**Backend notes:**
- Always denormalizes `loggedBy` / `loggedByName` from the Clerk session — frontend cannot set these.
- Denormalizes `categoryName` + `programName` from the looked-up `Category` — frontend cannot set these.
- `createdAt` is server-set, immutable. `updatedAt` is set to the same value on create.
- `deleted` is set to `false` on create.
- Emits one `donation.created` audit event per donation.

#### `GET /api/donations`

List donations. Used by Reports' raw-data drill-downs and (optionally) by mobile views that need plain donation lists.

**Note:** History uses `GET /api/events` (§4.8), not this endpoint.

**Query params:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `mine` | `"true" \| "false"` | `"false"` | If `true`, only returns donations logged by the current user. |
| `from` | ISO date | (none) | Filter `donatedAt >= from`. |
| `to` | ISO date | (none) | Filter `donatedAt <= to`. |
| `includeDeleted` | `"true" \| "false"` | `"false"` | Default omits soft-deleted rows. |
| `limit` | number | `50` | Max `200`. |

**Response 200:**
```json
{ "donations": [ /* Donation[] sorted by donatedAt DESC */ ] }
```

#### `PATCH /api/donations/:id`

Edit an existing donation. Only the original logger may PATCH their own entry.

**Request body** (any subset):
```ts
{
  quantity?: number;
  unit?: Unit;
  estimatedValue?: number;
  notes?: string | null;
  donatedAt?: string;               // ISO
  categoryId?: string;
}
```

**Response 200:**
```json
{ "donation": /* Donation (with updated updatedAt) */ }
```

**Errors:** `400`, `401`, `403 FORBIDDEN` (not the original logger), `404`.

Emits a `donation.updated` event whose `summary` includes a brief diff (e.g. `"qty 12 → 24"`).

#### `DELETE /api/donations/:id`

**Soft delete.** Sets `deleted: true`. Row is hidden from `GET /api/donations` and from Reports aggregations (which filter `deleted: { $ne: true }`). Audit log keeps referencing the row.

Only the original logger may delete their own entry.

**Response 200:**
```json
{ "deleted": true, "id": "..." }
```

**Errors:** `401`, `403 FORBIDDEN`, `404`.

Emits a `donation.deleted` event.

---

### 4.5 AI Recognition

#### `POST /api/recognize`

Send a photo, get back a list of suggested items already matched against the catalog where possible. **Does not write anything to the DB** — frontend must follow up with `POST /api/donations` after the volunteer confirms.

**Request body:**
```ts
{
  image: string;                    // base64-encoded JPEG/PNG/WebP
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}
```

The `data:image/...;base64,` prefix is tolerated — backend strips it if present.

**Response 200:**
```ts
{
  items: RecognizedItem[];          // see shared types
  rawCount: number;                 // how many distinct items the AI returned
  matchedCount: number;             // how many of those matched a catalog item
}
```

**Errors:**
- `400 INVALID_IMAGE` — bad base64 / unsupported mime / too large.
- `502 AI_UNAVAILABLE` — Gemini call failed or timed out. Frontend falls back to Quick Pick / Manual.
- `429 RATE_LIMITED` — Gemini rate limit. Same fallback.

**Image limits:** ≤ 5 MB encoded. Frontend should downscale very large captures before posting (longest edge 2048px is plenty for Gemini).

**Backend behavior:**
1. Reads the active categories list (cached 60s in memory, see `lib/categories-cache.ts` in PLAN.md). Builds Gemini's `responseSchema` with `category` enum populated dynamically from those names.
2. Calls `gemini-2.5-flash` with the dynamic `responseSchema`.
3. For each AI suggestion, attempts to match `name` against `itemCatalog.name + aliases` (case-insensitive substring is fine for MVP).
4. On match: replaces `name` with the catalog's canonical `name`, sets `itemId`, `categoryId`, `categoryName`, `programName`, `unit = catalog.defaultUnit` (unless AI specified a clearly different one), and `estimatedValue = suggestedQuantity * catalog.estimatedValuePerUnit`. Sets `matched: true`.
5. On miss: sets `itemId: null`, `categoryId: null`, `programName: null`, leaves AI's `name`/`categoryName`/`unit`/`quantity` as-is, sets `warning: "not_in_catalog"`, and uses a sensible fallback `estimatedValue` (AI guess or `0`). `matched: false`.
6. If Gemini returns 0 items at all (or `matchedCount === 0` after matching), **still returns 200** with `{ items, rawCount, matchedCount: 0 }` — frontend uses the count to trigger its bail-out flow (see §6).

**Cache invalidation:** any successful `POST/PATCH/DELETE /api/categories` invalidates the in-memory categories cache, so Gemini sees newly-created categories on the next call.

---

### 4.6 Reports

#### `GET /api/reports`

Aggregations for the Reports screen (mobile and iPad).

**Query params:**
| Param | Type | Required | Notes |
|---|---|---|---|
| `from` | ISO date | yes | Inclusive start. |
| `to` | ISO date | yes | Inclusive end. |
| `groupBy` | `"item" \| "category" \| "program"` | no, default `"item"` | Determines how `rows` is grouped. |
| `mine` | `"true" \| "false"` | no, default `"false"` | Reserved; MVP frontend does not send it. |

**Response 200:** A single `ReportSummary` object (see shared types).

**Backend notes:**
- Filters `deleted: { $ne: true }` on donations.
- Aggregations group by `categoryId` / `programId` internally (so renames consolidate); the response uses the **current** name from the `categories` / `programs` collections.
- The iPad layout uses `topItem`, `topCategory`, `entryCount`, `totalValue` for the four stat cards. The mobile layout uses just `totalValue` and `entryCount`. Both render `rows` as the by-item table.
- The horizontal bar chart on iPad uses `rows.slice(0, 5)` — backend does not need a separate endpoint.

#### `GET /api/reports/csv`

Returns a CSV download of donations in the date range. Same date filtering as `/api/reports`.

**Query params:** same `from`, `to` as above.

**Response 200:**
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="wellspring-donations-YYYY-MM-DD-to-YYYY-MM-DD.csv"` — both dates computed in `America/Los_Angeles`.

**Columns (in this order, with this exact header row):**
```
Date,Item,Category,Program,Quantity,Unit,Estimated Value,Source,Logged By,Notes
```

One row per donation in the range, sorted by `donatedAt` ASC. `Date` is `YYYY-MM-DD` (no time, in Pacific). `Estimated Value` is a plain number with two decimals, no `$` sign — Excel handles formatting. `Source` uses human labels: `AI Photo`, `Quick Pick`, `Manual`, `Barcode` (not the raw enum). `Category` and `Program` use the snapshot names from the donation row (so historical donations preserve their original categorization for tax filing).

---

### 4.7 Audit Events (History feed)

#### `GET /api/events`

Returns the audit log feed for the History screen.

**Query params:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `from` | ISO date | (none) | Filter `createdAt >= from`. |
| `to` | ISO date | (none) | Filter `createdAt <= to`. |
| `actor` | Clerk userId | (none) | Optional filter by who. |
| `type` | comma-separated `AuditEventType` | (none) | E.g. `donation.created,donation.updated`. |
| `limit` | number | `50` | Max `200`. |

**Response 200:**
```json
{ "events": [ /* AuditEvent[] sorted by createdAt DESC */ ] }
```

Backend writes to the `events` collection on every donation/category/item write; this endpoint just reads.

---

### 4.8 Health

#### `GET /api/health`

Unauthenticated. Returns `{ "ok": true }`. Used for deploy smoke-test.

---

## 5. Date Range Presets (frontend convention)

The Reports screen has these preset chips. Frontend computes `from` and `to` and passes them to the API — backend never interprets preset names. **All preset boundaries are computed in `America/Los_Angeles`.** Frontend converts to UTC ISO strings before sending.

| Chip | `from` (Pacific) | `to` (Pacific) |
|---|---|---|
| This month | first day of current month, 00:00:00 | now |
| Last month | first day of previous month, 00:00:00 | last day of previous month, 23:59:59 |
| Q2 | Apr 1, 00:00:00 of current year | Jun 30, 23:59:59 of current year |
| YTD | Jan 1, 00:00:00 of current year | now |
| Custom | user-picked | user-picked |

The History screen's "Today" / "Yesterday" / older buckets are also computed in Pacific.

---

## 6. AI Photo Flow (end-to-end sequence)

This is the demo centerpiece — both sides must agree on the exact sequence.

```
[Frontend: Photo Capture screen]
  1. User taps "Open Camera" → <input type="file" capture="environment">
  2. Read file as base64 (data: prefix can be left in place, backend strips it)
  3. POST /api/recognize  { image, mimeType }
       → loading spinner

[Backend: /api/recognize]
  4. auth() → userId
  5. validate image size + mime
  6. read active categories (60s cache) → build dynamic Gemini responseSchema
  7. Gemini call
  8. Match each result against itemCatalog
  9. Return { items: RecognizedItem[], rawCount, matchedCount }

[Frontend: AI Review screen]
 10. If matchedCount === 0 → toast "Could not match item to catalog. Try
       again or manually select." → router.push("/log"). STOP.
 11. Otherwise render one editable card per item:
       - quantity stepper, unit dropdown, $ field, trash icon
       - CategoryDropdown (tap to change; footer "+ New category" opens modal)
       - red "Not in catalog" chip when warning === "not_in_catalog"
       - amber "Edited" chip when user has changed any field locally
 11.5 If user opens "+ New category" modal → POST /api/categories
       → on 201, set the new category as the current row's selection;
         it now appears in every other row's dropdown too.
 12. Sticky footer shows running total of (count, sum estimatedValue)
 13. User taps "Save all":
       POST /api/donations { donations: [{ ...row, categoryId, source: "photo_ai" }] }

[Backend: /api/donations]
 14. Insert all (Mongo bulk insert), denormalize loggedBy/loggedByName,
       denormalize categoryName/programName from categoryId
 15. Emit one donation.created event per row
 16. Return { donations, createdCount }

[Frontend]
 17. Toast "Saved N donations" → navigate to History or Log home
```

**Failure handling:** if step 3 returns `502` or `429`, frontend shows a toast "AI unavailable — try Quick Pick" and offers a button to navigate to Quick Pick.

---

## 7. Error Envelope

Every non-2xx response uses this exact shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "quantity must be greater than 0",
    "details": { "field": "donations[2].quantity", "value": 0 }
  }
}
```

**Standard codes:**
| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed body, bad enum, out-of-range number, unknown `categoryId` / `programId`. |
| 400 | `INVALID_IMAGE` | `/api/recognize` couldn't decode the image. |
| 401 | `UNAUTHENTICATED` | No Clerk session. Frontend's fetch wrapper redirects to `/sign-in`. |
| 403 | `FORBIDDEN` | Authenticated but not allowed (e.g. PATCH/DELETE on someone else's donation). |
| 404 | `NOT_FOUND` | ID doesn't exist. |
| 409 | `CONFLICT` | Category name duplicates an existing active category in the same program. |
| 429 | `RATE_LIMITED` | Gemini or future per-user limits. |
| 500 | `INTERNAL` | Unexpected server error. |
| 502 | `AI_UNAVAILABLE` | Gemini call failed/timed out. |

Frontend has one helper that reads `error.code` and shows a matching toast — never a raw stack trace.

---

## 8. Database (collections at-a-rest)

Full schema details (Mongoose models, indexes, aggregation pipeline) live in `PLAN.md` §"MongoDB Schema". This section just enumerates what exists so neither side is surprised.

- **`users`** — `{ _id: clerkUserId, name, email, createdAt }`. JIT-upserted on first authenticated API call.
- **`programs`** — 4 seeded program rows. Never written by the app.
- **`categories`** — ~25 seeded categories from Jessica's email, plus any volunteer-created additions. Soft-delete via `active: false`.
- **`itemCatalog`** — seeded items, references `categoryId`. Soft-delete via `active: false`. Frontend never writes to it in MVP (no item-level admin UI yet).
- **`donations`** — denormalized snapshots (itemName, categoryName, programName). The hot collection. Soft-delete via `deleted: true`.
- **`events`** — append-only audit log. Every donation / category / item write emits one row.

The wire format (`CatalogItem`, `Donation`, `Category`, `AuditEvent`, etc.) is what the frontend sees — backend is responsible for projecting Mongoose docs into these shapes (e.g. `_id` → `id`, dates → ISO strings).

---

### 4.9 Profile

#### `GET /api/profile/me`

Returns aggregated stats for the signed-in volunteer. Used by the mobile + iPad Profile screens.

**Query params:**
| Param | Type | Required | Notes |
|---|---|---|---|
| `from` | ISO date | yes | Inclusive start of the selected time-range chip. |
| `to` | ISO date | yes | Inclusive end. |

**Response 200:**
```ts
{
  user: {
    id: string;                       // Clerk userId
    name: string;                     // "Jessica M."
    email: string;
    initials: string;                 // "JM"
    joinedAt: string;                 // ISO; first donation OR user.createdAt
  };
  range: { from: string; to: string };
  stats: {
    entryCount: number;               // donations logged by this user in range
    totalValue: number;               // USD
  };
  topCategories: Array<{
    categoryName: string;
    totalValue: number;
    pct: number;                      // 0–100, rounded to whole number; sum may be 99–101
  }>;                                 // sorted desc by totalValue, capped to top 5; 6th+ collapsed into "Other"
  recentEntries: Array<{
    donationId: string;
    itemName: string;
    quantity: number;
    unit: Unit;
    estimatedValue: number;
    donatedAt: string;                // ISO
  }>;                                 // last 4 by donatedAt DESC, regardless of range
}
```

**Backend notes:**
- Filters `deleted: { $ne: true }` and `loggedBy === userId` for stats + topCategories.
- `recentEntries` ignores the `from`/`to` window — it's a "what have I been doing" feed for the right column on iPad.
- Empty range still returns `stats: { entryCount: 0, totalValue: 0 }` and `topCategories: []`.

---

## 9. Out of Scope for MVP (do not implement, do not assume)

If a request needs any of these, write a comment and skip — both agents agree to defer:

- **Hard delete** of any record (donations, categories, items). Soft delete only.
- **Runtime creation of Programs** — only the 4 seeded programs exist.
- **Item-level admin UI** (creating/renaming items in `itemCatalog`). Inline category CRUD is in scope; item CRUD is not.
- **Cross-volunteer edit** — only the original logger may PATCH or DELETE their own donation.
- **Webhooks** (Clerk → Mongo user mirror is JIT, not webhook-driven).
- **Pagination cursors** — rely on `limit`.
- **Real-time updates / websockets** — History is poll-on-mount.
- **File upload to Vercel Blob** — `photoUrl` field exists in the schema but MVP always sets it `null`. Image is sent base64 to `/api/recognize` and not persisted.
- **Per-user rate limiting**.
- **Multi-tenancy** — single Wellspring org assumed.
- **Audit-log search / advanced filtering** beyond `actor` + `type` + date range.

---

## 10. Change Protocol

If an agent needs to change anything in this file:

1. Update this file with the new shape.
2. Add a one-line note at the top of the relevant section: `// CHANGED 2026-05-09: ...`
3. Tell the other agent (or the human) before relying on the new shape.

The cost of out-of-sync agents at 3am is much higher than the cost of editing a markdown file.
