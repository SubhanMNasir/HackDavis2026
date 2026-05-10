# Wellspring Donation Logger — Frontend Build Brief

Build a **mobile-first donation logging app** for Wellspring Women's Center, a small nonprofit replacing a paper donation log. Volunteers use phones (primary) and iPads (secondary) during giveaway days to log incoming donations — items, quantities (`count` or `lbs` only), and estimated dollar values for tax reporting. The hero feature is **AI photo recognition**: snap a photo of a pile of donations, the app suggests items, the volunteer confirms.

This document is the **source of truth for visual design, screen inventory, and component behavior**. It does **not** define the wire format — see `CONTRACTS.md` for that.

---

## Tech Stack

- React 18 + TypeScript
- Tailwind CSS v4 (no `tailwind.config.js` — v4 uses CSS-based config)
- shadcn/ui components (already available in `src/app/components/ui/`)
- `lucide-react` for icons (1.5px stroke)
- Inter font

Entrypoint: `src/app/App.tsx` (default export). Screen components live in `src/app/components/wellspring/`. Reusable building blocks live in `src/app/components/wellspring/shared.tsx`.

---

## Visual Identity

- **Tone:** Warm, trustworthy, modern-nonprofit. "Linear meets a community center."
- **Primary brand:** `#39900E` (deep green). Darker accent `#2A6B0A` for text/icons that need contrast on white. Darkest `#1F4D08` for gradient stops.
- **Brand tints:** `#F7FEE7` background tint, `#D9F99D` border tint.
- **Warm CTA accent:** `#F59E0B` amber (used sparingly for primary save/start buttons).
- **Neutrals:** `#0F172A` text, `#475569` secondary text, `#E2E8F0` borders, `#F8FAFC` page bg, `#FFFFFF` cards.
- **Success / error:** `#16A34A` / `#DC2626`.
- **Typography:** Inter. Headings 600, body 400, labels 500. Line-height 1.5. Do **not** use Tailwind utilities for font-size / weight / line-height — set them via inline styles or theme.css.
- **Corners:** 12px on cards, 8px on inputs/buttons, fully rounded on pills/avatars.
- **Shadows:** Single soft elevation `0 1px 3px rgba(15, 23, 42, 0.08)`. No heavy drop shadows.
- **Iconography:** Lucide, 1.5px stroke, in `#475569` or `#2A6B0A`.
- **Spacing:** 8px base grid. 16–20px card padding.

The Wellspring leaf mark is rendered programmatically via `WellspringLogo` (Lucide `Leaf` on a green-gradient circle). No raster logo file is required for MVP.

---

## Layout Constraints

- **Mobile frame:** 390 × 844 (iPhone 14). Design every screen at this size first.
- **Tablet frame:** 1024 × 768 iPad landscape. **Every** screen has an iPad variant — the iPad is no longer Reports-only.
- Persistent **bottom tab bar** on mobile with **4 tabs**: `Log` · `Reports` · `History` · `Profile`. Active tab is brand green with filled-tint icon; inactive is slate with outlined icon.
- Persistent **top app bar** on mobile: 56px tall, white background, subtle bottom border, screen title centered, optional left back chevron, optional right action.
- iPad shell: 240px left sidebar (logo + name top, nav items, divider, "Sign out", JM user chip at bottom) + main pane with a `PageHeader` (22px title, optional right-side action(s)).

`App.tsx` renders a debug navigator that shows every screen in a `PhoneFrame` (390 × 844) or `TabletFrame` (1024 × 768) with a Device toggle (`all` / `mobile` / `ipad`) and per-screen filter chips.

---

## Reusable Components (in `shared.tsx`)

Build these once and reuse:

