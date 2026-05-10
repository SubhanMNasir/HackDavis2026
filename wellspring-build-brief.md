# Wellspring Donation Logger — Frontend Build Brief

Build a **mobile-first donation logging app** for Wellspring Women's Center, a small nonprofit replacing a paper donation log. Volunteers use phones (primary) and iPads (secondary) during giveaway days to log incoming donations — items, quantities (count or lbs), and estimated dollar values for tax reporting. The hero feature is **AI photo recognition**: snap a photo of a pile of donations, the app suggests items, the volunteer confirms.

This is a **static UI mockup** — no backend, no auth, no real data. Use mock data for everything.

---

## Tech Stack

- React 18 + TypeScript
- Tailwind CSS v4 (no `tailwind.config.js` — v4 uses CSS-based config)
- shadcn/ui components (already available in `src/app/components/ui/`)
- `lucide-react` for icons (1.5px stroke)
- Inter font

Entrypoint: `src/app/App.tsx` (default export). Put screen components in `src/app/components/wellspring/`.

---

## Visual Identity

- **Tone:** Warm, trustworthy, modern-nonprofit. "Linear meets a community center."
- **Primary brand:** `#39900E` (deep green). Darker accent `#2A6B0A` for text/icons that need contrast on white.
- **Brand tints:** `#F7FEE7` background tint, `#D9F99D` border tint.
- **Warm CTA accent:** `#F59E0B` amber (used sparingly for primary buttons).
- **Neutrals:** `#0F172A` text, `#475569` secondary text, `#E2E8F0` borders, `#F8FAFC` page bg, `#FFFFFF` cards.
- **Success / error:** `#16A34A` / `#DC2626`.
- **Typography:** Inter. Headings 600, body 400, labels 500. Line-height 1.5.
- **Corners:** 12px on cards, 8px on inputs/buttons, fully rounded on pills/avatars.
- **Shadows:** Single soft elevation `0 1px 3px rgba(15, 23, 42, 0.08)`. No heavy drop shadows.
- **Iconography:** Lucide, 1.5px stroke, in `#475569` or `#2A6B0A`.
- **Spacing:** 8px base grid. 16–20px card padding.

The Wellspring Women's Center logo is a circular badge stored at `src/imports/image.png`. Import as a regular image: `import logoUrl from "../../imports/image.png"`.

---

## Layout Constraints

- **Mobile frame:** 390 × 844 (iPhone 14). Design every screen at this size first.
- **Tablet frame:** 1024 × 768 iPad landscape (only for the Reports dashboard variant).
- Persistent **bottom tab bar** on mobile (4 tabs): `Log`, `Reports`, `History`, `Profile`. Active tab is brand green with filled icon; inactive is slate with outlined icon.
- Persistent **top app bar** on mobile: 56px tall, white background, subtle bottom border, screen title centered, optional left back chevron, optional right action.

Build a debug navigator in `App.tsx` that shows all screens at once (or filters to one) — wrap each screen in a phone-shaped frame with `borderRadius: 36, width: 390, height: 844`.

---

## Reusable Components

Build these once and reuse:

- `WellspringLogo` — circular logo image, configurable size
- `PhoneFrame` / `TabletFrame` — frame wrappers for mockup display
- `TopAppBar` — variants: default, with back chevron, with right action
- `BottomTabBar` — 4 tabs (Log / Reports / History / Profile), active state per tab
- `PrimaryButton` — amber, full-width
- `SecondaryButton` — green outline
- `CategoryPill` — slate / green / amber tone variants
- `CategoryDropdown` — picker with active categories grouped by program; footer item "+ New category" opens an inline modal (name input + program select + default-unit segment)
- `EventRow` — history feed row: actor avatar (initials), bold actor name + action verb, target label, timestamp on the right; small icon chip for event type (📷 / ⚡ / ✏️ for donation events, 🏷️ for category events)
- `Field` — labeled input row (text, number, with prefix `$`, with caret)
- `StatCard` — large number + label

---

## Screens

### 1. Sign In (mobile)
- Top hero block (~288px tall) with diagonal gradient `linear-gradient(160deg, #1F4D08 0%, #2A6B0A 50%, #39900E 100%)`.
- Hero is **logo-less** — let the gradient + ornament carry brand. Scatter ~12 white Lucide `Leaf` icons at varying sizes/rotations across the hero at 25% opacity.
- Eyebrow text: `WELLSPRING · VOLUNTEER` (white/80, 11px, uppercased, letter-spacing 0.18em).
- Headline (white, 26px, weight 700, two lines):
  ```
  Log donations.
  Feed neighbors.
  ```
  (use `whiteSpace: "pre-line"` so the `\n` renders).
