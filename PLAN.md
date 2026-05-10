# Wellspring — Implementation Plan (parallel agents)

This plan exists to let a **frontend agent** and a **backend agent** build the Wellspring Donation Logger **at the same time, in the same repo, without merge conflicts**. Read this *and* `src/imports/CONTRACTS.md` before writing code. The brief in `src/imports/wellspring-build-brief.md` covers visual + screen design.

> **Hierarchy of truth** (when docs disagree):
> 1. `CONTRACTS.md` — wire format, types, endpoints. Either agent may edit, but only via the change protocol in §10 of that file.
> 2. `wellspring-build-brief.md` — visual design + screen behavior. **Frontend-owned.**
> 3. `PLAN.md` (this file) — sequencing, file ownership, build steps. **Coordinator-owned.** Either agent may *propose* edits but must flag them.

---

## 0. Goal

Ship an MVP donation-logging app:
- Mobile + iPad volunteer app: photo-AI flow, quick pick, manual entry, reports, history, profile.
- Next.js App Router (frontend pages + backend `/api/**` routes in the same repo).
- Clerk auth, MongoDB persistence, Gemini (`gemini-2.5-flash`) image recognition.
- Soft delete everywhere, audit log on every write.

Non-goals: photo persistence (Vercel Blob), multi-tenancy, websockets, item-level admin UI. See `CONTRACTS.md §9`.

---

## 1. File ownership (the conflict-prevention table)

**The rule:** an agent only writes to files in their column. Files in the **shared** column require a coordination ping (see §6).