- `WellspringLogo` — green-gradient circle with white Lucide `Leaf`, configurable size.
- `PhoneFrame` / `TabletFrame` — frame wrappers for mockup display.
- `TopAppBar` — variants: default, with back chevron, with right action.
- `BottomTabBar` — 4 tabs (Log / Reports / History / Profile), active state per tab.
- `PrimaryButton` — amber, full-width by default.
- `SecondaryButton` — green outline.
- `CategoryPill` — `slate` / `green` / `amber` / `red` tone variants, optional leading icon.
- `CategoryDropdown` — picker with active categories grouped by program; footer item "+ New category" opens the New Category modal (screen 4b).
- `EventRow` — history feed row: actor avatar (initials, green/amber/slate tone), bold actor name + action verb, target label, timestamp on the right; small icon chip for event type (📷 / ⚡ / ✏️ for donation events, 🏷️ for category events).
- `Field` — labeled input row (text, number, with prefix `$`, with caret).
- `StatCard` — large number + label, optional `emphasis` (brand green).
- `Avatar` — initials disc, green / amber / slate tone.

---

## Screens (10 total: 9 + a modal)

Every screen has both a **mobile** (`screens.tsx`) and **iPad** (`ipad-screens.tsx`) variant.

### 1. Sign In
- Mobile: 288px gradient hero (`linear-gradient(160deg, #1F4D08, #2A6B0A 50%, #39900E)`) with **12 hand-placed** white Lucide `Leaf` icons at varying sizes/rotations (25% opacity), distributed across the full hero — not bunched at the top. Eyebrow `WELLSPRING · VOLUNTEER`. Headline two-line `Log donations.\nFeed neighbors.` (use `whiteSpace: "pre-line"`). Subtitle "Sign in to start your shift." Form below with Email + Password (mail/lock icons), "Forgot?" link on the password label, amber `Start logging` CTA, "New volunteer? Create account" footer.
- iPad: split layout — 520px gradient hero on the left with the same eyebrow / headline / subtitle / 24 leaves, white form pane on the right.

### 2. Log — Home
- Title "Log a donation".
- Three vertical option cards:
  1. **Photo** — hero, amber border + amber-tint bg, 📷 icon, "Snap a pile, AI fills the form".
  2. **Quick Pick** — green-tint icon box, ⚡, "Choose from common items".
  3. **Manual Entry** — slate icon box, ✏️, "Type it in yourself".
- Each card: icon-in-box left, title + subtitle middle, chevron right.

### 3. Photo Capture
- Title "Photo entry" with back chevron.
- Mobile: dashed rounded drop zone with green-tint camera circle, "Tap to take a photo" / "or choose from gallery", helper text, sticky amber `Open Camera`.
- iPad: dashed drop zone on the left, **Tips for good photos** card on the right with four bullets:
  - 📐 Get the whole pile in frame.
  - 💡 Bright, even light works best.
  - 🏷️ Spread items so labels are visible.
  - 📦 One batch per photo.
  Followed by a green-tint info card "AI will list each item with a quantity and estimated value. You'll review before saving."

