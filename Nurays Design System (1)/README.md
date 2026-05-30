# Nurays Design System

A design system extracted from the **Nurays** product family — a comprehensive, enterprise-grade management platform for home-based food businesses.

> **Codebase identity note:** Internal code refers to this product as "Fresh Frozen" / "Home Food Business Management System." The user-facing brand for this design system is **Nurays**. Treat the visual & technical foundations from the codebase as canonical; treat the brand name "Nurays" as the public surface.

---

## What is Nurays?

Nurays helps home-based food businesses run end-to-end: a single platform that combines vendor management, intelligent inventory tracking, a customer-facing e-commerce storefront, and an analytics dashboard. It's pitched as enterprise-grade software for a small-business operator — the kind of person running a kitchen out of their home and selling on web, mobile, phone, and WhatsApp.

**Core surfaces represented in this system:**
- **Operator Dashboard** — admin web app: dashboard, products, vendors, orders, inventory, reports, settings
- **Customer Storefront** — product catalog, cart, multi-step checkout, customer profile & loyalty
- **PWA / Mobile** — installable progressive web app with offline support, push notifications, install prompts

**Currency & locale:** Indian Rupee (₹), `en-IN` formatting. Built for the Indian small-business market.

---

## Sources

- **Codebase:** `Fresh Frozen app/` (mounted locally) — React 18 + Redux Toolkit + Tailwind frontend, Node/Express + MongoDB backend.
  - `client/src/styles/theme.css` — root design tokens (canonical)
  - `client/src/styles/components.css` — component patterns
  - `client/src/styles/mobile-first.css` — responsive overrides
  - `client/src/components/Layout/Sidebar.js` — navigation reference
  - `client/src/pages/Dashboard.js` — dashboard reference
  - `client/src/pages/Login.js` + `Login.css` — auth flow + hero gradient
  - `client/src/components/ProductCatalog/ProductCard.js` — product card patterns
  - `client/public/icons/` — PWA icons (placeholder logo: `🍽️` emoji on `#4F46E5` square)
  - `client/public/manifest.json` — PWA manifest, theme color `#2563eb`
- **No Figma, no slide decks** were attached.

---

## Index — what's in this folder

```
README.md                  this file
SKILL.md                   Agent-Skills-compatible entry point
colors_and_type.css        all design tokens + semantic type styles
fonts/                     (using Google Fonts via @import — no local TTFs)
assets/                    logos, icons (copied from codebase)
preview/                   small HTML cards rendered in the Design System tab
ui_kits/
  operator/                operator dashboard UI kit (sidebar, header, stat cards, etc.)
slides/                    (not created — no slide template was provided)
```

---

## Content Fundamentals

**Voice:** Professional, capable, slightly aspirational. The product positions a small-business operator as running an "enterprise-grade" operation — copy mirrors that ambition without being stiff.

**Casing:** **Title Case** for navigation, page titles, section headers, and buttons (`Add Product`, `New Order`, `View Reports`, `Today's Orders`). Sentence case is used inside paragraph copy and toasts.

**Pronouns:** Speaks **to** the operator with `you` / `your business`. "Welcome back, Admin! Here's what's happening with your business today." Possessive `Today's Orders`, `Today's Revenue` — feels personal and present-tense.

**Tone hallmarks:**
- Quantified and confident: stats are always paired with deltas (`+12%`, `-2`)
- Action-first button labels: `Add Product`, `New Order`, `Manage Inventory`
- Short, scannable activity feed phrasing: `New order #ORD-001 received from John Doe`, `Low stock alert: Tomatoes (5kg remaining)`

**Emoji usage:** Restrained but present. The codebase uses `🍽️` as a brand glyph in the sidebar and as the favicon character. Section headings in the source README use one functional emoji per group (`🏪 Product Management`, `🤝 Vendor Management`). **Treat as: functional/decorative only; never in body copy or marketing language.**

**Examples (verbatim from the codebase):**
- Login title: `Home Food Business`
- Login subtitle: `Sign in to your account`
- Dashboard greeting: `Welcome back, {name}! Here's what's happening with your business today`
- Activity item: `New product "Organic Carrots" added`
- Activity item: `Payment processed for Fresh Farms Ltd`
- Stat label: `Customer Satisfaction` → `4.4`

