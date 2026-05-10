# Figma Design Prompt — Wellspring Donation Logger

Paste this into Figma AI / First Draft / any AI design tool. Generate **static, high-fidelity mockups only** — no prototyping, no interaction states beyond default/active visual variants, no real data wiring.

---

## Project Summary

Design a **mobile-first donation logging app** for Wellspring, a small nonprofit replacing a paper donation log. Volunteers use phones (primary) and iPads (secondary) during giveaway days to log incoming donations — items, quantities (count or lbs), and estimated dollar values for tax reporting. The hero feature is **AI photo recognition**: snap a photo of a pile of donations, the app suggests items, the volunteer confirms.

Design 9 static screens. No animations, no flows — just frames.

---

## Visual Identity

- **Tone:** Warm, trustworthy, modern-nonprofit. Friendly but not childish. Think "Linear meets a community center."
- **Primary color:** Deep teal `#0F766E` (trust, calm, nonprofit)
- **Accent:** Warm amber `#F59E0B` (used sparingly for primary CTAs and highlights)
- **Neutrals:** Slate scale — `#0F172A` text, `#475569` secondary text, `#E2E8F0` borders, `#F8FAFC` page background, `#FFFFFF` card surface
- **Success / error:** `#16A34A` / `#DC2626`
- **Typography:** Inter. Headings 600 weight, body 400, labels 500. Generous line-height (1.5).
- **Corners:** 12px on cards, 8px on inputs/buttons, fully rounded on pills and avatars.
- **Shadows:** Single soft elevation: `0 1px 3px rgba(15, 23, 42, 0.08)`. No heavy drop shadows.
- **Iconography:** Lucide icons, 1.5px stroke, in `#475569` or `#0F766E`.
- **Spacing:** 8px base grid. Cards have 16–20px internal padding.

---

## Layout Constraints

- **Mobile frame:** 390 × 844 (iPhone 14). Design every screen at this size first.
- **Tablet frame (one variant of dashboard only):** 1024 × 768 iPad landscape with sidebar nav.
- Persistent **bottom tab bar** on mobile (4 tabs): `Log`, `Reports`, `Recent`, `Profile`. Active tab is teal with filled icon; inactive is slate with outlined icon.
- Persistent **top app bar** on mobile: 56px tall, white background, subtle bottom border, screen title centered, optional left back chevron, optional right action icon.

---

## Screens to Design (9 frames)

### 1. Sign In
- Wellspring logo/wordmark centered top third.
- Subtitle: "Donation Logger".
- Email input, password input, "Sign in" amber button, "Forgot password?" link, "Create account" secondary link below.
- Soft teal gradient or subtle illustration of pantry shelves at top — keep tasteful, not stocky.

### 2. Log — Home (entry-point chooser)
- Top app bar: "Log a Donation".
- Three large tap-target cards stacked vertically:
  1. **📷 Photo** (hero card, larger, amber border or background tint) — "Snap a pile, AI fills the form" subtitle.
  2. **⚡ Quick Pick** — "Choose from common items" subtitle.
  3. **✏️ Manual Entry** — "Type it in yourself" subtitle.
- Each card: icon left, title + subtitle right, chevron far right. ~96px tall.
- Bottom tab bar visible.

### 3. Photo Capture
- Top app bar with back chevron, title "Photo Entry".
- Large dashed-border drop zone filling most of the screen with camera icon centered, "Tap to take a photo" text, and small caption "or choose from gallery".
- Below: muted helper text — "Get the whole pile in frame. AI will list each item."
- Sticky bottom: amber "Open Camera" button full-width.

### 4. AI Review (the demo moment — make this screen great)
- Top app bar: back chevron, title "Review items", right action "Save all" in teal.
- Thumbnail strip at top showing the captured photo (rounded, ~80px tall).
- Banner just below: "AI found 6 items — review and edit before saving." Soft teal background, info icon.
- Vertical list of editable item cards. Each card:
  - Item name (bold) e.g. "Canned Black Beans"
  - Category pill (small, e.g. "Canned Goods" in slate)
  - Row with quantity stepper (− N +), unit dropdown (count / lbs / oz), estimated $ value field
  - Trash icon top-right to remove item
- Show 4 cards visible, one with a yellow "Edited" tag, one with a "Not in catalog" warning chip.
- Sticky bottom: total summary "6 items · $84.50 estimated" + amber "Save all" button.