### 4. AI Review (the hero screen — make this great)
- **Bail-out:** if `/api/recognize` returns `matchedCount === 0`, this screen is **never rendered**. Frontend toasts "Could not match item to catalog. Try again or manually select." and routes back to Log Home.
- Top app bar: back chevron, title "Review items", right action `Save all · $TOTAL` (amber).
- **Captured photo strip** — ~60px tall green gradient strip labeled "Captured photo". No timestamp, no dimensions, no metadata text.
- **AI match banner** — single-line light-green banner (`#F7FEE7` bg, `#D9F99D` border, `#2A6B0A` text) with a `Check` icon: `AI found N items — review and edit before saving.` Use the **same wording** on mobile and iPad.
- Vertical list of editable item cards. Each card is a compact 2-row layout:
  - **Row 1:** Item name (600 weight) + chips (see below) + trash icon at far right.
  - **Row 2:** Quantity stepper (− N +), unit text label (no dropdown — the unit is fixed by the item's category, only ever `count` or `lbs`), spacer, editable unit-price field with `$` prefix and a small pencil affordance, and the computed line total in brand green (`= $X.XX`).
- **Chip variants** (the brand-coded states):
  - **green `Added`** (with Plus icon) — volunteer-added card via the `+ Add item` button.
  - **amber `Edited`** — volunteer changed any field on the card from the AI's original suggestion.
  - **red `Not in catalog`** (with `AlertTriangle`) — `warning === "not_in_catalog"`.
  - The category chip itself is rendered as a `CategoryDropdown` on the card; opening it reveals categories grouped by program with a `+ New category` footer that opens screen 4b.
- Show 5 sample items: Size 4 Diapers (24 count); Canned Black Beans (12 count, **Edited**); Peanut Butter (4 lbs); Reusable Tote Bags (6 count, **Not in catalog**, dropdown open as a hint); Granola Bars (8 count, **Added**).
- Below the list: a dashed green-tint `+ Add item` button.
- iPad layout: same screen at 1024 × 768, **fixed size — do not scroll**. Two top stat cards (`Captured photo` strip + `Batch summary` $total) above the AI match banner, followed by the item table with column headers (`Item · Category · Quantity · Unit price · Total`) and the `+ Add item` row.

### 4b. New Category Modal
- Triggered from any `+ New category` footer item (AI Review categories, Manual Entry, etc.).
- Mobile: bottom-sheet sliding up over a dimmed AI Review.
- iPad: centered 520px dialog over a dimmed AI Review.
- Fields:
  - **Category name** text input.
  - **Program** — choose one of the 4 fixed programs (`Nutritious Meals Program` · `Children's Corner` · `Women's Wellness / Safety` · `Art of Being Program`).
  - **Default measurement** — segmented control with **two** options only: `Count` and `Lbs`.
- Tip text below the segment: *"Most produce is measured in **lbs**. Use **count** for packaged items like diapers or toothbrushes."*
- Buttons: `Cancel` (secondary) and amber `Create category`.
- On save → `POST /api/categories`, the new category is selected for the row that opened the modal and immediately appears in every other dropdown.

### 5. Quick Pick
- Title "Quick Pick", search field.
- Horizontal category chips: All, Canned Goods, Produce, Hygiene, Diapers, Meal Program, Other. Active chip: brand green bg + white text.
- 2-column grid (mobile) / 4-column grid (iPad) of item tiles: emoji, name, unit label (count or lbs), `+` button. One tile is selected (green outline, check badge, inline stepper).
- Sticky bottom (mobile) / top-right action (iPad): `Save 3 selected · $12.50`.

### 6. Manual Entry
- Title "Manual entry" with sticky/right-side amber `Save`.
- Form fields, in order:
  - **Item name** (text)
  - **Program** (dropdown, 4 options) — added so the donation is correctly attributed before category selection.
  - **Category** (dropdown) with an inline `+ New category` link (opens screen 4b).
  - **Quantity** (number)
  - **Unit** — segmented control, only `count` and `lbs`.
  - **Estimated value** ($ prefix)
  - **Date received** (defaults to today)
  - **Notes** (multiline, optional)

### 7. Reports
- **Mobile:** title "Reports". Date-range preset chips: `This month` (active) · `Last month` · `Q2` · `YTD` · `Custom`. Two stat cards: **Total value** (large, brand green) and **Entries logged**. "By item" section with sort dropdown, ~6 rows, zebra-striped: item name, category pill, total qty + unit (right), total $ (right). Footer row: grand total in slate-50 bg + amber **Export CSV** button. **Only one export entry point** — no top-bar download icon. Bottom tab bar (Reports active).
- **iPad:** sidebar shell + 4 stat cards (Total value · Entries · Top item · Top category) + by-item table (Item · Category · Quantity · Avg $ · Total $ · Entries) + horizontal bar chart of the top 5 items rendered with plain divs (not recharts).

### 8. (merged into 7 — Reports has both a mobile and an iPad variant.)

### 9. History
- Title "History", right filter icon.
- Section headers: `Today` / `Yesterday` / older buckets. **All bucketing in `America/Los_Angeles`**, regardless of device timezone.
- Each row is an `EventRow`. Five sample events under "Today":
  1. Jessica M. logged Size 4 Diapers — 24 count · $48.00 · 2m ago (📷 photo badge)
  2. Maria T. logged Bananas — 3 lbs · $1.50 · 8m ago (⚡ quick badge)
  3. Jessica M. renamed Diapers → Adult Diapers — 14m ago (🏷️ category badge)
  4. Maria T. created category Dog Leashes — 22m ago (🏷️ category badge)
  5. Alex K. archived Yarn — 1h ago (🏷️ category badge)
- "Yesterday" with 2–3 dimmer rows (mix of donation + category events).
- iPad: same content in the sidebar shell with a top-right `Filter` button + `Search activity…` input.
- Tap a donation event → opens an edit/delete sheet (only if you're the original logger). Tap a category event → no-op for MVP.

### 10. Profile
- Title "Profile".
- Header card: brand-gradient strip with circular `JM` avatar, name (`Jessica M.`), `Volunteer · since Jan 2026`, and email.
- **Time-range chips** (togglable): `This month` (default active) · `Last month` · `Q2` · `YTD` · `All time`. Switching a chip re-fetches the profile aggregations.
- Two stat cards: **My entries** (count, e.g. `47`) and **Value logged** (USD, brand green, e.g. `$612`).
- **My top categories** card — up to 5 rows, each a label + value + horizontal bar (gradient `#2A6B0A → #39900E`). 6th+ category collapsed into "Other".
- **Recent entries** (iPad only / collapsed footer on mobile): 4 most recent donations by this user — name, qty + unit, time, value.
- Settings rows (mobile + iPad): `Account & email` (chevron) and `Notifications · On` (chevron). **No** "shift streak", "On shift today", "shifts logged", "photos used", or "Help & feedback" — these were explicitly removed.
- Footer: outlined `Sign out` button (uses `#DC2626` text).
- iPad layout: two-column grid — left column has header / chips / stat cards / settings / sign-out; right column has top-categories card + recent-entries card.

---

## Sample Data (use verbatim — no Lorem Ipsum)

- Programs (4): `Nutritious Meals Program`, `Children's Corner`, `Women's Wellness / Safety New Services`, `Art of Being Program`.
- Volunteers: `Jessica M.` (JM), `Maria T.` (MT), `Alex K.` (AK).
- Items: `Canned Black Beans`, `Peanut Butter`, `Bananas`, `Toothpaste`, `Size 4 Diapers`, `Rice (5lb bag)`, `Shampoo`, `Apples`, `Pasta`, `Granola Bars`, `Reusable Tote Bags` (the "not in catalog" sample).
- Categories per program: see `CONTRACTS.md §8` and the seed file. Every category has exactly one default unit — `count` or `lbs`. **Never `oz`**.
- Sample totals on Reports: `$2,847`, `134 entries`, top item `Size 4 Diapers`.
- Sample profile (JM): `47 entries`, `$612 logged this month`, top categories `Baby Consumables (38%)`, `Grains (27%)`, `Produce (18%)`, `Oral Care (11%)`, `Other (6%)`.
- Sample volunteer email: `jessica@wellspring.org`.

---

## Out of Scope

- Animations / transitions / interactive prototypes beyond the navigator filter.
- Item-level admin screens (inline category CRUD on AI Review is in scope; per-item editing is not).
- Full audit-log search + multi-filter UI (a simple filter chip set + search input is enough).
- Onboarding beyond Sign In.
- Dark mode, push notifications, multi-language.
- Real charts (one placeholder bar chart on iPad Reports — render with divs).
- Loading skeletons (use a basic spinner where needed).
- The `oz` unit anywhere — fully removed.
