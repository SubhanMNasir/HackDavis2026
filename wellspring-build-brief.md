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
- Persistent **bottom tab bar** on mobile (4 tabs): `Log`, `Reports`, `Recent`, `Profile`. Active tab is brand green with filled icon; inactive is slate with outlined icon.
- Persistent **top app bar** on mobile: 56px tall, white background, subtle bottom border, screen title centered, optional left back chevron, optional right action.

Build a debug navigator in `App.tsx` that shows all screens at once (or filters to one) — wrap each screen in a phone-shaped frame with `borderRadius: 36, width: 390, height: 844`.

---

## Reusable Components

Build these once and reuse:

- `WellspringLogo` — circular logo image, configurable size
- `PhoneFrame` / `TabletFrame` — frame wrappers for mockup display
- `TopAppBar` — variants: default, with back chevron, with right action
- `BottomTabBar` — 4 tabs, active state per tab
- `PrimaryButton` — amber, full-width
- `SecondaryButton` — green outline
- `CategoryPill` — slate / green / amber tone variants
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
- Top app bar: back chevron, title "Review items", right action "Save all" (green text).
- Thumbnail strip at top: ~80px tall rounded gradient placeholder labeled "📷 Captured photo".
- Banner: green-tinted background with info icon — "AI found 6 items — review and edit before saving."
- Vertical list of editable item cards. Each card:
  - Item name (bold) e.g. "Canned Black Beans"
  - Category pill (e.g. "Canned Goods")
  - Quantity stepper (− N +), unit dropdown (count / lbs / oz), estimated $ field
  - Trash icon top-right
- Show 4 cards. One has an amber "Edited" tag. One has a red "Not in catalog" warning chip with `AlertTriangle` icon.
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
- Left sidebar nav (240px): Wellspring logo + name top, nav items (Log, **Reports** active, Recent, Profile), divider, "Sign out", user chip ("Jessica M. · Volunteer") at bottom.
- Active nav item: green tint bg `#F7FEE7`, brand-dark text, weight 600.
- Main pane: same data as mobile reports but wider — date presets in one row, **4 stat cards** (Total value, Entries, Top item, Top category), then by-item table with full columns (Item, Category, Quantity, Avg $, Total $, Entries).
- Top-right card: simple bar chart placeholder showing top 5 items as horizontal bars (use plain divs, not recharts).

### 9. Recent Entries
- Top app bar: title "Recent", right filter icon.
- Section header "Today" with cards. Each card:
  - Item name + small source badge (📷 AI, ⚡ Quick, ✏️ Manual)
  - Sub-row: quantity + unit · $value · timestamp ("2m ago")
  - Faint trash icon on right edge (static swipe-affordance hint)
- Section "Yesterday" with 2–3 dimmer rows.
- Also render a separate empty-state card alongside: green tint icon circle, "No donations yet today", amber "Log first donation" button.
- Bottom tab bar (Recent active).

---

## Sample Data (use verbatim — no Lorem Ipsum)

- Categories: `Canned Goods`, `Produce`, `Hygiene`, `Diapers`, `Meal Program`, `Other`
- Items: `Canned Black Beans`, `Peanut Butter (16oz)`, `Bananas`, `Toothpaste`, `Size 4 Diapers`, `Rice (5lb bag)`, `Shampoo`, `Apples`, `Pasta`, `Granola Bars`
- Volunteer: `Jessica M.` (initials JM)
- Sample totals: `$2,847 estimated value`, `134 entries`, top item `Size 4 Diapers`
- Sample volunteer email: `jessica@wellspring.org`

---

## Out of Scope

- Real auth, networking, persistence
- Animations / transitions / interactive prototypes
- Admin/catalog management screens
- Onboarding beyond Sign In
- Settings, notifications, dark mode
- Real charts (one placeholder bar chart on iPad is enough — render with divs)
- Loading skeletons

---

## Deliverable

A working React app where:
- `src/app/App.tsx` renders a debug navigator + every screen wrapped in a `PhoneFrame` (or `TabletFrame` for screen 8).
- Each of the 9 screens lives as its own exported component.
- Reusable components live in their own files.
- All sample data is hard-coded — no API calls, no state beyond what's needed for the navigator filter.

Match the brand color (`#39900E`) precisely. Don't invent additional brand colors. Don't add features beyond the screens above.