---

## Visual Foundations

### Color
Three-hue brand system, all chosen for legibility and warmth:

| Role | Color | Hex |
|---|---|---|
| **Primary** | Fresh green | `#22c55e` (`primary-500`) |
| **Secondary** | Warm orange | `#f97316` (`secondary-500`) |
| **Accent** | Cool blue | `#3b82f6` (`accent-500`) |

Primary is the **dominant** brand expression — used for CTAs, active states, and the gradient that accents page headings. Orange is reserved for energy / promotional moments. Blue is for informational/data UI (charts, links). Each hue ships a full 50→950 scale.

Plus four semantic ramps: **success** (green, shares hue with primary), **warning** (amber `#f59e0b`), **error** (red `#ef4444`), **info** (blue, shares hue with accent).

**Light mode is enforced** — there is no dark mode in the source.

### Type
- **Sans (UI + body):** Inter, weights 300–900. Loaded via Google Fonts.
- **Mono (code, IDs, prices in some places):** JetBrains Mono.
- Letter-spacing tightens at large sizes (-0.02em on h1).
- Display headings get the **gradient-text** treatment: `linear-gradient(135deg, primary-600, accent-600)` clipped to text. Used sparingly (page titles, login title).

### Backgrounds
- Default app background: `--gray-50` (`#f9fafb`) — never pure white at the page level.
- Cards & surfaces: pure white (`#ffffff`).
- **Hero / login backgrounds use the tri-color gradient** (`gradient-hero`: green → blue → orange) layered with subtle radial-gradient bokeh dots in white at low opacity. This is the most distinctive brand moment.
- **No** photographic backgrounds, hand-drawn illustrations, repeating patterns, or grain. The aesthetic is clean SaaS, not editorial.

### Cards
- Background: `#ffffff`
- Border: `1px solid var(--border-light)` (`#e5e7eb`)
- Radius: `--radius-xl` (12px) standard; `--radius-2xl` (16px) for hero/page-heading; `--radius-3xl` (24px) for the login card
- Shadow: `--shadow-sm` resting → `--shadow-md` on hover
- Hover: lifts `translateY(-2px)`
- **Stat cards** carry a 4px gradient bar at the top (`::before`, primary gradient). This is a **signature pattern** — repeated on the page-heading and login card.

### Buttons
- Min-height **44px** (touch target). Min-height jumps to 52px (`btn-lg`) and 60px (`btn-xl`).
- Radius: `--radius-lg` (8px) standard.
- Primary uses the **gradient** fill (`gradient-primary`), white text. Secondary is white with a 1px gray-300 border. Ghost is transparent + gray text.
- Hover: lifts `translateY(-1px)` and bumps shadow `sm → md`.
- Press: `transform: scale(0.98)`. Disabled: `opacity: 0.5`.
- Focus: 2px primary outline + 2px offset.

### Forms
- Inputs: 44px min-height, `--radius-lg`, 1px gray-300 border, white background.
- Focus: primary-500 border + 3px primary glow (`box-shadow: 0 0 0 3px rgba(34,197,94,0.1)`).
- Error & success messages have an icon + colored text (`error-600` / `success-600`).

### Elevation system (shadows)
Six steps, all neutral / non-colored: `--shadow-xs`, `sm`, `md`, `lg`, `xl`, `2xl`. Shadows are soft and conservative — used for hierarchy, not drama. Inner shadows are not used.

### Borders & dividers
- Three weights: `border-light` (gray-200), `border-medium` (gray-300), `border-dark` (gray-400).
- Almost always 1px. No double borders, no decorative borders.

### Corner radii
A clear 7-step ramp: 4 / 6 / 8 / 12 / 16 / 24 / 9999px. **Most UI sits at 8–12px**; 16–24px is for hero containers; full-pill is for avatars, badges, and the active-nav indicator pill.

### Active-state indicator
The sidebar's active link has a **3px × 20px primary-500 pill** absolutely positioned at the left edge, vertically centered. This is repeated as the "section accent" pattern across the system.