| Shared (coordinated) | Frontend-only | Backend-only |
|---|---|---|
| `src/imports/CONTRACTS.md` | `src/app/**/*` (except `src/app/api/**`) | `src/app/api/**` |
| `src/imports/wellspring-build-brief.md` | `src/app/components/**` | `src/lib/db/**` |
| `plans/PLAN.md` | `src/app/(routes)/**` page files | `src/lib/ai/**` |
| `src/lib/types.ts` (canonical, mirrors `CONTRACTS.md §3`) | `src/app/styles/**` | `src/lib/auth/**` |
| `src/lib/timezone.ts` (`TZ = "America/Los_Angeles"` constant only) | `src/app/components/wellspring/**` | `src/lib/seed/**` |
| `package.json` (dependency adds; don't reorder existing entries) | Any new `*.tsx` under `src/app/components/` | Any `route.ts` under `src/app/api/` |
| `.env.example` (each adds their own keys, never deletes) | `src/app/lib/api-client.ts` (frontend HTTP wrapper) | `src/lib/csv.ts`, `src/lib/audit.ts` |

If the file you need to touch isn't listed, it's safe to create it inside your column. If a brand-new file would land outside both columns, ping the other agent first.

**`src/lib/types.ts` is the live mirror of `CONTRACTS.md §3`.** Backend regenerates it whenever §3 changes; frontend imports from it and never edits it directly.

---

## 2. Phases & sequencing

Phases run **in order**, but within a phase the FE/BE columns run **in parallel**. A phase is only "done" when both columns have shipped their items and the integration check passes.

### Phase 0 — Project skeleton (single coordinator pass, ~15 min)

Done before either agent forks off. Coordinator:
1. Initialize Next.js App Router project (already partially exists — the static mockup at `src/app/App.tsx` will become the `/log` route group).
2. Install: `next`, `react`, `@clerk/nextjs`, `mongoose`, `@google/generative-ai`, `zod`, `lucide-react`, `tailwindcss@4`, `recharts` (only used on iPad Reports), `react-hook-form@7.55.0`.
3. Add Clerk middleware stub at `src/middleware.ts` so all `/api/**` (except `/api/health`) require auth.
4. Add `src/lib/types.ts` from `CONTRACTS.md §3` (verbatim).
5. Add `src/lib/timezone.ts` exporting `export const APP_TZ = "America/Los_Angeles"`.
6. Add `.env.example` with: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `MONGODB_URI`, `GOOGLE_API_KEY`.
7. Commit, then unblock both agents.

### Phase 1 — Foundations (parallel)

| Frontend | Backend |
|---|---|
| Lift the existing static mockup into route groups: `app/(auth)/sign-in`, `app/(app)/log`, `/log/photo`, `/log/quick`, `/log/manual`, `/log/review`, `/reports`, `/history`, `/profile`. | Stand up `src/lib/db/mongoose.ts` (cached connection), Mongoose models for `users`, `programs`, `categories`, `itemCatalog`, `donations`, `events`. Use the field shapes implied by `CONTRACTS.md §3` + §8. |
| Wrap root layout with `<ClerkProvider>` + `BottomTabBar`/`IpadShell` chrome. | Implement `lib/auth/requireAuth.ts` returning `{ userId, name, initials }` (JIT-upserts the `users` doc). |
| Implement `src/app/lib/api-client.ts` — typed fetch wrapper, redirects to `/sign-in` on 401, parses `ApiError` envelope. | Implement `src/lib/audit.ts` with one `recordEvent(type, actor, target, summary)` helper used by every write route. |
| Build the design-system primitives in `src/app/components/wellspring/shared.tsx` (already done in mockup — port unchanged). | Seed script at `src/lib/seed/seed.ts`: 4 programs, ~25 categories from Jessica's email, ~15 catalog items. Idempotent. |
| Stub each route page to render the existing static screen (will swap to live data in Phase 2). | Implement `GET /api/health`, `GET /api/programs`, `GET /api/categories`, `GET /api/catalog`. |

**Phase 1 integration check:** frontend can boot, navigate every screen, and call `GET /api/programs` + `GET /api/categories` and see seeded data.

### Phase 2 — Core write paths (parallel)

| Frontend | Backend |
|---|---|
| Wire **Manual Entry** form to `POST /api/donations` (single-item array). Show success toast → route to History. | Implement `POST /api/donations` (bulk-insert, denormalize, emit `donation.created` events). |
| Wire **Quick Pick** multi-select bottom bar → same endpoint with `source: "quick_pick"`. | Implement `POST /api/categories`, `PATCH /api/categories/:id`, `DELETE /api/categories/:id` (soft delete + audit). |
| Wire **+ New category** modal (screen 4b) on AI Review and Manual Entry to `POST /api/categories`; on 201 the new category is selected for the row that opened it and appears in every other dropdown. | Implement `PATCH /api/donations/:id`, `DELETE /api/donations/:id` with `403` if `loggedBy !== userId`. |
| Wire **History** to `GET /api/events` with bucket headers in `APP_TZ`. | Implement `GET /api/events` (filter + sort DESC, default limit 50). |
| Wire **Profile** time-range chips → `GET /api/profile/me?from&to`. | Implement `GET /api/profile/me` aggregations (see `CONTRACTS.md §4.9`). |

**Phase 2 integration check:** end-to-end flow Manual Entry → History → Profile all hit live endpoints.

### Phase 3 — AI flow + reports (parallel)

| Frontend | Backend |
|---|---|
| Wire **Photo Capture → AI Review**: read file as base64, `POST /api/recognize`, render review cards. | Implement `POST /api/recognize`: validate ≤5 MB, build dynamic Gemini `responseSchema` from active categories (60s in-memory cache + invalidation on category writes), match against `itemCatalog`. |
| Implement the AI Review **bail-out toast** (matchedCount === 0 → toast + route back to `/log`). | Surface `502 AI_UNAVAILABLE` and `429 RATE_LIMITED` with the standard envelope. |
| Implement **Add item** button on AI Review (creates a card with the green `Added` chip; `source: "photo_ai"` still). | Implement `GET /api/reports` aggregation (group by `categoryId`, return current category names; tiebreaker alphabetical itemName ASC). |
| Wire **Reports** date-preset chips → `GET /api/reports`; render mobile (2 stat cards) + iPad (4 stat cards + table + top-5 bar chart). | Implement `GET /api/reports/csv` with the exact column order from `CONTRACTS.md §4.6`; filename uses Pacific dates. |
| Wire mobile + iPad **Export CSV** button to `GET /api/reports/csv`. Note: only **one** export entry point on Reports — no top-bar download. | |

**Phase 3 integration check:** demo flow — sign in → take a photo → see AI review with 5 items → tweak quantity → save → appears in History → appears in Reports total.

### Phase 4 — Polish (parallel)

| Frontend | Backend |
|---|---|
| Empty states for History / Reports / Profile (`entryCount: 0`). | Tighten `400` validation messages with field paths. |
| Loading + error toasts wired to the `ApiError.code` map. | Add `lib/categories-cache.ts` invalidation tests. |
| Manual QA pass on iPad fixed-size screens (no scroll on AI Review iPad; everything fits 1024 × 768). | Final smoke-test of seed script on a fresh DB. |

---

## 3. Frontend agent — task list (read in full before starting)

You own: `src/app/**` (except `src/app/api/**`), all `*.tsx` components, page routes, styles, and the API-client wrapper. You **read** `CONTRACTS.md` and **import** from `src/lib/types.ts` — you don't write to either.

1. Convert the static mockup in `src/app/App.tsx` into a Next.js App Router structure. Each existing screen component becomes the body of a route page.
2. Keep `src/app/components/wellspring/shared.tsx` as the design system. Don't duplicate primitives elsewhere.
3. Build `src/app/lib/api-client.ts` with typed methods that mirror `CONTRACTS.md §4`. On `401`, `window.location.href = "/sign-in"`. On `ApiError` codes, map to user-facing toast strings.
4. **Hard rules from the mockup work — do not regress these:**
   - `Unit` is `"count" | "lbs"`. **No `oz` anywhere.**
   - AI Review: 2-row compact cards; unit is a plain text label (no dropdown); unit-price is editable; line total = qty × unit-price in brand green.
   - AI Review: separate **Captured photo** strip + green **AI match banner** with the wording `AI found N items — review and edit before saving.` — same on mobile and iPad. iPad has no timestamp/dimensions on the photo card.
   - Bottom tab bar has **4 tabs**: Log · Reports · History · Profile.
   - New Category modal has a **count / lbs** segment and the produce tip — never three options.
   - Reports has **one** Export CSV entry point (the footer button), not a top-bar download.
   - Profile has no shift streak, no "On shift today", no shifts/photos counters, no help & feedback.
5. Match brand color `#39900E` exactly. Don't invent colors. Set typography via inline styles or `theme.css` — never with Tailwind size/weight utilities.
6. The Sign-In mobile hero must scatter 12 hand-placed leaves across the full 288px hero — not bunched at the top.
7. iPad AI Review must fit 1024 × 768 with `overflow: hidden`. If it stops fitting after a change, fix the layout — don't enable scroll.
8. When you need a wire-format change (new field, new endpoint), edit `CONTRACTS.md` per its §10 protocol *first*, post the diff to the backend agent, then implement against the new shape.

---

## 4. Backend agent — task list (read in full before starting)

You own: `src/app/api/**`, `src/lib/db/**`, `src/lib/ai/**`, `src/lib/auth/**`, `src/lib/seed/**`, `src/lib/csv.ts`, `src/lib/audit.ts`, the seed script, and the `src/lib/types.ts` mirror. You **read** `CONTRACTS.md` as the spec — and you **regenerate** `src/lib/types.ts` whenever §3 changes.

1. Mongoose models follow `CONTRACTS.md §8`. Use Mongoose `toJSON` transforms to project `_id → id` and dates → ISO strings so the wire format matches §3 exactly.
2. Every write route **must** go through `recordEvent` from `src/lib/audit.ts`. Don't inline event inserts.
3. Soft-delete everywhere. `Donation.deleted = true`, `Category.active = false`, `CatalogItem.active = false`. Reports & list endpoints filter `deleted: { $ne: true }` / `active: true`.
4. Denormalization is your job — frontend never sets `loggedBy`, `loggedByName`, `categoryName`, `programName`. Snapshot them at write time and **don't** rewrite snapshots when a category is later renamed (renames consolidate at aggregation time via `categoryId`, not by mutating donation rows).
5. `POST /api/donations` always takes an array. Single-entry callers (Manual Entry) send an array of length 1.
6. `POST /api/recognize` does **not** write to Mongo. Frontend posts a follow-up `POST /api/donations` after the volunteer confirms. Cache categories for 60s; invalidate on `POST/PATCH/DELETE /api/categories`.
7. `GET /api/reports/csv` uses the exact header `Date,Item,Category,Program,Quantity,Unit,Estimated Value,Source,Logged By,Notes` and Pacific dates in the filename.
8. `GET /api/profile/me`:
   - `topCategories` uses **current** category names (post-rename) but groups by `categoryId` snapshot from donations; cap at 5 with the rest collapsed into `Other`.
   - `recentEntries` is the last 4 by `donatedAt` DESC for the current user, ignoring `from`/`to`.
9. Errors: every non-2xx returns the envelope from `CONTRACTS.md §7`. No raw stacks. Use the codes listed there — don't invent new ones without updating §7 first.
10. Seed script must be **idempotent** (`upsert` by name) — both agents run it locally during development.

---

## 5. Shared types contract

`src/lib/types.ts` is the only TS file both agents import from. Its contents are a **direct copy** of `CONTRACTS.md §3`. Workflow:
- Backend agent edits §3, then mirrors into `src/lib/types.ts` in the same commit.
- Frontend agent re-imports — never hand-edits the file.
- If frontend needs a new shape, propose the `CONTRACTS.md` diff in chat first; backend acks; backend lands the §3 + `types.ts` change; frontend builds against it.

This single mirroring rule is what keeps the two agents' implementations from drifting.

---

## 6. Coordination protocol

When you need to touch a **shared** file (left column of §1), follow this:

1. **Announce** in the shared chat: `"Editing CONTRACTS.md §4.4 to add field X"`.
2. **Edit** the doc (`CONTRACTS.md`, this file, or the build brief).
3. **Add a `// CHANGED <today>: …` note** at the top of the affected section.
4. **Wait** for the other agent's ack before relying on the new shape in non-shared code.

Do not rebase or rewrite the other agent's commits in shared files. If the file looks scrambled after a pull, stop and ping — don't auto-resolve.

---

## 7. Demo acceptance checklist

The MVP is "done" when an unprimed reviewer can, in one sitting:

- [ ] Sign in via Clerk on mobile and iPad layouts.
- [ ] Take/upload a photo → see ≥3 AI-suggested items → tweak one quantity, change one category, add a new category from the inline modal, add one extra item via "+ Add item" → Save all → toast → appear in History within 2s.
- [ ] Switch to Quick Pick → multi-select 3 items → save → appear in History.
- [ ] Switch to Manual Entry → fill the form (program → category → qty/unit/value/date/notes) → save → appear in History.
- [ ] Open Reports → switch the date-preset chips → see updated totals → click Export CSV → file downloads with the correct header row and Pacific filename.
- [ ] Open History → see the full feed with `Today`/`Yesterday` buckets in Pacific time.
- [ ] Open Profile → see `47 entries · $612 logged · top categories` for Jessica → switch the time-range chip and watch the numbers update.
- [ ] Try to PATCH/DELETE someone else's donation → server returns `403 FORBIDDEN`.
- [ ] Pull network → AI Photo flow shows the `AI unavailable — try Quick Pick` toast.
- [ ] No `oz` string appears anywhere in the rendered UI or in the CSV.

---

## 8. Out of scope (do not start, do not assume)

Mirrors `CONTRACTS.md §9` and the brief's *Out of Scope*. Listed here too so neither agent has to chase the cross-reference:

- Photo persistence (`photoUrl` is always `null` in MVP).
- Hard delete of any record.
- Item-level admin UI.
- Cross-volunteer edit/delete.
- Webhooks (Clerk → Mongo is JIT).
- Pagination cursors, real-time updates, multi-tenancy, dark mode, push.
- The `oz` unit anywhere — fully removed in this revision.