- Subtitle: "Sign in to start your shift."
- Form below hero: Email and Password fields with leading mail/lock icons. Password label has a "Forgot?" link aligned right.
- Primary amber button: "Start logging"
- Footer: "New volunteer? Create account" (link in `#2A6B0A`).

### 2. Log — Home
- Top app bar: "Log a Donation".
- Three large vertical cards (~96px tall):
  1. **📷 Photo** (hero card — amber border `2px solid #F59E0B`, bg `#FFFBEB`) — "Snap a pile, AI fills the form"
  2. **⚡ Quick Pick** — "Choose from common items"
  3. **✏️ Manual Entry** — "Type it in yourself"
- Each: icon-in-box left, title + subtitle middle, chevron right.
- Bottom tab bar visible (Log active).

### 3. Photo Capture
- Top app bar: back chevron, title "Photo Entry".
- Large dashed-border drop zone fills most of the screen. Centered: green tint circle with camera icon, "Tap to take a photo", small "or choose from gallery" caption.
- Helper text below: "Get the whole pile in frame. AI will list each item."
- Sticky bottom: amber "Open Camera" full-width button.

### 4. AI Review (the hero screen — make this great)
- **Bail-out behavior** (assumed by the data, not rendered as a separate screen): if `/api/recognize` returns `matchedCount === 0`, this screen is **never rendered** — frontend toasts "Could not match item to catalog. Try again or manually select." and routes back to Log Home. The mockup shows the populated success case.
- Top app bar: back chevron, title "Review items", right action "Save all" (green text).
- Thumbnail strip at top: ~80px tall rounded gradient placeholder labeled "📷 Captured photo".
- Banner: green-tinted background with info icon — "AI found 6 items — review and edit before saving."
- Vertical list of editable item cards. Each card:
  - Item name (bold) e.g. "Canned Black Beans"
  - `CategoryDropdown` showing the assigned category (tap to change); footer item "+ New category" opens an inline modal: name input + program select (4 fixed options: Nutritious Meals / Children's Corner / Women's Wellness / Art of Being) + default-unit segment. On save, the new category is selected for this row and now appears in every other row's dropdown too.
  - Quantity stepper (− N +), unit dropdown (count / lbs / oz), estimated $ field
  - Trash icon top-right
- **Three chip variants** (the brand-coded states):
  - **Category pill / dropdown** — neutral / brand green; always present; comes from server (canonical category).
  - **"Edited"** — amber; client-only, appears when the volunteer has changed any field on the card from the AI's original suggestion.
  - **"Not in catalog"** — red, with `AlertTriangle` icon; only on cards where `warning === "not_in_catalog"` (partial-miss case).
- Show 4 cards. One has an amber "Edited" tag. One has a red "Not in catalog" warning chip.
- Sticky bottom: "6 items · $84.50 estimated" + amber "Save all".

### 5. Quick Pick
- Top app bar: back, title "Quick Pick", right search icon.
- Search field below ("Search items…").
- Horizontal scrollable category chips: All, Canned Goods, Produce, Hygiene, Diapers, Meal Program, Other. Active chip: brand green bg, white text.
- 2-column grid of item tiles: emoji/icon, name, unit label, + button.
- Show one selected tile (green outline, checkmark badge, inline quantity stepper).
- Sticky bottom: "3 items selected · $12.50" + amber "Save".

### 6. Manual Entry
- Top app bar: back, title "Manual Entry".
- Form card with: Item name, Category (dropdown), Quantity (number), Unit (3-segment: count / lbs / oz), Estimated value (with `$` prefix), Notes (multiline, optional), Date received (defaults to today).
- Sticky bottom: amber "Save".

### 7. Reports — Mobile
- Top app bar: title "Reports", right download icon.
- Date-range preset chips: This month (active), Last month, Q2, YTD, Custom.
- Two stat cards: **Total value $2,847** (large, brand green) and **Entries logged 134**.
- Section "By item" with sort dropdown.
- Table-style list, ~6 rows, zebra-striped: item name (bold), category pill, total qty + unit (right), total $ (right, bold).
- Footer row: grand total in slate-50 bg + amber "Export CSV" button.
- Bottom tab bar (Reports active).