### Layout
- Fixed left sidebar **280px wide**.
- Sticky header at top with `backdrop-filter: blur(20px)` and 80% white background — translucent glass effect.
- Content max-width 1200px in some pages, full-width in others (Dashboard).
- Grid spacing uses the 4px-base scale exclusively. `gap` everywhere — never margin between siblings.

### Animation & motion
- Transitions: `--transition-fast` (150ms), `--transition-normal` (250ms), `--transition-slow` (350ms). All `ease-in-out`.
- **No bounces, no spring physics.** Framer Motion is a dependency but used minimally (product cards).
- Hover lifts: `-1px` (buttons) / `-2px` (cards) / `-4px` (stat cards).
- Press: `scale(0.98)`.
- Loading skeleton: 200%-wide gradient sweep, 1.5s linear loop.

### Transparency & blur
Used **only** on the sticky header (80% white + 20px backdrop-blur). Not used decoratively elsewhere.

### Imagery
The codebase has no production photography. Product images are user-uploaded. **When mocking, use neutral product placeholders or solid color blocks** — do not invent stock photography.

### Iconography
See ICONOGRAPHY below.

---

## Iconography

The codebase uses **two icon systems concurrently**:

1. **Heroicons (outline, 24px)** — `@heroicons/react/24/outline`. Used in operator surfaces: Sidebar (Home, ShoppingBag, Users, ClipboardDocumentList, Cube, ChartBar, Cog), Dashboard stats (CurrencyRupee, ExclamationTriangle, ArrowUp, ArrowDown, Clock, Users), Plus, etc. **Stroke weight: 1.5px (default outline).**
2. **Lucide React** — `lucide-react`. Used in the customer storefront (ProductCard): Heart, ShoppingCart, Star, Eye, Compare, Plus/Minus, Info, Leaf, Award, Clock, Truck.

Both are stroke-based, similar visual weight. The mix is technically inconsistent but visually compatible.

**For this design system:** prefer **Heroicons outline** (already linked from CDN below) for operator/admin contexts and **Lucide** for storefront/consumer contexts, matching the source. Both are available via CDN and have JSX-compatible loaders.

CDN references used in our HTML examples:
- Heroicons SVGs: copy individual SVGs from https://heroicons.com (MIT licensed)
- Lucide icons: `https://unpkg.com/lucide@latest`

**Emoji as icons:** The placeholder logo is the `🍽️` emoji. Sidebar uses it as the brand mark. **This is a placeholder** — flag it to the user; a real wordmark / monogram is a likely deliverable.

**Unicode chars as icons:** Not used.

**Custom SVGs:** Only the 512×512 placeholder logo (`assets/logo.svg`) — a `#4F46E5` square containing the 🍽️ emoji. **This is a development placeholder, not final brand identity.** Flagged.

---

## Fonts

**No local font files** are bundled in the codebase — Inter is loaded from Google Fonts via `@import`. We've kept that pattern. JetBrains Mono added as the mono companion.

> ⚠️ **Substitution flag — please confirm:**
> - Inter is a defensible default but is on the "overused font" list. If Nurays has a real wordmark or a chosen brand typeface, **please share the font files** and we'll swap.
> - JetBrains Mono is our pick for `--font-mono`; the codebase only specifies a generic stack (`source-code-pro, Menlo, Monaco`). Confirm or swap.

---

## UI Kits

- **`ui_kits/operator/`** — operator/admin web app. Sidebar, top header, page heading, stat cards, activity feed, action grid, login screen. Click-through prototype: login → dashboard.

A **customer storefront** UI kit and a **mobile/PWA** UI kit are reasonable next builds; we held off because the storefront ProductCard and Checkout components are large and the operator surface is the more reused brand expression. Flag if you want them next.

---

## Slides

Not built — no slide template or deck was provided.

---

## Caveats

- **Brand name vs codebase name** — codebase says "Fresh Frozen" / "Home Food Business"; you provided "Nurays." We've used Nurays for all public surfaces. **Confirm this is the right name.**
- **Logo is a placeholder** (🍽️ emoji on `#4F46E5`). Need a real wordmark/monogram.
- **Font choice** — Inter is the codebase default. Ready to swap when a real brand font is provided.
- **No customer storefront / mobile UI kit yet.** Built one operator kit; can add more on request.
- **Heroicons + Lucide mix** is preserved from the codebase (technically inconsistent).
