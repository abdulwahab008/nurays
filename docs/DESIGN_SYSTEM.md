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
- A page title (from `DashboardShell`) is 24 on a phone and 28 from `lg`; nothing on a working screen is bigger.
- A 4-point spacing scale; the screen edge is 16 px on a phone, 32 px on a desktop.
- Corners: 12 (`rounded-xl`) for buttons, fields and menu rows, 16 (`rounded-2xl`) for cards, sheets and dialogs, fully
  round for chips, pills and avatars.
- Elevation has two steps. `shadow-[var(--shadow-card)]` for the one raised card on a screen; `shadow-[var(--shadow-hover)]`
  for things that float above the page (menus, dialogs, toasts). Lists, rows and table cards have a border or a divider,
  never a shadow.
- Icons are 20 px (`h-5 w-5`) in bars and menus, 16 px beside words in a button or row.
- Touch targets at least 44 px. On a touch screen every button, field and select is at least 44 px tall
  (`globals.css`, `pointer: coarse`), and `Button size="sm"` grows from 36 to 44.
- Fields are 16 px text on a phone (`text-base`): anything smaller makes iOS zoom the page when the field is focused.
- Dates and times come from `lib/utils.ts`: `formatTime` ("9:35 pm") for a time of day, `formatDate` and `formatDateTime`
  for the rest; never `toLocaleTimeString` or a hand-made `Intl.DateTimeFormat` in a page. They follow the page's
  language. In Urdu a time keeps Western digits and the Latin "PM" (Intl has no Urdu word for it), and is wrapped in a
  left-to-right isolate (U+2066 ... U+2069) so the right-to-left line around it cannot move "PM" ahead of the digits.
  Text built around a time (`t('readyBy', { time: formatTime(at) })`) passes the formatted string, never its own clock.

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

- `components/ui/button.tsx`: the button. Variants: `default` turquoise, for the one main action of a screen (`primary` is
  the same button under its old name, do not use it in new code); `outline` for every other action; `ghost` for a
  turquoise word that acts; `destructive` red, for delete, cancel or sign out everywhere; `dark` ink, only on a photo or a
  coloured panel. Sizes: `default` 44, `sm` 36 with a mouse and 44 on touch, `lg` 48 for a sheet's full-width action.
  Classes only, so a colour passed in `className` replaces the variant's; do not pass heights or font weights to
  re-size a button, pick the size.
- `components/ui/StatusPill.tsx`: every status, on every role's screens (see "Status" below).
- `components/ui/ConfirmModal.tsx` and `useDialogs()` from `components/ui/Dialogs.tsx`: questions. A bottom sheet on a
  phone, a centred dialog from `sm`. The safe answer (Cancel) has the focus when it opens; the risky one is `destructive`.
  `ask()` takes `destructive: true` when the typed answer deletes or ends something (a password to delete an account):
  its confirm button is then the red `destructive` one. Never the browser's `confirm()` or `prompt()`.
  The icon beside the title follows `icon`: `delete` (a bin, the default for `danger`) or `warning` (a warning sign, the
  default otherwise). A danger that deletes nothing, such as a rider handing a job back, passes `icon: 'warning'`.
