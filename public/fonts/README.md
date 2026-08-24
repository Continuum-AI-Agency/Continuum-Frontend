# Caption faces

The four typefaces the dynamic-subtitle presets render with. They are served from
`/fonts/*.woff2`, fetched as bytes by `src/lib/clips/captionFonts.ts`, and registered as
`FontFace`s on `document.fonts` (preview) and on the splicer worker's `self.fonts` (burn-in).

They must be real files, not family-name strings: the renderer draws on an `OffscreenCanvas`
inside a Web Worker, which never inherits `document.fonts`. Before these landed, `CaptionStyle`
`fontFamily` was inert everywhere and every caption silently fell back to Helvetica.

| file | family | axes | preset | upstream |
|---|---|---|---|---|
| `InterVariable.woff2` | `Inter` | `wght 100..900` | `glide`, `fusion` | `@fontsource-variable/inter` → `files/inter-latin-wght-normal.woff2` |
| `Anton-Regular.woff2` | `Anton` | `wght 400` (single) | `pop` | `@fontsource/anton` → `files/anton-latin-400-normal.woff2` |
| `MontserratVariable.woff2` | `Montserrat` | `wght 100..900` | `pulse` | `@fontsource-variable/montserrat` → `files/montserrat-latin-wght-normal.woff2` |
| `JetBrainsMonoVariable.woff2` | `JetBrains Mono` | `wght 100..800` | `boxed` | `@fontsource-variable/jetbrains-mono` → `files/jetbrains-mono-latin-wght-normal.woff2` |

All four are **SIL Open Font License 1.1** — self-hostable and redistributable, no attribution
burden in the UI. `OFL.txt` is the licence text. `TheBoldFont`, the original "Hormozi" face, is
free-for-personal-use only and is excluded on licensing grounds; Anton is the face Submagic
itself names as its 2025 replacement.

Variable where available on purpose: the `glide` preset emphasises by `fontWeight` rather than
colour, which is a no-op against a static single-weight file.

Latin subset only. Pulled from the fontsource CDN rather than the Google Fonts CSS endpoint
because that endpoint returns UA-dependent per-unicode-range URLs with rotating hashes — not a
reproducible pin.
