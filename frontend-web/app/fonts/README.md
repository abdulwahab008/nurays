# Fonts

The web app serves its own fonts. Nothing is fetched from Google at build time or in the browser.

| Family | Used for | Files |
|---|---|---|
| Plus Jakarta Sans | all text | latin, latin-ext |
| Geist Mono | codes, PINs, order numbers (`font-mono`) | latin, latin-ext |
| Noto Nastaliq Urdu | Urdu text (`html[lang="ur"]`) | arabic |

All three are variable fonts under the SIL Open Font License 1.1 (copies in `licenses/`). The files
come from the Fontsource packages `@fontsource-variable/plus-jakarta-sans`, `@fontsource-variable/geist-mono`
and `@fontsource-variable/noto-nastaliq-urdu`, version 5.3.0, unmodified.

`fonts.css` declares them under the plain family names that `globals.css` already uses, and `app/layout.tsx`
imports it. To refresh them: `npm pack @fontsource-variable/<name>`, copy the `*-wght-normal.woff2` files for the
subsets listed above, and keep the `unicode-range` lines from the package's `wght.css`.