- `components/ui/toast.tsx` (`useToast().showToast(text, type)`): a short message about something that just happened.
  One white surface; only the icon carries the colour (turquoise done, red failed, yellow warning). It sits at the top
  end, just under the top bar (`.nuray-toaster` in `globals.css`), so it never covers a page's fixed or sticky bottom
  action bar (Place order, Save, the rider's job buttons). While a panel hangs from the top bar it moves to the bottom,
  above the phone tab bar, so the panel's header and buttons stay in reach: a new top-bar panel marks itself
  `data-top-panel` to get this. A message the person must act on is not a toast: say it on the page, next to the thing.
- `components/ui/LoadError.tsx`: a list or page that could not be read. Says why and offers Try again; never an empty
  list in its place. `compact` for one section of a page, `plain` (no frame of its own) inside a panel that has one.
  While a list is failing, its panel offers nothing that depends on it (no "3 new", no "Mark all read").
- Sign in is one button everywhere (`SiteHeader`, `DashboardNavbar`, the home hero): turquoise, `bg-brand
  text-on-brand`, 44 px tall. Signed out it is the only solid button in the header; the tray beside it takes the
  outline style until the person signs in. In the phone header it is a 44 px person icon (named "Sign in" for screen readers) in the
  place the account button takes once signed in, so the area chip beside it stays readable; Join, shown from `sm`, is
  the `outline` style next to it.
- `components/ui/Mark.tsx`: the logo (a turquoise tile, a dark "n", a yellow dot); `public/brand/` has the same drawing
  as SVG and the web app icons as PNG. The store apps' icons and splash screens come from `mobile/assets/`
  (`mobile/scripts/make-icons.mjs`).
- `components/layout/SiteHeader.tsx`: the header of the customer pages (home, kitchens, dishes, a kitchen's menu).
  Every icon button in it is 44 by 44 and `shrink-0`, so a long area name never squeezes them.
- `components/layout/PhoneTabBar.tsx`: the phone tab bar (Home, Orders, Tray, Profile for customers; Home, Orders, Menu, Earnings, Settings for kitchens; Deliveries, Earnings, Settings for riders); `lib/tab-bar.ts` decides which bar shows where.
  The current tab's icon sits on a `bg-brand-soft` pill and its label is bold. A bar floating at the bottom of a page sits
  `var(--tabbar-offset)` higher so the two do not overlap.
  Its labels carry a `leading-` class so in Urdu the Nastaliq line gets its taller height and no descender is cut off.
- `components/layout/DashboardNavbar.tsx`: the top bar of every signed-in screen. The same for all roles: borderless 44 px
  icon buttons, a round `bg-brand-soft` initial for the account (no colour per role), the role named in a quiet
  `bg-raised` pill inside the account menu. The phone drawer (`DashboardSidebar`) marks the current page with
  `bg-brand-soft text-brand-soft-ink` for every role.
- `components/layout/DashboardShell.tsx` and `AdminShell.tsx`: the frame of every signed-in screen, with the same page
  padding (`px-4 sm:px-6 lg:px-10 py-5 lg:py-8`) and a side menu whose background runs the page's full length. Menu
  names are sentence case and match the page they open ("Saved kitchens", "Nuray wallet"). A destination is offered once
  per screen size: the tray is in the top bar (from `md`) and the phone tab bar, never in the side menu; on a phone the
  menu leaves out what the tab bar has (`phoneTab`).
  The admin pages are written in English only: their content area is `dir="ltr" lang="en"` in either language, while the
  top bar and the side menu (translated in `lib/i18n/messages/nav.ts`) follow the language chosen.
  The questions from `useDialogs()` and the words of a toast follow the admin pages: on an `/admin` route they are
  left to right with English buttons (`PageLocale` in `lib/i18n`), while the toast keeps the corner of the top bar.
  `rtl:` classes (`rtl:-scale-x-100` on an arrow) do not apply inside a `dir="ltr"` area (`app/globals.css` redefines
  the variant), so the admin pages' arrows point the English way in the Urdu app.
- `components/layout/StackedTables.tsx`: below 768 px a table with three or more columns becomes one card per row. What
  the table displays as is in the components layer, so `hidden` / `sm:table` on it still win; a table with its own
  phone layout opts out with `data-no-stack`.

## Status

One colour language for an order, everywhere (kitchen, rider, customer, admin). The colour says what kind of moment it
is; the words say which one, and a role may use its own words (`label`).

| Tone | Looks | Order statuses | Means |
|---|---|---|---|
| `waiting` | `bg-accent-soft text-accent-soft-ink` | pending, pending_payment | Someone has to act: accept it, pay for it. |
| `good` | `bg-brand-soft text-brand-soft-ink` | confirmed, preparing, ready, dispatched, in_transit | It is moving. |
| `neutral` | `bg-raised text-muted` | delivered, completed | It is over. History recedes so live orders stand out. |
| `ended` | outlined, `text-muted` | cancelled, refunded | It stopped without happening. Not a problem, so not red. |
| `problem` | `bg-red-50 text-red-700` | delivery_failed | A person has to sort it out. |

```tsx
<OrderStatusPill status={order.orderStatus} />               // shared words from common.ts
orderStatusTone(order.orderStatus)                            // the tone alone, for a dot or a border in the same colour
<OrderStatusPill status={order.orderStatus} label={kitchenStatusLabel(order.orderStatus, t, tc)} />
<StatusPill tone="waiting">Receipt to check</StatusPill>      // any other status: pick the tone by what it means
```

Other statuses (an application, a payout, a ticket) use `StatusPill` with the tone that matches its meaning. Do not write
a new status-to-colour map in a page.

## Staff screens (kitchen, rider, hub)

The people on these screens are working: a cook between orders, a rider on a motorbike. A screen answers "what needs me
now?" first and keeps everything else quiet. `app/riders/dashboard/page.tsx` is the reference.

- **Say it once.** The page title comes from `DashboardShell` and appears only as the page heading; nothing repeats it
  (no second title, no banner restating it, no "Quick actions" block repeating the sidebar).
- **One raised surface per screen.** The thing that needs action (the current job, the orders waiting for the kitchen)
  is a `bg-surface` card with `border-line` and `shadow-[var(--shadow-card)]`. Everything else sits flat on `bg-page`
  as sections divided by `border-t border-line`, with an `text-sm font-semibold text-ink` heading.
- **Numbers, not tiles.** A figure is a `text-sm text-muted` label above a `text-2xl font-semibold text-ink tabular-nums`
  value. No icon tile beside it, no tinted card behind it, no coloured text unless the colour means something.
- **Tokens only.** `bg-page`, `bg-surface`, `bg-raised`, `text-ink`, `text-muted`, `border-line(-strong)`; turquoise
  (`Button` default, `text-brand-ink`, `bg-brand-soft`) for actions and good news; `bg-accent-soft` /
  `text-accent-soft-ink` for money to collect and things waiting; `red-700` / `bg-red-50` only for problems. No
  `slate-900` panels, gradients, or blue/purple/amber/emerald accents.
- **Words.** Sentence case everywhere. No ALL-CAPS labels, no letter-spaced eyebrows, no emojis, no `→` on links. Plain
  names a cook or rider would use ("New jobs", "Waiting for you"), never system names ("Pool", "Mission control").
- **Pieces.** `components/ui/button.tsx` for every button (default for the one main action, `outline` or `ghost` for
  the rest); underlined tabs as on the rider screen; status as `StatusPill` / `OrderStatusPill` (see "Status"). Touch
  targets at least 44 px (`min-h-11`).
- **Empty and loading.** An empty list is one line saying what will appear there and, when there is one, the action
  that fills it. Loading is a small spinner with one line of text. A failed load is `LoadError`.
- **Lists on a dashboard.** A home screen shows the few rows that need the person now (two or three) and a "See all"
  link to the full page; the full list, with its filters, lives on that page.

## Forms

- A label above every field (`text-sm font-medium text-ink`), the hint under it in `text-muted`.
- A problem with one field is said under that field (`text-[13px] text-red-700`, `role="alert"`) and the field gets
  `aria-invalid` (a red border). A problem with the whole form (a refused sign-in) sits just above its button.
- Messages are full sentences with a full stop, saying what to do: "Use at least 8 characters.", not "Invalid password".
- The sign-in and sign-up screens (`components/auth/AuthLayout.tsx`) are the reference.

## Guards

- `tests/unit/contrast-classes.test.ts` fails on white words on a light colour, turquoise and yellow included.
- `tests/unit/theme.test.ts` and `tests/unit/tab-bar.test.ts` cover the theme choice, the script in `<head>` and the tab bar rules.
