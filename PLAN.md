# Wellspring Donation Logging System — 24h Hackathon Plan

## Context

Wellspring is a small nonprofit that needs to replace a paper-based donation log. Their pain points are illegible handwriting, slow page-flipping, and no way to pull totals on demand. Per Jessica (the client), the real requirements are:

- **Track incoming donations only** — no inventory or outgoing tracking
- **Estimated dollar values matter** for tax-purpose reporting
- **Most items have no barcode** — meal program food especially. Produce/food is logged by **weight (lbs)**, hygiene/diapers by **count**
- **Multiple volunteers logging simultaneously** during giveaway days
- They have a **fixed list of commonly-accepted items** that should seed the catalog

**Constraints baked into this plan:**
- 24-hour build window
- 4 people, new to React/Next.js + Node + MongoDB
- Mobile-first (phones + iPad), wifi assumed (no offline)
- MongoDB Atlas required (prize track)
- **Gemini API** for vision (also a prize track)
- Auth: Clerk (email + password with reset)
- Primary input: **AI photo recognition + quick-pick from seeded catalog**, manual fallback
- Reports: **dashboard + CSV export** (no scheduled emails for MVP)

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
4. Server calls Gemini 2.5 Flash with `responseSchema` enforcing strict JSON output
5. Server matches each suggested item against `itemCatalog` (case-insensitive name + alias matching), filling in `defaultUnit` and `estimatedValuePerUnit`
6. Returns array of `{itemId, name, suggestedQty, unit, estValue}` to client
7. Volunteer sees an editable list, fixes anything wrong, taps "Save all"
8. Client posts to `/api/donations` (single bulk insert)

---

## MongoDB Schema

Three collections. Aggressive denormalization on `donations` so reports never need `$lookup` (faster + simpler aggregation pipelines).

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

### `itemCatalog`
Seeded from Jessica's accepted-items list before the hackathon starts.
```js
{
  _id: ObjectId,
  name: String,                       // "Canned Black Beans"
  category: String,                   // "Canned Goods" | "Produce" | "Hygiene" | "Diapers" | "Meal Program" | "Other"
  defaultUnit: String,                // "count" | "lbs" | "oz"
  estimatedValuePerUnit: Number,      // USD
  aliases: [String],                  // for AI matching: ["black beans", "canned beans"]
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
  itemId: ObjectId,                   // ref to itemCatalog
  itemName: String,                   // denormalized — survives catalog edits
  category: String,                   // denormalized
  quantity: Number,
  unit: String,                       // "count" | "lbs" | "oz"
  estimatedValue: Number,             // total $ for this entry, editable at log time
  source: String,                     // "photo_ai" | "quick_pick" | "manual" | "barcode"
  photoUrl: String?,                  // if photo flow used (optional, Vercel Blob)
  notes: String?,
  donatedAt: Date,                    // when donation was received (defaults to now, editable)
  createdAt: Date,                    // when logged in system (immutable)
}
```

### Indexes
```js
// donations
{ donatedAt: -1 }                            // primary date-range scans
{ category: 1, donatedAt: -1 }               // "diapers this month"
{ itemId: 1, donatedAt: -1 }                 // "this specific item over time"
{ loggedBy: 1, createdAt: -1 }               // "my recent entries"

// itemCatalog
{ category: 1, active: 1 }                   // picker queries
{ name: "text", aliases: "text" }            // AI fuzzy matching
```

### Reports aggregation pattern
```js
db.donations.aggregate([
  { $match: { donatedAt: { $gte: start, $lte: end } } },
  { $group: {
      _id: { itemName: "$itemName", unit: "$unit" },
      totalQuantity: { $sum: "$quantity" },
      totalValue:    { $sum: "$estimatedValue" },
      entryCount:    { $sum: 1 },
  }},
  { $sort: { totalValue: -1 } },
])
```

---

## Feature Breakdown — MVP

In priority order. Anything below the line is stretch.

1. **Auth** — sign up, sign in, password reset (Clerk drop-in components)
2. **Seeded item catalog** — load Jessica's list with categories, default units, $ values
3. **Quick-pick entry** — browse catalog by category, tap item, set quantity, save (the workhorse path)
4. **AI photo entry** — snap photo → AI suggests items → review/edit → bulk save (the demo moment)
5. **Manual entry fallback** — for items not in catalog
6. **Per-entry editable** — unit and $ value can be overridden at log time
7. **Reports dashboard** — date range picker (presets: this month, last month, Q2, YTD, custom) + totals table by item with $ subtotals and grand total
8. **CSV export** — one-click from any report view
9. **Recent entries** — so a volunteer can see/verify their own work this session
10. **Mobile-first responsive layout** — bottom nav bar on mobile, sidebar on iPad

### Stretch (in attack order if time permits)
1. Barcode scanning fast-lane (html5-qrcode) — only for barcoded categories
2. PDF export for tax filing (react-pdf)
3. Edit / delete past entries (with audit trail field)
4. Charts on dashboard (Recharts: top items bar chart, daily trend line)
5. Admin screen to manage catalog (add/edit/retire items)
6. Scheduled email reports (Vercel Cron + Resend)
7. Donor tracking
8. Multi-language UI

