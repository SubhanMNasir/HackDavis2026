# Wellspring Donation Logging System — 24h Hackathon Plan

## Context

Wellspring is a small nonprofit that needs to replace a paper-based donation log. Their pain points are illegible handwriting, slow page-flipping, and no way to pull totals on demand. Per Jessica (the client), the real requirements are:

- **Track incoming donations only** — no inventory or outgoing tracking
- **Estimated dollar values matter** for tax-purpose reporting
- **Most items have no barcode** — meal program food especially. Produce/food is logged by **weight (lbs)**, hygiene/diapers by **count**
- **Multiple volunteers logging simultaneously** during giveaway days
- They have a **fixed list of commonly-accepted items** that should seed the catalog
- **Add / rename / soft-archive donation categories at runtime** — Jessica's email asks for this (e.g. spinning up a "Dog Leashes" category on the spot); inline from AI Review, no separate admin screen
- **Audit-log every write** so any volunteer can see who logged / edited / archived what — replaces the original "Recent" tab with a "History" team feed

**Constraints baked into this plan:**
- 24-hour build window
- 4 people, new to React/Next.js + Node + MongoDB
- Mobile-first (phones + iPad), wifi assumed (no offline)
- MongoDB Atlas required (prize track)
- **Gemini API** for vision (also a prize track)
- Auth: Clerk (email + password with reset)
- Primary input: **AI photo recognition + quick-pick from seeded catalog**, manual fallback
- Reports: **dashboard + CSV export** (no scheduled emails for MVP)
- **Timezone**: all date bucketing is in `America/Los_Angeles` (Wellspring's TZ); wire format stays UTC ISO

**Goal:** Ship a polished, mobile-friendly MVP that demos cleanly: a volunteer signs in, snaps a photo of a pile of donations, AI fills the form, they confirm, and a report tab shows totals + tax values for any date range.

---

## Tech Stack

Boring, well-documented choices. The team is learning the stack — every "we'll figure it out" is a 4-hour hole at 3am.

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | One repo, one deploy. File-based routing + API routes mean no separate backend project to wire up. |
| Language | **TypeScript** | Catches a class of bugs that would otherwise eat hours late at night. |
| Styling | **Tailwind CSS** | Fastest path to mobile-friendly UI without a designer. |
| Components | **shadcn/ui** | Copy-paste accessible primitives (Button, Dialog, Form, Input, Tabs, Card). Massive shortcut. |
| Forms | **react-hook-form + zod** | Standard pairing, great mobile keyboard handling. |
| Auth | **Clerk** | `<SignIn />` / `<SignUp />` / `<UserButton />` drop-in. Free tier covers hackathon. Email/password + reset out of the box. |
| Database | **MongoDB Atlas** (free M0 cluster) + **mongoose** | Mongoose's schema-as-model is gentler for a learning team than the raw driver. |
| AI vision | **Gemini API**, `gemini-2.5-flash` (`@google/genai` SDK) | Fast, generous free tier, native multimodal. Use `responseSchema` for strict JSON output — better than prompt-engineering JSON. Counts toward Gemini prize track. |
| File upload | Plain `<input type="file" capture="environment">` | Native camera capture on mobile, no library. Upload to Vercel Blob or pass directly as base64/inlineData to Gemini. |
| Charts (stretch) | **Recharts** | Only if there's time for the dashboard polish pass. |
| Timezone helper | **date-fns-tz** (or `@date-fns/tz`) | Shared `America/Los_Angeles` bucketing on both client and server. Deterministic preset boundaries. |
| Hosting | **Vercel** | One-click deploy from Git, free tier, env vars in dashboard. |

**Anti-recommendations:** No Redux/Zustand (use React Query or server components). No tRPC (overkill, learning curve). No custom design system (shadcn only). No microservices.

---

## System Architecture

```
┌──────────────────────────────────────────────┐
│  Next.js app (Vercel)                        │
│                                              │
│  ┌────────────────┐    ┌───────────────────┐ │
│  │ Mobile-first   │    │ Server actions    │ │
│  │ React UI       │───▶│ + API routes      │ │
│  │ (App Router)   │    │ (Next.js)         │ │
│  └────────────────┘    └───────────────────┘ │
│         │                       │            │
└─────────┼───────────────────────┼────────────┘
          │                       │
     Clerk auth              Mongoose driver
          │                       │
          ▼                       ▼
   ┌────────────┐         ┌──────────────────┐
   │   Clerk    │         │  MongoDB Atlas   │
   │  (hosted)  │         │  (M0 free tier)  │
   └────────────┘         └──────────────────┘
                                  │
                         Vision API call
                                  │
                                  ▼
                         ┌──────────────────┐
                         │   Gemini API     │
                         │  (2.5 Flash, via │
                         │   @google/genai) │
                         └──────────────────┘
```

**Data flow for the photo entry path** (the centerpiece demo):
1. Volunteer taps "Log donations" → "📷 Photo"
2. Native camera opens (`<input capture="environment">`)
3. Image uploaded as base64 to `/api/recognize`
4. Server reads active categories list (cached 60s) and builds Gemini's `responseSchema.enum` *dynamically* — newly-created categories are immediately suggestable
5. Server calls Gemini 2.5 Flash with the dynamic `responseSchema`
6. Server matches each suggested item against `itemCatalog` (case-insensitive name + alias matching), filling in `categoryId`, `categoryName`, `programName`, `defaultUnit`, and `estimatedValuePerUnit`. If `matchedCount === 0`, returns empty result — frontend bails to Log Home with a toast.
7. Returns `{items, rawCount, matchedCount}` to client
8. Volunteer sees an editable list with an inline `CategoryDropdown` per row (footer "+ New category" calls `POST /api/categories` and re-binds), fixes anything wrong, taps "Save all"
9. Client posts to `/api/donations` (single bulk insert) — server denormalizes `categoryName` + `programName` from `categoryId` and emits a `donation.created` audit event per row

---

## MongoDB Schema

Six collections. Aggressive denormalization on `donations` so reports stay simple. The `events` collection is append-only — no in-place updates or deletes.

### `users`
Mirror of Clerk users for joining/denormalization.
```js
{
  _id: String,            // Clerk user ID
  name: String,
  email: String,
  createdAt: Date,
}
```

### `programs`
Seeded once with the 4 programs from Jessica's email. Never written by the app.
```js
{
  _id: ObjectId,
  name: String,                       // "Nutritious Meals Program"
  slug: String,                       // "nutritious-meals"
  sortOrder: Number,
}
```

### `categories`
Seeded with ~25 categories from Jessica's email. Runtime CRUD via `/api/categories` (POST/PATCH/DELETE).
```js
{
  _id: ObjectId,
  name: String,                       // "Tea and Coffee"
  programId: ObjectId,                // ref to programs
  programName: String,                // denormalized
  defaultUnit: String,                // "count" | "lbs" | "oz"
  active: Boolean,                    // soft-delete flag
  createdBy: String,                  // Clerk userId
  createdAt: Date,
  updatedAt: Date,
}
```

### `itemCatalog`
Seeded from Jessica's accepted-items list before the hackathon starts.
```js
{
  _id: ObjectId,
  name: String,                       // "Canned Black Beans"
  categoryId: ObjectId,               // ref to categories
  categoryName: String,               // denormalized
  programName: String,                // denormalized
  defaultUnit: String,                // "count" | "lbs" | "oz"
  estimatedValuePerUnit: Number,      // USD
  aliases: [String],                  // for AI fuzzy-matching: ["black beans", "canned beans"]
  active: Boolean,                    // hide from pickers without losing history
  createdAt: Date,
  updatedAt: Date,
}
```

### `donations` (the hot collection)
```js
{
  _id: ObjectId,
  loggedBy: String,                   // Clerk user ID
  loggedByName: String,               // denormalized
  itemId: ObjectId | null,            // ref to itemCatalog; null when not in catalog
  itemName: String,                   // denormalized — survives catalog edits
  categoryId: ObjectId,               // ref to categories
  categoryName: String,               // snapshot — survives renames (CSV uses this)
  programName: String,                // snapshot
  quantity: Number,                   // integer for "count", up to 1dp for lbs/oz
  unit: String,                       // "count" | "lbs" | "oz"
  estimatedValue: Number,             // total $ for this entry
  source: String,                     // "photo_ai" | "quick_pick" | "manual" | "barcode"
  photoUrl: String | null,            // MVP: always null (Vercel Blob deferred)
  notes: String | null,
  donatedAt: Date,                    // when received (Manual Entry can backdate; AI/Quick Pick use server now)
  createdAt: Date,                    // immutable
  updatedAt: Date,                    // bumped on PATCH
  deleted: Boolean,                   // soft-delete flag (default false)
}
```

### `events` (audit log, append-only)
Every donation/category/item write emits one row via `lib/audit.ts`.
```js
{
  _id: ObjectId,
  type: String,                       // AuditEventType (see CONTRACTS.md §3)
  actorId: String,                    // Clerk userId
  actorName: String,                  // denormalized
  targetId: ObjectId,                 // donation/category/item id
  targetLabel: String,                // human label, e.g. "Size 4 Diapers"
  summary: String,                    // pre-formatted display string
  createdAt: Date,
}
```

### Indexes
```js
// donations
{ donatedAt: -1 }                            // primary date-range scans
{ categoryId: 1, donatedAt: -1 }             // "diapers this month"
{ programName: 1, donatedAt: -1 }            // program-grouped reports
{ itemId: 1, donatedAt: -1 }                 // "this specific item over time"
{ loggedBy: 1, createdAt: -1 }               // "my recent entries"
{ deleted: 1, donatedAt: -1 }                // active-only queries are the common path

// itemCatalog
{ categoryId: 1, active: 1 }                 // picker queries
{ name: "text", aliases: "text" }            // AI fuzzy matching

// categories
{ programId: 1, active: 1 }                  // picker grouped by program
{ name: 1, programId: 1 }                    // unique-within-program (partial filter on active: true)

// events
{ createdAt: -1 }                            // History feed default sort
{ actorId: 1, createdAt: -1 }                // filter by who
{ type: 1, createdAt: -1 }                   // filter by event type
```

### Reports aggregation pattern
Group by `categoryId` (so renames consolidate cleanly) and `$lookup` the current category name. Always exclude soft-deleted donations.
```js
db.donations.aggregate([
  { $match: { deleted: { $ne: true }, donatedAt: { $gte: start, $lte: end } } },
  { $group: {
      _id: { categoryId: "$categoryId", itemName: "$itemName", unit: "$unit" },
      totalQuantity: { $sum: "$quantity" },
      totalValue:    { $sum: "$estimatedValue" },
      entryCount:    { $sum: 1 },
  }},
  { $lookup: { from: "categories", localField: "_id.categoryId", foreignField: "_id", as: "cat" } },
  { $sort: { totalValue: -1 } },
])
```

---

## Feature Breakdown — MVP

In priority order. Anything below the line is stretch.

1. **Auth** — sign up, sign in, password reset (Clerk drop-in components)
2. **Seeded programs + categories + item catalog** — 4 programs, ~25 categories, Jessica's accepted-item list; loaded by `seed-programs.ts`, `seed-categories.ts`, and the existing item seeder
3. **Quick-pick entry** — browse catalog by category, tap item, set quantity, save (the workhorse path)
4. **AI photo entry** — snap photo → AI suggests items → review/edit → bulk save (the demo moment); bails to Log Home with a toast when `matchedCount === 0`
5. **Manual entry fallback** — for items not in catalog; only screen with a backdate-able `donatedAt` picker
6. **Per-entry editable** — unit and $ value can be overridden at log time
7. **Inline category CRUD from AI Review** — `CategoryDropdown` with footer "+ New category"; rename + soft-archive available too
8. **Reports dashboard** — date range picker (presets: this month, last month, Q2, YTD, custom; computed in `America/Los_Angeles`) + totals table by item with $ subtotals and grand total; supports `groupBy=item|category|program`
9. **CSV export** — one-click from any report view; columns include `Program`; `Source` uses human labels
10. **Edit / soft-delete past donations** — `PATCH/DELETE /api/donations/:id`, only original logger
11. **History feed** — every volunteer sees every write event (donations + category writes) with actor names, grouped Today / Yesterday / older (Pacific)
12. **Mobile-first responsive layout** — bottom nav bar on mobile (Log / Reports / **History** / Profile), sidebar on iPad

### Stretch (in attack order if time permits)
1. Barcode scanning fast-lane (html5-qrcode) — only for barcoded categories
2. PDF export for tax filing (react-pdf)
3. Charts on dashboard (Recharts: top items bar chart, daily trend line)
4. Item-level admin screen (add/edit/retire individual catalog items, beyond the per-row inline create that AI Review provides)
5. Scheduled email reports (Vercel Cron + Resend)
6. ~~Donor tracking~~ — cut, see Build Order
7. ~~Multi-language UI~~ — cut, see Build Order

---

## 24-Hour Build Order (4 people)

Roles are suggestions — swap if someone's stronger in another area. The point is **parallelism with clear boundaries**.

### Hours 0–2 — Setup (everyone in parallel, get unblocked)
- **A**: `npx create-next-app` + Clerk + deploy to Vercel. **Skeleton must be live with auth working by hour 2.**
- **B**: MongoDB Atlas cluster + connection string + mongoose models for `User`, `Program`, `Category`, `ItemCatalog`, `Donation`, `Event` + seed scripts (`seed-programs.ts`, `seed-categories.ts`, `seed-catalog.ts`).
- **C**: Tailwind + shadcn install, mobile shell (header, bottom tab bar with `Log` / `Reports` / `History` / `Profile`, route stubs for `/log`, `/reports`, `/history`)
- **D**: Gemini API key from Google AI Studio, prove out the vision call in a small standalone script using `@google/genai` + `responseSchema`. **Do not skip this.** Iterate until it returns clean structured output for 3 sample photos.

### Hours 2–8 — Core entry flow
- **A**: Wire Clerk → mirror user in Mongo on first sign-in (just-in-time on first authenticated API call). Build the fetch wrapper that redirects to `/sign-in` on 401.
- **B**: `POST /api/donations`, `GET /api/donations`, `GET /api/catalog`, `GET /api/programs`, `GET /api/categories`. Wire `lib/audit.ts` and emit `donation.created` events.
- **C**: Quick-pick UI — browse catalog by category, tap → quantity stepper → save. This is the workhorse, polish it.
- **D**: Photo capture component (`<input capture="environment">`) + `/api/recognize` endpoint that calls Gemini and matches against catalog. Build `lib/categories-cache.ts` for the dynamic enum.

### Hours 8–14 — AI integration + reports + audit/CRUD
- **A**: AI review/confirm screen — receives `/api/recognize` output, renders editable rows, bulk-save to `/api/donations`. Includes the inline `CategoryDropdown` component (with "+ New category" modal that calls `POST /api/categories`).
- **B**: Aggregation pipeline + `GET /api/reports?from=&to=&groupBy=`. Plus `POST/PATCH/DELETE /api/categories`, `PATCH /api/donations/:id`, `DELETE /api/donations/:id` (soft), `GET /api/events`. Each write emits the right audit event via `lib/audit.ts`. Cache invalidation on category writes.
- **C**: Reports page — date range picker (presets + custom, all in `America/Los_Angeles` via `lib/timezone.ts`), totals table, grand total $ value.
- **D**: CSV export (server-side, returns `text/csv`) — column order `Date,Item,Category,Program,Quantity,Unit,Estimated Value,Source,Logged By,Notes`; human source labels; Pacific filename.

### Hours 14–20 — Polish + integration
- All: bug fixes, **test on actual phones** (multiple devices simultaneously), error states, loading states, success toasts
- **A**: Build `/history` page (replaces `/me`) — feed of `AuditEvent`s grouped Today / Yesterday / older (Pacific). Tap-to-edit/delete on own donation events.
- **B**: Realistic demo data seed (so dashboard + History aren't empty during judging) — multiple actors, multiple event types.
- **C**: Empty states, error states, mobile polish pass. Verify the AI Review bail-out toast renders cleanly.
- **D**: Hardening — Gemini fallback toasts, downscale large images client-side before posting, base64 prefix tolerance.

### Hours 20–24 — Demo prep
- Test on actual phones, multiple devices logging at once
- Run through demo script 3+ times — including the *create-a-new-category-on-the-fly* demo moment
- Fix only critical bugs — resist scope creep
- Push final deploy and verify on the URL you'll demo from

### Officially cut from stretch (no longer in scope)
- Donor tracking
- Multi-language UI

These cuts make room for the audit log + History + category CRUD work absorbed into Hours 8–14 and 14–20.

---

## Critical Files / Structure

```
/app
  /(auth)/sign-in/[[...rest]]/page.tsx     # Clerk
  /(auth)/sign-up/[[...rest]]/page.tsx
  /log/page.tsx                            # entry point: photo | quick-pick | manual
  /log/photo/page.tsx                      # camera capture + AI review
  /log/quick-pick/page.tsx                 # browse-and-tap
  /reports/page.tsx                        # date range + totals + CSV button
  /history/page.tsx                        # team audit feed (replaces /me)
  /api/donations/route.ts                  # POST (bulk), GET
  /api/donations/[id]/route.ts             # PATCH, DELETE (soft)
  /api/catalog/route.ts                    # GET
  /api/programs/route.ts                   # GET
  /api/categories/route.ts                 # GET, POST
  /api/categories/[id]/route.ts            # PATCH, DELETE (soft)
  /api/recognize/route.ts                  # POST image → Gemini → matched items
  /api/reports/route.ts                    # GET aggregations
  /api/reports/csv/route.ts                # GET CSV
  /api/events/route.ts                     # GET audit feed
/lib
  /db.ts                                   # mongoose connection (cached)
  /models/User.ts
  /models/Program.ts
  /models/Category.ts
  /models/ItemCatalog.ts
  /models/Donation.ts
  /models/Event.ts
  /vision.ts                               # Gemini 2.5 Flash call + dynamic responseSchema
  /catalog-match.ts                        # fuzzy match AI output → catalog items
  /categories-cache.ts                     # 60s in-memory cache of active categories for AI schema
  /audit.ts                                # emit-event helper called from every write endpoint
  /timezone.ts                             # shared "America/Los_Angeles" constant + helpers
/scripts
  /seed-programs.ts                        # 4 programs from Jessica's email
  /seed-categories.ts                      # ~25 categories grouped by program
  /seed-catalog.ts                         # loads Jessica's item list
  /seed-demo-data.ts                       # realistic donations + audit events for demo
```

---

## Gemini Vision Call (sketch)

Use `gemini-2.5-flash` with `responseSchema` so the model is *forced* to return valid structured data — no JSON parsing guesswork. The `category` enum is **read from the DB at request time** (cached 60s) so newly-created categories are immediately suggestable.

```ts
import { GoogleGenAI, Type } from "@google/genai";
import { getCategoriesCache } from "@/lib/categories-cache";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const activeCategories = await getCategoriesCache();   // 60s in-memory

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name:               { type: Type.STRING },
          category:           { type: Type.STRING, enum: activeCategories.map(c => c.name) },
          estimated_quantity: { type: Type.NUMBER },
          unit:               { type: Type.STRING, enum: ["count","lbs","oz"] },
        },
        required: ["name","category","estimated_quantity","unit"],
      },
    },
  },
  required: ["items"],
};

const result = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    { inlineData: { mimeType: "image/jpeg", data: base64Image } },
    { text: "Identify donated items in this photo. Return one entry per distinct item." },
  ],
  config: { responseMimeType: "application/json", responseSchema },
});
const { items } = JSON.parse(result.text);
```

Then on the server, fuzzy-match each `name` against `itemCatalog.name + aliases` (case-insensitive substring or simple Levenshtein). On match: replace with the catalog item's canonical `name`, `categoryId`, `categoryName`, `programName`, `defaultUnit`, and `estimatedValuePerUnit`. On miss: keep AI's `name`/`categoryName`/`unit`/`quantity`, set `itemId: null` + `categoryId: null`, mark `warning: "not_in_catalog"`. Cache invalidates on any successful `POST/PATCH/DELETE /api/categories`.

---

## Verification (end-to-end)

Before declaring done, run through this on **actual phones**:

1. Two volunteers sign in on two different phones simultaneously.
2. Volunteer A: tap Photo → snap a photo of a pile of mixed donations → AI suggestions appear → edit one item, delete one, accept the rest → Save all.
3. Volunteer B (at the same time): use Quick-pick → tap "Baby Consumables" category → tap "Size 4 Diapers" → set count to 24 → Save.
4. Volunteer B: Manual entry → "Used baby crib" → set $25 value → date received = yesterday → Save.
5. Both volunteers: open Reports → "This month" preset → both volunteers' entries appear, totals correct, grand $ value correct.
6. Pick a custom range that excludes today → entries disappear from totals.
7. Click "Export CSV" → file downloads → opens cleanly in Excel/Sheets with all columns including `Program`.
8. Test password reset email actually arrives (Clerk dashboard → trigger from sign-in screen).
9. Sign out → sign back in → entries persist; History shows both volunteers' entries with correct names.
10. Volunteer A creates "Dog Leashes" (program: Other / Misc) inline from AI Review → it shows up in the next AI run's category enum and in Quick Pick once an item is added under it.
11. Volunteer A renames "Diapers" → "Adult Diapers" → CSV for past donations still says "Diapers"; Reports group both names under the renamed category via `categoryId`.
12. Volunteer B opens History → sees A's rename event and recent donations from both volunteers, each with the correct actor name + Pacific timestamp.
13. Volunteer A edits one of their own past donations → `donations` row updates; History gets a `donation.updated` row showing the diff.
14. Volunteer A tries to PATCH or DELETE Volunteer B's donation → 403.

If any of these break, that's a P0 bug for the final 4-hour window.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Gemini API hiccups during demo | Quick-pick path is the fallback; both paths land in the same `/api/donations`. Demo can pivot. Free tier rate limits are generous but not infinite — don't hammer the API in tests right before judging. |
| Team blocked on Mongoose schema decisions | Schema is in this plan — copy it directly, refine only if a real bug appears. |
| Mobile camera doesn't work on someone's phone | `<input capture="environment">` works on all modern iOS Safari + Android Chrome. Test early (hour 2, not hour 22). |
| Clerk + Mongo user-mirror gets weird | Just-in-time create user record on first authenticated API call. Skip webhooks for MVP. |
| Time blown on prompt engineering | Cap it at 2 hours. If accuracy is mediocre at hour 4, ship it — review/edit step covers the gap. |
| Three people committing at once breaks main | Branch per feature, merge often, one person rebases when needed. |
| Demo-day wifi at venue is bad | Wifi was assumed in MVP scope. If hackathon venue has bad wifi, budget 1h hotfix at hour 22 to add a "queue and retry" wrapper around `/api/donations`. |
| Dynamic Gemini schema gets stale after a volunteer creates a new category | 60s in-memory cache in `lib/categories-cache.ts` + invalidate on any successful POST/PATCH/DELETE to `/api/categories`. |
| Audit log scope creep eats build time | Cap initial event types at 4 (`donation.created` / `updated` / `deleted`, `category.renamed`); add `category.created` / `archived` and `item.*` only if Hours 14–20 has slack. |
| Mongo `$lookup` perf on reports | Free-tier M0 is fine for hackathon volume (~hundreds of donations). Don't optimize until measured. |
