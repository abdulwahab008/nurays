# Nuray design system

The redesign mockups (every customer screen, light and dark) are in the "Nuray Redesign" design canvas. This page is the
part that lives in the code: the tokens, the rules, and where they are.

## Colour

Turquoise does the work: buttons, links, selected states. Yellow is a highlight only: deals, star ratings, the tray count.
Food photos carry the colour everywhere else.

| Token (Tailwind class) | Light | Dark | Use |
|---|---|---|---|
| `bg-brand` / `text-on-brand` | #41DAC7 / #06302B | same | A filled button. Words on turquoise are always dark: white on it is 1.8:1. |
| `text-brand-ink` | #0A7A6E | #6FE5D5 | A link or a turquoise word on the page. |
| `bg-brand-soft` / `text-brand-soft-ink` | #DDF8F4 / #06594F | #123C38 / #8AEBDD | A tag, a selected row. |
| `bg-accent` / `text-on-accent` | #FFC83D / #2B2100 | same | A deal, a count. Never yellow words on white. |
| `bg-accent-soft` / `text-accent-soft-ink` | #FFF3CC / #5C4500 | #3A3010 / #FFD873 | A notice, a "New" tag, a rating box. |
| `bg-frozen-soft` / `text-frozen-ink` | #E6ECFF / #2A47A8 | #1C2747 / #A9BCFF | A frozen dish tag. `bg-frozen` (#2A47A8) is the same blue in both themes and carries white words. |
| `bg-page` | #F5F8F7 | #091614 | The page. |
| `bg-surface` | #FFFFFF | #10201E | Cards, bars, sheets. |
| `bg-raised` | #EAF2F0 | #172C29 | A field, a quiet button, a hover. |
| `text-ink` / `text-muted` | #0D2624 / #4A6460 | #E6F2EF / #A3BCB7 | Words. |
| `border-line` / `border-line-strong` | #DCE7E4 / #CBDAD6 | #223B37 / #2C4743 | Borders. |

`brand-50` … `brand-950` and `accent-50` … `accent-900` are the full scales. `bg-brand-700` (#0A7A6E) is dark enough for
white words when a turquoise block must carry them.

Panels with their own colours (the yellow, night-teal and blue home cards, the numbers panel, the kitchen page's tray bar) keep
them in both themes. Inside them use fixed colours (`text-white`, `bg-[#FFFFFF]`): the dark theme repaints `bg-white` and the grey
classes as page colours, which would put light words on a light button.

All of it is in `frontend-web/app/globals.css`: the values once for light (`:root`) and once for dark
(`:root[data-theme="dark"]`), and the Tailwind names in `@theme`.

## Type, space, corners

- Plus Jakarta Sans; Noto Nastaliq Urdu for Urdu, with more line height.
- Sizes: 36 display, 24 title, 18 heading, 16 body, 14 small, 12 label. Weight carries the hierarchy.
- A 4-point spacing scale; the screen edge is 16 px on a phone, 32 px on a desktop.
- Corners: 12 for buttons and fields, 16–20 for cards, fully round for chips.
- Touch targets at least 44 px.

## Dark theme

- A person chooses Light, Dark or "Same as phone" from the appearance button in the header (`components/layout/ThemeToggle.tsx`).
  The choice is kept in the browser (`nuray-theme`).
- Until every screen has been redesigned the default is Light, and the kitchen, rider, hub and admin screens stay light
  whatever the choice (`lib/theme.ts`: `DEFAULT_THEME_CHOICE`, `LIGHT_ONLY_PREFIXES`). Both change once those screens are done.
- A script in `<head>` sets `data-theme="dark"` before the page paints, so a dark page never flashes white;
  `components/ThemeSync.tsx` keeps it right as the person moves between pages, and sets the browser bar and phone status bar.
- Pages still written with slate and gray classes follow the theme through a small set of overrides at the top of
  `globals.css`; redesigned screens use the tokens directly.

## Shared pieces

- `components/ui/button.tsx`: the button (`default`/`primary` turquoise, `dark`, `outline`, `ghost`, `destructive`).
  Classes only, so a colour passed in `className` replaces the variant's.
- `components/ui/Mark.tsx`: the logo (a turquoise tile, a dark "n", a yellow dot); `public/brand/` has the same drawing
  as SVG and the app icons as PNG.
- `components/layout/SiteHeader.tsx`: the header of the customer pages (home, kitchens, dishes, a kitchen's menu).
- `components/layout/CustomerTabBar.tsx`: the phone tab bar (Home, Orders, Tray, Profile); `lib/tab-bar.ts` decides where it shows.
  A bar floating at the bottom of a page sits `var(--tabbar-offset)` higher so the two do not overlap.

## Guards

- `tests/unit/contrast-classes.test.ts` fails on white words on a light colour, turquoise and yellow included.
- `tests/unit/theme.test.ts` and `tests/unit/tab-bar.test.ts` cover the theme choice, the script in `<head>` and the tab bar rules.