### 8. Reports — iPad (1024 × 768, single frame)
- Left sidebar nav (240px): Wellspring logo + name top, nav items (Log, **Reports** active, History, Profile), divider, "Sign out", user chip ("Jessica M. · Volunteer") at bottom.
- Active nav item: green tint bg `#F7FEE7`, brand-dark text, weight 600.
- Main pane: same data as mobile reports but wider — date presets in one row, **4 stat cards** (Total value, Entries, Top item, Top category), then by-item table with full columns (Item, Category, Quantity, Avg $, Total $, Entries).
- Top-right card: simple bar chart placeholder showing top 5 items as horizontal bars (use plain divs, not recharts).

### 9. History
- Top app bar: title "History", right filter icon.
- Section headers: "Today" / "Yesterday" / older date headers. **All bucketing is in `America/Los_Angeles`** (Wellspring's TZ), regardless of the volunteer's device timezone.
- Each row is an `EventRow` (actor avatar with initials, bold actor name + action verb, target label, timestamp on the right; small icon chip indicating event type — 📷 / ⚡ / ✏️ for donation events, 🏷️ for category events).
- Show 5 sample events under "Today":
  1. "Jessica M. logged Size 4 Diapers — 24 count · $48.00 · 2m ago" (📷 AI badge)
  2. "Maria T. logged Bananas — 3 lbs · $1.50 · 8m ago" (⚡ Quick badge)
  3. "Jessica M. renamed Diapers → Adult Diapers — 14m ago" (🏷️ category badge)
  4. "Maria T. created category Dog Leashes — 22m ago" (🏷️ category badge)
  5. "Alex K. archived Yarn — 1h ago" (🏷️ category badge)
- Section "Yesterday" with 2–3 dimmer rows (mix of donation and category events).
- Tap a donation event → opens an edit/delete sheet (only shown if you're the original logger). Tap a category event → no-op for MVP (info only).
- Bottom tab bar (History active).

---

## Sample Data (use verbatim — no Lorem Ipsum)

- Programs (4): `Nutritious Meals Program`, `Children's Corner`, `Women's Wellness / Safety New Services`, `Art of Being Program`
- Categories (abbreviated to ~3 per program for readability — full list lives in `seed-categories.ts`):
  - Nutritious Meals Program: `Tea and Coffee`, `Sweeteners`, `Grains`, …
  - Children's Corner: `Baby Care Products`, `Baby Consumables (Diapers)`, `Formula and Food`, …
  - Women's Wellness / Safety New Services: `Menstrual Products`, `Oral Care`, `Adult Diapers, Pads`, …
  - Art of Being Program: `Yarn`, `Watercolor Paper / Sketchbooks`, `Drawing Pencils / Pens`, `Gift Cards`
- Items: `Canned Black Beans`, `Peanut Butter (16oz)`, `Bananas`, `Toothpaste`, `Size 4 Diapers`, `Rice (5lb bag)`, `Shampoo`, `Apples`, `Pasta`, `Granola Bars` (each maps to one of the categories above)
- Volunteers: `Jessica M.` (JM), `Maria T.` (MT), `Alex K.` (AK) — multi-actor sample data so History feels alive
- Sample totals: `$2,847 estimated value`, `134 entries`, top item `Size 4 Diapers`
- Sample volunteer email: `jessica@wellspring.org`

---

## Out of Scope

- Real auth, networking, persistence (this is still a static UI mockup)
- Animations / transitions / interactive prototypes
- Item-level admin screens (inline category CRUD on AI Review is in scope; per-item editing is not)
- Full audit-log search + multi-filter UI (mobile shows a simple filter chip set only)
- Onboarding beyond Sign In
- Settings, notifications, dark mode
- Real charts (one placeholder bar chart on iPad is enough — render with divs)
- Loading skeletons

---

## Deliverable

A working React app where:
- `src/app/App.tsx` renders a debug navigator + every screen wrapped in a `PhoneFrame` (or `TabletFrame` for screen 8).
- Each of the 9 screens lives as its own exported component (Sign In / Log Home / Photo Capture / AI Review / Quick Pick / Manual Entry / Reports Mobile / Reports iPad / **History**).
- Reusable components live in their own files.
- All sample data is hard-coded — no API calls, no state beyond what's needed for the navigator filter.

Match the brand color (`#39900E`) precisely. Don't invent additional brand colors. Don't add features beyond the screens above.