### 5. Quick Pick
- Top app bar: back chevron, title "Quick Pick", search icon right.
- Search field below app bar with placeholder "Search items…".
- Horizontal scrollable category chips: All, Canned Goods, Produce, Hygiene, Diapers, Meal Program, Other. Active chip is filled teal.
- 2-column grid of item tiles. Each tile: small product-style icon/illustration, item name, default unit label ("per lb" or "ea"), and a + button.
- Tapped state shown on one tile (teal outline + checkmark) with quantity stepper inline.
- Sticky bottom: cart-style summary "3 items selected" + amber "Save" button.

### 6. Manual Entry
- Top app bar: back chevron, title "Manual Entry".
- Form card with labeled inputs:
  - Item name (text input)
  - Category (dropdown)
  - Quantity (number)
  - Unit (segmented control: count / lbs / oz)
  - Estimated value $ (number with $ prefix)
  - Notes (multiline, optional, smaller)
  - Date received (date picker, defaults to today)
- Sticky bottom: amber "Save" button.

### 7. Reports Dashboard (mobile)
- Top app bar: title "Reports", right action download icon.
- Date-range selector card: preset chips (This month, Last month, Q2, YTD, Custom). "This month" is active.
- Two summary stat cards side-by-side: **Total value $2,847** (large, teal) and **Entries logged 134**.
- Section heading "By item" with sort dropdown.
- Table-style list, each row: item name (bold), category pill, total qty + unit (right-aligned), total $ (right-aligned, bold). Show ~6 rows with a subtle zebra background.
- Footer row: grand total in slate-50 background, amber "Export CSV" button below.

### 8. Reports Dashboard (iPad / 1024×768) — one frame only
- Left sidebar nav (240px) with Wellspring logo top, nav items: Log, Reports (active), Recent, Profile, plus a divider and "Sign out". User chip at bottom.
- Main pane: same content as mobile reports but wider — date presets in a single row, four stat cards in a row (Total value, Entries, Top item, Top category), then the by-item table full width with all columns visible (Item, Category, Quantity, Avg $, Total $, Entries).
- Optional small bar chart placeholder card top-right showing top 5 items.

### 9. Recent Entries (My session)
- Top app bar: title "Recent", filter icon right.
- Section header: "Today" then list of cards. Each card:
  - Item name + small source badge (📷 AI, ⚡ Quick, ✏️ Manual)
  - Sub-row: quantity + unit · $value · timestamp ("2m ago")
  - Swipe-affordance hint: faint trash icon on right edge (static, just a visual cue)
- Second section: "Yesterday" with 2–3 dimmer rows.
- Empty-state variant (as a separate small inset frame in the corner of the canvas): centered illustration, "No donations yet today", amber "Log first donation" button.

---

## Components to Define as Reusable Figma Components

Build these once and reuse across screens:

- **TopAppBar** — variants: default, with back chevron, with right action.
- **BottomTabBar** — 4 tabs, active variant per tab.
- **PrimaryButton** — amber, full-width and inline variants.
- **SecondaryButton** — teal outline.
- **GhostButton** — text-only.
- **Input** — text, number, with-prefix ($), with-suffix variants.
- **Dropdown / Select**.
- **SegmentedControl** — 2 and 3 option variants.
- **CategoryChip** — default + active.
- **ItemCard (review)** — used in AI Review screen.
- **ItemTile (picker)** — used in Quick Pick.
- **StatCard** — large number + label.
- **ListRow** — for reports table.
- **Banner** — info / warning / success variants.
- **Toast** (one frame on the side as reference) — success, error.

---

## Sample Copy (use verbatim — no Lorem Ipsum)

- Categories: `Canned Goods`, `Produce`, `Hygiene`, `Diapers`, `Meal Program`, `Other`
- Sample items: `Canned Black Beans`, `Peanut Butter (16oz)`, `Bananas`, `Toothpaste`, `Size 4 Diapers`, `Rice (5lb bag)`, `Shampoo`, `Apples`, `Pasta`, `Granola Bars`
- Sample volunteer name: `Jessica M.`
- Sample totals: `$2,847 estimated value`, `134 entries`, `Top item: Size 4 Diapers`

---

## Out of Scope (do not design)

- Animations, transitions, or interactive prototypes
- Admin/catalog management screens
- Onboarding flow beyond the single sign-in screen
- Settings, notifications, dark mode
- Charts beyond a single placeholder bar chart on iPad
- Loading skeletons (one inline spinner reference is fine)

---

## Deliverable

A single Figma file with:
- 9 mobile frames (390 × 844) laid out left-to-right in screen order above
- 1 iPad frame (1024 × 768)
- A separate "Components" page with the reusable components listed above
- A "Styles" page showing the color tokens, type scale, spacing scale, and icon set

Keep everything **static**. No prototype links, no interaction overlays, no states beyond what's described. The goal is a clean visual reference our 4-person team can implement in Tailwind + shadcn/ui in 24 hours.
