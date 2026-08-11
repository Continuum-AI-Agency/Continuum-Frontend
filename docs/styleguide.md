# Style Guide: Continuum Design System

The visual language and implementation standards for the **Continuum** app, built on **Tailwind CSS 4** + **Base UI** (`@base-ui/react`, via shadcn's `base-nova` preset). The product is an information-dense marketing operations dashboard. The aesthetic target is **calm-dense** — Linear / Cloudflare / ClickUp: maximum useful information per screen, disciplined spacing, hairline structure, restrained color. Function over form, yet beautiful.

> **Source of truth for sizing is `src/app/globals.css`.** Every size derives from the rem-based density tokens there so proportions hold across screen sizes. Do not hardcode pixel sizes in components — see §2 and §3.

---

## 1. Color Palette & Theming

Use semantic tokens, never hardcoded hues. Tokens are defined in `src/app/globals.css` and exposed as Tailwind utilities via the `@theme` block (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, etc.).

| Purpose | Light | Dark | Utility |
| :--- | :--- | :--- | :--- |
| Surface (base bg) | `#fdfdfd` | `#020617` | `bg-background` |
| Card / panel | `#f5f4ff` | `#0B1220` | `bg-card` |
| Primary text | `#16162a` | `#E5E7EB` | `text-foreground` |
| Muted text | `#5c5b7a` | `#94A3B8` | `text-muted-foreground` |
| Primary brand (violet) | `#5A48F9` | `#7C6FFF` | `bg-primary` / `text-primary` / `ring` |
| Secondary (cyan) | `#0ea5e9` | `#0ea5e9` | `bg-secondary` |
| Border / divider | `#e4e2f7` | — | `border-border` |
| Danger | `#EF4444` | `#F87171` | `bg-destructive` |

**Color is a scarce resource.** Brand violet is an **accent** — focus rings, active states, primary CTA, key data — never a large flat fill behind a panel or section. Structure comes from 1px `border-border` hairlines, not from colored blocks. Calm surfaces, restrained accent.

> **Contrast:** Body text ≥ 4.5:1 against its background (WCAG AA); large/bold text ≥ 3:1. Placeholder text is held to the same 4.5:1 — do not let muted gray fall below it. We target AAA (7:1) on primary copy where achievable.

---

## 2. Typography

**Font:** **Geist Sans** (`--font-geist-sans`) for all UI/body; **Geist Mono** (`--font-geist-mono`) for code, metrics, and tabular data. There is no separate display face — hierarchy comes from size and weight, not a second family.

### The type scale is rem-based and rides the root ladder

`html { font-size: var(--font-size-root) }` (15px, stepping to 14.5 / 13.5 / 13px on shorter viewports — see `globals.css`). **Every `text-*` utility is rem, so the whole UI scales proportionally with the viewport.** This is what keeps ratios identical across screen sizes.

| Role | Utility | ~px @ root 15 | Notes |
| :--- | :--- | :--- | :--- |
| Micro label / meta | `text-3xs` | ~9 | uppercase tags, dense table meta |
| Small label | `text-2xs` | ~10 | secondary labels, chips |
| UI label / caption | `text-xs` | ~11 | the workhorse UI size |
| Body / control text | `text-sm` | ~13 | default body & input text |
| Emphasis body | `text-base` | ~15 | lead paragraphs |
| Headings | `text-lg` … `text-3xl` | — | page/section titles; `font-medium`/`font-semibold` |

> **BANNED: `text-[Npx]` literal font sizes.** A pixel-literal does **not** scale with `--font-size-root`, so it breaks cross-screen proportion — the single biggest density bug. Always use a `text-*` token (add one to `@theme` if a genuinely new size is needed). Arbitrary **color** values (`text-[#fff]`, `text-[var(--x)]`) are fine; arbitrary **sizes** are not.

Keep ≤ 3–4 distinct type sizes per surface. Cap body line length at 65–75ch. Use `font-mono` for numbers that should align (stat values, table figures).

---

## 3. Spacing, Layout & Density

Spacing derives from the density tokens in `globals.css` (`:root` + the `@media (max-height/-width)` tiers), not from an abstract 8pt grid. Consume the tokens; do not re-hardcode their values.

| Token | Purpose |
| :--- | :--- |
| `--shell-gutter`, `--shell-stack-gap` | App shell content gutter + stack gap |
| `--app-shell-gap`, `--app-shell-pad-inline/block` | Dense panel rhythm inside the dashboard |
| `--page-pad-inline/block`, `--page-section-gap` | Document-style page rhythm (Settings, Admin) |
| `--card-pad`, `--card-gap` | Card padding + internal gap (consumed by `ui/card.tsx`) |
| `--app-header-h` | Top header height (single source for viewport scroll math) |
| `--shell-sidebar-w`, `--dashboard-side-rail-width` | Sidebar + rail widths |

Use them as `px-[var(--card-pad)]`, `gap-[var(--app-shell-gap)]`, etc. For local micro-spacing inside a component, small stock utilities (`gap-1.5`, `gap-2`) are fine; section-level rhythm must use the tokens so one knob tunes the whole app.

**Responsiveness:** the app uses a single rem ladder (root font-size steps on viewport height) rather than per-component breakpoints — this is why density and proportion stay constant from laptop to large monitor. Avoid fixed pixel widths on containers; use `w-full`, `min-w-0`, fractional/`fr` grids, and the width tokens.

---

## 4. Viewport-fit & scroll discipline

The shell is viewport-locked: `(post-auth)/layout.tsx` → `DashboardLayoutShell` → `<main>` is the single page-scroll authority. **Design every surface to fit within `h-[var(--app-content-h)]`.**

- **The only intentional content-scroll regions are:** (a) the **organic posts feed** (planner list/month/week stacks) and (b) the **paid observability** ads-within-adset browsing. These scroll inside their own contained regions.
- Every other surface (dashboard home, settings, admin, analytics) targets fitting the viewport. Bound the frame to `h-[var(--app-content-h)]` and put any overflow in an inner `min-h-0 flex-1 overflow-y-auto` pane.
- **Scroll is the emergency escape hatch, never the default, and clipping is a bug.** A bounded pane shows no scrollbar when content fits and degrades to a contained scroll when it genuinely can't (short screens, dense data). Never use `overflow-hidden` in a way that clips real content.

---

## 5. Components

### Shared structural primitives (`src/components/shared/`) — use these, don't hand-roll

Every panel/page/metric block composes from these. **Never hand-roll a panel header, a page title block, or a stat-card grid** — reach for the primitive so the whole app stays one structure.

- **`Panel`** — the panel itself: `<Panel title="Foo" meta={…} action={…} bodyClassName?>{children}</Panel>` renders a `SectionHeader` over a `p-[var(--card-pad)]` body. **It carries no border, radius or surface colour** — app panes are flat, and a panel that owns no chrome can never produce a card-in-card. Pass `bodyClassName="p-0"` when the body pads its own rows/cells (tables, lists). Floating surfaces opt into chrome via `className` — see `OptimizerPanel` for the pattern.
- **`SectionHeader`** — the panel header bar used *by* `Panel`: a hairline `border-b border-border px-[var(--card-pad)] py-[var(--section-header-pad-block)]` row, title `text-xs font-semibold uppercase tracking-wide text-muted-foreground`. Reach for `Panel` first; use `SectionHeader` bare only when a surface genuinely has a header and no body.
- **`PageHeader`** — the workspace/page title: `<PageHeader title="Foo" description="…" action={…} />`, title `text-base font-semibold`. Two-tier hierarchy: **PageHeader (`text-base`) for page titles, SectionHeader (`text-xs uppercase`) for panels.** Never use `text-2xl`/`text-xl` for an in-app page header.
- **`MetricStrip`** — the one-line KPI row: `<MetricStrip items={[{label, value, deltaPct?}]} live? />`. **Replaces big stat-card grids** (3/4/5/6-up bordered cards with `text-2xl`+ numbers). Metrics are a quiet line, not a wall of cards.
- **`ModuleShortcutLink`** — the "go to workspace" arrow: `<ModuleShortcutLink href="/scale" label="Scale" />`. Pass as a panel's `action` where it teases a fuller surface.
- **`DeltaBadge`** — `<DeltaBadge value={n} isPercent? />`, emerald-up / red-down mono delta.

### Panes vs. cards

**App surfaces are flat panes, not cards.** A dashboard, workspace or settings surface is one bounded frame filled with full-bleed panes separated by **1px `border-border` hairlines** — `divide-y` down a stack, `divide-x` across a row. No radius, no per-panel border, no gap between panes. Structure comes from the dividers; the pane's only inset is its own `var(--card-pad)`.

Two rules follow, and they are the ones that actually drift:

- **Never nest a bordered/rounded box inside another.** If an ancestor already draws a border, the descendant may not. Repeating the *same* token (`border-border` inside `border-border`) is the tell.
- **Never charge a gutter twice.** If a parent pads, the child does not. `--app-shell-pad-inline` and `--shell-gutter` resolve to the same value — applying both is a silent double charge.

Radius signals **floating**, flat signals **structural**. `rounded-lg` is reserved for surfaces that genuinely leave the plane — popovers, hover cards, dialogs, dropdowns — and is the ceiling everywhere (no `rounded-2xl`/`rounded-3xl` on app surfaces).

### Cards (`ui/card.tsx`)
Still available for genuinely floating or standalone content (`OptimizerPanel`, quick-look popovers): `rounded-lg`, **1px border only — no drop shadow by default**, padding `var(--card-pad)`, internal gap `var(--card-gap)`. Not for dashboard panes — use `Panel`. **No `p-6`/`p-8` panel padding** — use `var(--card-pad)`; empty states cap at `p-6`. Pairing a 1px border with a soft wide shadow — the "ghost card" — is banned, as are heavy shadows (`shadow-md`/`shadow-xl`/`shadow-2xl`).

### Buttons (`ui/button.tsx`)
Heights: default `h-8` (32px), `sm` `h-7` (28px), `xs` `h-6` (24px), `lg` `h-9`; icon `size-8`. `rounded-md`. Primary = `bg-primary text-primary-foreground`; hover shifts background, `:active` micro-scales. No decorative drop shadow.

### Inputs / Selects / Tabs
Match button heights: default 32px (`h-8`), `sm` 28px (`h-7`), `lg` 40px. `rounded-md`, 1px border, visible `ring` focus state. Text is `text-sm`.

### Tags / Badges
`rounded-full`, `text-3xs`/`text-2xs`, optionally uppercase with light tracking. Muted/desaturated backgrounds only.

### Iconography
`lucide-react`, sized to adjacent text (`size-4` with body, `size-3` in dense rows). Icons are `text-muted-foreground` unless active (`text-primary`) or destructive. lucide ships no brand glyphs — brand marks come from `@/components/shared/icons` (`makeSvgIcon`).

### Motion (`motion/react`)
Fast, subtle, GPU-only (`transform`/`opacity`). `duration-200`–`300`, ease-out curves. Respect `prefers-reduced-motion` with a crossfade/instant fallback. Motion supports state changes; it is not decoration.

### Base UI rules
Theming is driven by `theme-provider.tsx`, which keeps `data-theme` and `html.dark`/`html.light` in sync so Tailwind `dark:` utilities, CSS variables, and chart theme detection all agree. Prefer Base UI primitives (via shadcn `ui/*`) for accessible interactive components (menus, dialogs, tabs, accordion). All interactive elements show a visible `ring` focus state.

Base UI differs from Radix in three ways worth remembering: there is no `asChild` (pass a `render` element, which keeps that element's own children); there is no `Slot` (`useRender` + `mergeProps` is the equivalent); and floating parts gain a `Positioner` between `Portal` and `Popup`, where `side`/`align`/`sideOffset` live. A link styled as a button must use `buttonVariants()` on the `<Link>` — routing it through `<Button>` injects button semantics that destroy the anchor's link role.

Uncontrolled primitives capture `defaultValue`/`defaultOpen` on first render, so any initial state derived from data that arrives later must be controlled (`value` + `onValueChange`) or it silently never applies.

---

## 6. Global & Accessibility

- `src/app/globals.css` is the **only** place for global styles, CSS variables, and Tailwind base imports.
- Keep theming synced via `data-theme` **and** `html.dark/.light` so Tailwind `dark:`, CSS vars, and chart/map theme detection agree.
- Focus rings are mandatory and on-brand (`ring`/`ring-ring`); never remove the focus outline without an equally visible replacement.
- No horizontal scroll on any viewport (`overflow-x-hidden` where needed). No layout shift.
- Skeletons are neutral (`bg-muted/70`) and shaped like the real content (headers, controls, rows), never generic full-bleed blocks.