---

## 24-Hour Build Order (4 people)

Roles are suggestions — swap if someone's stronger in another area. The point is **parallelism with clear boundaries**.

### Hours 0–2 — Setup (everyone in parallel, get unblocked)
- **A**: `npx create-next-app` + Clerk + deploy to Vercel. **Skeleton must be live with auth working by hour 2.**
- **B**: MongoDB Atlas cluster + connection string + mongoose models + seed script that loads Jessica's items
- **C**: Tailwind + shadcn install, mobile shell (header, bottom tab bar, route stubs for /log, /reports, /me)
- **D**: Gemini API key from Google AI Studio, prove out the vision call in a small standalone script using `@google/genai` + `responseSchema`. **Do not skip this.** Iterate until it returns clean structured output for 3 sample photos.

### Hours 2–8 — Core entry flow
- **A**: Wire Clerk → mirror user in Mongo on first sign-in (webhook or just-in-time on first request)
- **B**: `POST /api/donations`, `GET /api/donations?mine=true`, `GET /api/catalog`
- **C**: Quick-pick UI — browse catalog by category, tap → quantity stepper → save. This is the workhorse, polish it.
- **D**: Photo capture component (`<input capture="environment">`) + `/api/recognize` endpoint that calls Gemini and matches against catalog

### Hours 8–14 — AI integration + reports
- **A**: AI review/confirm screen — receives `/api/recognize` output, renders editable rows, bulk-save to `/api/donations`
- **B**: Aggregation pipeline + `GET /api/reports?from=&to=`
- **C**: Reports page — date range picker (presets + custom), totals table, grand total $ value
- **D**: CSV export (server-side, returns `text/csv`)

### Hours 14–20 — Polish + integration
- All: bug fixes, **test on actual phones** (multiple devices simultaneously), error states, loading states, success toasts
- **A** or **D** (whoever's freed up): "My recent entries" list with edit (stretch) or at least delete-this-session
- **B**: Realistic demo data seed (so the dashboard isn't empty during judging)
- **C**: Empty states, error states, mobile polish pass

### Hours 20–24 — Demo prep
- Test on actual phones, multiple devices logging at once
- Run through demo script 3+ times
- Fix only critical bugs — resist scope creep
- Push final deploy and verify on the URL you'll demo from

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
  /me/page.tsx                             # recent entries
  /api/donations/route.ts                  # POST (bulk), GET (mine)
  /api/catalog/route.ts                    # GET
  /api/recognize/route.ts                  # POST image → Claude Vision → matched items
  /api/reports/route.ts                    # GET aggregations
  /api/reports/csv/route.ts                # GET CSV
/lib
  /db.ts                                   # mongoose connection (cached)
  /models/User.ts
  /models/ItemCatalog.ts
  /models/Donation.ts
  /vision.ts                               # Gemini 2.5 Flash call + responseSchema
  /catalog-match.ts                        # fuzzy match AI output → catalog items
/scripts
  /seed-catalog.ts                         # loads Jessica's list
  /seed-demo-data.ts                       # realistic donations for demo
```

---

## Gemini Vision Call (sketch)

Use `gemini-2.5-flash` with `responseSchema` so the model is *forced* to return valid structured data — no JSON parsing guesswork.

```ts
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name:               { type: Type.STRING },
          category:           { type: Type.STRING, enum: ["Canned Goods","Produce","Hygiene","Diapers","Meal Program","Other"] },
          estimated_quantity: { type: Type.NUMBER },
          unit:               { type: Type.STRING, enum: ["count","lbs"] },
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

Then on the server, fuzzy-match each `name` against `itemCatalog.name + aliases` (case-insensitive substring or simple Levenshtein). On match, replace with the catalog item's canonical `name`, `defaultUnit`, and `estimatedValuePerUnit`. On miss, keep AI suggestion as a manual entry the volunteer can finalize.

---

## Verification (end-to-end)

Before declaring done, run through this on **actual phones**:

1. Two volunteers sign in on two different phones simultaneously.
2. Volunteer A: tap Photo → snap a photo of a pile of mixed donations → AI suggestions appear → edit one item, delete one, accept the rest → Save all.
3. Volunteer B (at the same time): use Quick-pick → tap "Diapers" category → tap "Size 4 diapers" → set count to 24 → Save.
4. Volunteer B: Manual entry → "Used baby crib" → set $25 value → Save.
5. Both volunteers: open Reports → "This month" preset → both volunteers' entries appear, totals correct, grand $ value correct.
6. Pick a custom range that excludes today → entries disappear from totals.
7. Click "Export CSV" → file downloads → opens cleanly in Excel/Sheets with all columns.
8. Test password reset email actually arrives (Clerk dashboard → trigger from sign-in screen).
9. Sign out → sign back in → entries persist, "My recent" shows correct user's entries only.

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
