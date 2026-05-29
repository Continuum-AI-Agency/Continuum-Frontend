---
version: beta
name: Continuum Singularity
description: A confident AI-marketing command-center aesthetic inspired by gravitational physics, utilizing Tailwind CSS, OKLCH color spaces, and responsive component architecture.
---

# Continuum Unified Design System

## Overview

Continuum is an engineering-led, responsive command center for automated creative marketing. The visual language escapes the cliché "AI Aesthetic" (neon purple glows, dark navy, cyber grids) by shifting the narrative toward gravitational physics: Black Holes, Event Horizons, and Space-Time Continuums. The UI must feel like an impeccably precise instrument. It uses high-contrast tonal layering, explicit OKLCH color definitions, and utility-first responsive strategies (via Tailwind CSS) to scale gracefully from massive desktop dashboards down to cramped, data-heavy mobile viewports.

**The Brand Promise:** "Build Continuity. Scale Personalization."

The brand persona is **Intelligent, Serene, Precise, Human, and Reliable**. We strictly avoid "AI hype" (no magic, no miracles, no sci-fi tropes). The technology is framed as "positive technology" — a tool that amplifies human capability rather than replacing it.

---

## Colors — The Singularity Palette

We strictly forbid the "Lila Ban" — the overused purple-primary, cyan-secondary, glowing dark-navy trope of 2024–2025 AI startups. Continuum relies on a barely-tinted slate foundation ("Deep Gravity"), drives interaction with a highly visible Teal, and restricts the brand Violet to a strict 10% usage rule for moments of pure identity.

All colors are specified in OKLCH to guarantee predictable lightness steps, perceptual uniformity, and rational contrast ratios.

### Color Tokens

| Token | OKLCH | Hex Reference | Usage |
|---|---|---|---|
| `brand-violet` | `oklch(52% 0.22 275)` | `#5A39FF` | Logo, hero graphics, empty-state illustrations. **10% rule — never a button fill or structural background.** |
| `primary-teal` | `oklch(65% 0.13 180)` | `#0DAEA2` | Primary buttons, active tabs, primary data viz series. Workhorse interactive color. |
| `primary-teal-hover` | `oklch(75% 0.13 180)` | — | Hover state for primary-teal elements only. |
| `background-dark` | `oklch(14% 0.01 265)` | `#0B1220` | "Deep Gravity." Abyssal, heavily desaturated dark slate. The base layer. |
| `surface-dark` | `oklch(20% 0.015 265)` | `#2E2257` ref → corrected | "Accretion Disk." Barely-tinted dark slate for cards and panels. |
| `surface-dark-hover` | `oklch(24% 0.015 265)` | — | Table row and card hover state. |
| `background-light` | `oklch(99% 0.002 265)` | `#F2F4F8` | Light mode page background. |
| `surface-light` | `oklch(96% 0.005 265)` | `#E5E7EB` | Light mode card and panel surface. |
| `surface-light-hover` | `oklch(92% 0.008 265)` | — | Light mode hover state. |
| `text-primary-dark` | `oklch(98% 0.005 265)` | `#F2F4F8` | Primary text in dark mode. |
| `text-secondary-dark` | `oklch(75% 0.015 265)` | `#94A3B8` | Secondary text, table headers, placeholders in dark mode. |
| `text-primary-light` | `oklch(20% 0.015 265)` | `#0B1220` | Primary text in light mode. |
| `text-secondary-light` | `oklch(45% 0.015 265)` | — | Secondary text in light mode. |
| `success` | `oklch(68% 0.11 150)` | `#53A88A` | Validations, confirmations, positive states. |
| `error` | `oklch(55% 0.2 25)` | `#EF4444` | Critical failures and destructive actions only. |
| `accent-magenta` | `oklch(65% 0.25 320)` | `#E056FD` | **Strict usage only.** AI-generated insight labels, critical metric anomalies in charts. Never structural UI. |

### Color Rationale

- **Primary Teal** sits far from generic AI cyan — a mature, stable hue that reads as operational confidence.
- **Brand Violet** is a spice, not a base. It surfaces identity at brand moments only.
- **Surface Dark** is a barely-violet slate — depth without becoming a purple neon soup.
- **Accent Magenta** appears where the AI layer surfaces to the user — narrative, not infrastructure.

### Contrast Validation (WCAG 2.1)

> **Note on methodology:** OKLCH lightness (L) is perceptually uniform but not identical to WCAG relative luminance (which uses sRGB linearization). L-delta is a reliable proxy for estimating contrast direction and magnitude, but final production validation must use a WCAG 2.1-compliant contrast checker (e.g., `@csstools/postcss-color-mix`, Colour Contrast Analyser, or browser DevTools). The ratios below are verified estimates, not guaranteed by L-delta alone.

| Foreground | Background | Estimated Ratio | AA (4.5:1) | AAA (7:1) |
|---|---|---|---|---|
| `text-primary-dark` (L=98) | `surface-dark` (L=20) | ~14:1 | Pass | Pass |
| `text-secondary-dark` (L=75) | `surface-dark` (L=20) | ~7.5:1 | Pass | Pass |
| `text-primary-light` (L=20) | `surface-light` (L=96) | ~13:1 | Pass | Pass |
| `text-secondary-light` (L=45) | `surface-light` (L=96) | ~5.5:1 | Pass | Fail |
| `primary-teal` (L=65) | `surface-dark` (L=20) | ~5:1 | Pass | Fail — non-text UI use only |

### Data Visualization Color Scale

For data series in charts and visualizations. Use solid fills only — no patterns, stripes, or gradient fills inside chart elements.

| Token | OKLCH | Approximate Color | Dark Mode | Light Mode |
|---|---|---|---|---|
| `data-viz-1` | `oklch(65% 0.13 180)` | Teal | Pass 3:1 graphic | Pass |
| `data-viz-2` | `oklch(70% 0.15 220)` | Blue | Pass | Pass |
| `data-viz-3` | `oklch(55% 0.18 100)` | Olive-Green | Pass | Pass |
| `data-viz-4` | `oklch(60% 0.20 30)` | Orange | Pass | Pass |

> **Light mode note:** `data-viz-3` is shifted to L=55% (from 75%) to guarantee the 3:1 graphic contrast minimum on `background-light`. Always validate data viz colors against the specific background in use, not just background-dark.

---

## Typography

We reject ubiquitous startup fonts for structural UI. For a product promising engineering precision, typography must reflect technical rigor. We maintain a strict separation between brand expression (Futura Maxi) and operational clarity (Geist).

### Font Roles

- **Futura Maxi** — Brand display only. Marketing hero sections and massive dashboard welcome titles. Never body copy, never components, never lowercase.
- **Geist** — The operational engine. All UI labels, body text, table data, headlines within the application.
- **Geist Mono** — Numeric and data contexts only. Metric counters, timestamps, code, table cells with numbers. Tabular numerals (`tnum`) are mandatory.

### Type Scale

| Token | Font | Size | Weight | Line Height | Letter Spacing | Context |
|---|---|---|---|---|---|---|
| `display-lg` | Futura Maxi | `clamp(3rem, 5vw + 1rem, 4.5rem)` | 700 | 1.1 | -0.02em | Marketing hero |
| `display-md` | Futura Maxi | `clamp(2.5rem, 4vw + 1rem, 3rem)` | 700 | 1.1 | -0.01em | Marketing sub-hero |
| `headline-md` | Geist | `1.75rem` | 600 | 1.2 | — | App section titles |
| `headline-sm` | Geist | `1.25rem` | 500 | 1.3 | — | App panel headers |
| `body-xl` | Geist | `1.125rem` | 400 | 1.5 | — | Lead paragraphs, sidebar callouts |
| `body-lg` | Geist | `1rem` | 400 | 1.5 | — | Standard body |
| `body-md` | Geist | `0.875rem` | 400 | 1.4 | — | Compact UI text, form fields |
| `label-sm` | Geist | `0.75rem` | 500 | 1.2 | 0.02em | Table headers, badges, captions |
| `mono-data` | Geist Mono | `0.8125rem` | 500 | 1.4 | — | All numeric cells, timestamps |

### Typography Rules

- `display-lg` and `display-md` use `clamp()` for fluid scaling on marketing/landing pages. All other sizes are fixed `rem` — fluid type inside data-dense application UIs causes unpredictable column wrapping.
- `mono-data` must always include `font-feature-settings: "tnum" 1` so decimals, commas, and currency symbols align perfectly in columns.
- Maximum line length for body text: `max-w-[65ch]`. Lines wider than ~75 characters are fatiguing.
- Never use extra-bold or black font weights. Never set long body passages in uppercase.
- Light text on dark backgrounds: add 0.05–0.1 to normal line-height — light type reads as lighter weight and needs more breathing room.

### Skill Reference — `/typeset`

Invoke `/typeset` when reviewing or improving typography. Full guidance lives in the skill; the rules below are the Continuum-specific distillation.

- **Squint test for hierarchy.** Blur your eyes — can you still tell headline from body from caption? If sizes feel muddy, the scale is too tight. Our scale already skips meaningful steps; don't introduce intermediate sizes.
- **Weight contrast must skip a step.** Regular → Semibold reads as hierarchy; Regular → Medium does not. Use the weights defined in the type scale (400 / 500 / 600 / 700) — never load extras.
- **Three weights per family, max.** Geist ships with Regular, Medium, Semibold; that is the ceiling. Adding more bloats the bundle and dilutes meaning.
- **Combine dimensions for hierarchy.** Size + weight + color + space. Never lean on size alone.
- **Tabular numerals are mandatory for data.** `mono-data` already enforces `tnum`; any custom numeric display must too.
- **Body text floor: 16px (`body-lg`).** `body-md` is for compact UI chrome only — never long-form reading.
- **Never pair similar-but-not-identical sans-serifs.** Futura Maxi (display) + Geist (UI) is the only intentional pairing. Don't introduce a third sans.

**NEVER**: arbitrary sizes outside the scale · extra-bold or black weights · uppercase long passages · `px` font sizes (use `rem`) · decorative fonts for body · placeholder text as the only label.

---

## Spacing — The 4pt Scale

The jump from 8px to 16px is too coarse for fine-grained UI work. All spacing uses a strict 4pt scale with semantic tokens.

| Token | Value | Usage |
|---|---|---|
| `xs` | 4px | Icon-label gap, badge internal padding |
| `sm` | 8px | Button vertical padding, tight list items |
| `md` | 12px | Input internal padding, form group spacing |
| `lg` | 16px | Standard component padding |
| `xl` | 24px | Button horizontal padding, section internal padding |
| `2xl` | 32px | Card padding, panel padding |
| `3xl` | 48px | Section gaps |
| `4xl` | 64px | Major layout regions |
| `5xl` | 96px | Hero breathing room |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `none` | 0px | — |
| `sm` | 4px | Input fields, tags |
| `md` | 8px | Buttons, tooltips |
| `lg` | 12px | Secondary containers |
| `xl` | 16px | Cards, modals, panels |
| `full` | 9999px | Badges, pills, avatar rings |

---

## Layout & Responsive Strategy

The layout strategy relies on **"Modular Connectivity"** and **"Continuous Flow."** Layouts must handle extreme data density on cramped screens without breaking.

### Grid

- Default to CSS Grid over flexbox percentage math: `grid-cols-1 md:grid-cols-2 xl:grid-cols-4`
- Modules are separated by `spacing.3xl` (48px) gaps — not dividing lines — to emphasize open architecture
- Never use `h-screen`. Always use `min-h-[100dvh]` for full-height sections

### Cramped Screen Strategies (Tailwind)

**Truncation over Wrapping:** Apply `truncate min-w-0` on flex children containing text. Without `min-w-0`, flex items ignore overflow constraints and break horizontal layout.

**Fluid Grids:** `grid-cols-1 md:grid-cols-2 xl:grid-cols-4` for widget layouts ensures predictable reflows at every breakpoint.

**Horizontal Scroll Snap:** On mobile, rows of filter pills or metric cards use `overflow-x-auto snap-x snap-mandatory` with `snap-start` on children rather than collapsing to endless vertical stacking.

**Contain page layouts:** `max-w-[1400px] mx-auto` for dashboard-width containers.

### Negative Space

Breathing room is non-negotiable. Ample padding must surround all major functional zones to prevent cognitive overload on data-heavy screens. Never apply the same spacing everywhere — varied rhythm communicates hierarchy.

### Skill Reference — `/layout`

Invoke `/layout` when composition feels monotonous, crowded, or structurally weak. Full guidance lives in the skill; the rules below adapt it to Continuum's 4pt scale and density requirements.

- **Visual rhythm = tight clusters + generous breaks.** Related elements: `xs`–`sm` (4–8px). Distinct sections: `3xl`–`5xl` (48–96px). Equal spacing everywhere kills hierarchy.
- **Flex for 1D, Grid for 2D.** The "default to CSS Grid" rule above governs page-level dashboards; component internals (button rows, card contents, nav clusters) should use Flexbox. Don't reach for Grid when `flex` with `gap` and `flex-wrap` is simpler.
- **Use `gap`, not margins, for sibling spacing.** Eliminates margin collapse and works identically in Flex and Grid.
- **Never nest cards inside cards.** Within a card, use spacing and dividers — not another container — to express sub-hierarchy.
- **Vary card sizes and column spans** to break "icon + heading + text × 4" grid monotony. Asymmetric layouts feel more designed than centered everything.
- **Z-index uses the semantic scale below.** No arbitrary `999` / `9999` values.
- **Squint-test verification.** After spacing changes, blur your view — primary element, secondary, and groupings should be obvious within 2 seconds.

**NEVER**: arbitrary spacing outside the 4pt scale · uniform spacing across all gaps · wrap everything in cards · default to CSS Grid for 1D layouts · arbitrary z-index values.

### Skill Reference — `/design-taste-frontend`

Invoke `/design-taste-frontend` when initiating the implementation of a new frontend view, landing page, portfolio component, or visual layout to read the brief correctly and set up design system constraints.

- **Establish the Design Read:** Before touching any code, declare a single-line "Design Read" identifying page kind, target audience, vibe language, and target aesthetic family.
- **Calibrate Core Dials:** Explicitly calibrate structural density, visual variance, and motion choreography rather than reverting to generic AI/SaaS defaults.
- **Reject AI-Default Slop:** Actively block neon-purple gradient backdrops, centered hero layout over dark mesh grids, three generic feature cards, and Inter+slate-900 typography pairs.

---

## Elevation & Depth — The No-Glow Rule

Outer glows on interactive elements are **strictly banned.** They are cheap, visually muddy, and are the single most recognizable "generic AI interface" tell.

Continuum uses **Tonal Layering** and **Liquid Glass Refraction**: a soft drop shadow combined with a 1px bright inner border to simulate physical edge refraction. This achieves depth without decorative glow.

### Elevation Tokens

| Level | Context | CSS Value |
|---|---|---|
| `level-1-dark` | Cards, buttons | `0 1px 3px oklch(0% 0 0 / 40%), inset 0 1px 0 oklch(100% 0 0 / 8%)` |
| `level-2-dark` | Dropdowns, popovers | `0 4px 12px oklch(0% 0 0 / 50%), inset 0 1px 0 oklch(100% 0 0 / 12%)` |
| `level-3-dark` | Modals, drawers | `0 12px 24px oklch(0% 0 0 / 60%), inset 0 1px 0 oklch(100% 0 0 / 16%)` |
| `level-1-light` | Cards, buttons | `0 1px 3px oklch(0% 0 0 / 10%), inset 0 1px 0 oklch(100% 0 0 / 50%)` |
| `level-2-light` | Dropdowns, popovers | `0 4px 12px oklch(0% 0 0 / 12%), inset 0 1px 0 oklch(100% 0 0 / 60%)` |

Shadow hues must be tinted toward the background color — never pure black.

---

## Motion

Without tokens, developers invent transitions. Continuum motion must feel snappy and purposeful, not decorative.

### Motion Tokens

| Token | Value | Usage |
|---|---|---|
| `duration-fast` | 50ms | Hover color changes, focus rings |
| `duration-normal` | 150ms | Modals, drawers, panel entrances |
| `duration-slow` | 300ms | Page-level transitions |
| `ease-standard` | `cubic-bezier(0.16, 1, 0.3, 1)` | Micro-interactions, hover states (expo-out) |
| `ease-entrance` | `cubic-bezier(0, 0, 0.2, 1)` | Elements entering the screen |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving the screen |

> `ease-standard` uses expo-out easing for natural deceleration in hover micro-interactions. `ease-entrance` uses material's decelerate curve for element entrances. Never use bounce or elastic easing.

### Reduced Motion

All motion must respect `prefers-reduced-motion`. Implementation rules:
- Wrap all transitions in `motion-safe:transition-[property]` Tailwind utilities
- When reduced motion is active: collapse all durations to `duration-fast` (150ms) or instant
- Disable all transform-based entrance animations (`translate-y`, `scale`, etc.) — preserve opacity-only fades if needed for comprehension
- Never rely on animation to convey state — always pair with a color or text change

### Skill Reference — `/animate`

Invoke `/animate` when adding motion to a feature. Full guidance lives in the skill; the rules below are the Continuum-specific layer on top of the motion tokens above. See also the `### Animation rules quick reference` block under Skeleton Loaders for Framer Motion specifics.

- **Animate only `transform` and `opacity`.** These are GPU-accelerated. Animating `width`, `height`, `top`, `left`, or `margin` triggers layout and drops frames — use `transform: scale/translate` instead.
- **Every animation needs a reason.** Feedback, transition, or guidance. Decoration alone is not a reason.
- **Layer model:** (1) Hero moment — one signature animation per surface, (2) Feedback layer — micro-interactions on interactive elements, (3) Transition layer — state changes (show/hide, expand/collapse), (4) Delight layer — used sparingly. One well-orchestrated experience beats scattered animations everywhere.
- **Exit ≈ 75% of entrance.** If a modal enters at `duration-normal` (150ms), it exits faster. Continuum's `ease-exit` token pairs with shorter durations on dismiss.
- **Durations match purpose** (reinforces the tokens above): 50ms for hover/focus, 150ms for state changes, 300ms for layout/page transitions. Anything over 500ms reads as laggy.
- **Stagger reveals at 100–150ms** for page-load choreography. Don't fire every element at once.
- **`prefers-reduced-motion` is non-negotiable** — see Reduced Motion above. Test the surface with the OS toggle on before shipping.

**NEVER**: bounce or elastic easing (`cubic-bezier(0.34, 1.56, ...)`) — feels dated · animate layout properties · durations over 500ms for feedback · animate everything (fatigue) · block interaction during animations · ship motion that isn't tested under `prefers-reduced-motion`.

---

## Z-Index Scale

No magic numbers. All layering must reference this scale.

| Token | Value | Usage |
|---|---|---|
| `base` | 0 | Default document flow |
| `dropdown` | 40 | Popover menus, select dropdowns |
| `sticky` | 50 | Sticky table headers, sidebar nav |
| `modal` | 100 | Modal overlays, drawers |
| `toast` | 200 | Toast notifications, command palette |

---

## Components (Shadcn UI Architecture)

Continuum uses **Shadcn UI** as its foundational component library. Shadcn copies components directly into the repo (`/components/ui/`) — there is no runtime package to install. All component files must be customized to map to the Singularity OKLCH palette, spacing scale, and typography system.

### Component Token Table

| Token | Property | Value |
|---|---|---|
| **button-primary-dark** | backgroundColor | `primary-teal` |
| | textColor | `oklch(14% 0.01 265)` (background-dark — high contrast on teal) |
| | rounded | `md` (8px) |
| | paddingX | `xl` (24px) |
| | paddingY | `sm` (8px) |
| | typography | `body-md` |
| | boxShadow | `level-1-dark` |
| **button-primary-dark-hover** | backgroundColor | `primary-teal-hover` |
| **button-secondary-dark** | backgroundColor | `surface-dark` |
| | textColor | `text-primary-dark` |
| | rounded | `md` (8px) |
| | paddingX | `xl` (24px) |
| | paddingY | `sm` (8px) |
| | hover backgroundColor | `surface-dark-hover` |
| **button-outline-dark** | backgroundColor | `transparent` |
| | textColor | `text-primary-dark` |
| | border | `1px solid surface-dark` |
| | rounded | `md` (8px) |
| | paddingX | `xl` (24px) |
| | paddingY | `sm` (8px) |
| **button-ghost-dark** | backgroundColor | `transparent` |
| | textColor | `text-primary-dark` |
| | hover backgroundColor | `surface-dark` |
| **button-destructive** | backgroundColor | `error` (`oklch(55% 0.2 25)`) |
| | textColor | `oklch(98% 0.005 265)` |
| **card-dark** | backgroundColor | `surface-dark` |
| | textColor | `text-primary-dark` |
| | rounded | `xl` (16px) |
| | padding | `2xl` (32px) |
| | boxShadow | `level-1-dark` |
| **card-light** | backgroundColor | `surface-light` |
| | textColor | `text-primary-light` |
| | rounded | `xl` (16px) |
| | padding | `2xl` (32px) |
| | boxShadow | `level-1-light` |
| **input-base** | backgroundColor | `background-dark` |
| | border | `1px solid text-secondary-dark` (50% opacity) |
| | textColor | `text-primary-dark` |
| | rounded | `sm` (4px) |
| | padding | `md` (12px) |
| **input-focus** | border | `1px solid primary-teal` |
| | outline | `focus-visible:ring-2 ring-primary-teal ring-offset-2 ring-offset-background-dark` |
| **input-error** | border | `1px solid error` |
| | messageColor | `error` |
| **badge-active** | backgroundColor | `primary-teal` |
| | textColor | `oklch(14% 0.01 265)` |
| | rounded | `full` |
| | paddingX | `sm` (8px) |
| | paddingY | `xs` (4px) |
| | typography | `label-sm` |
| **table-header** | textColor | `text-secondary-dark` |
| | typography | `label-sm` |
| | borderBottom | `1px solid surface-dark` |
| **table-row-hover** | backgroundColor | `surface-dark-hover` |
| | transition | `duration-fast ease-standard` |

### Focus States (All Interactive Elements)

Override Shadcn's default focus ring to guarantee WCAG 2.1 compliance:

```
focus-visible:ring-2
focus-visible:ring-primary-teal
focus-visible:ring-offset-2
focus-visible:ring-offset-background-dark
```

For light mode contexts, replace `ring-offset-background-dark` with `ring-offset-background-light`.

---

## Buttons (Detailed)

Buttons use Shadcn's Button primitive. Asymmetric padding is required — a 1:3 ratio of vertical to horizontal (8px top/bottom, 24px left/right).

| Variant | Tailwind classes (dark mode) |
|---|---|
| Primary | `bg-[oklch(65%_0.13_180)] text-[oklch(14%_0.01_265)] hover:bg-[oklch(75%_0.13_180)]` |
| Secondary | `bg-[oklch(20%_0.015_265)] text-[oklch(98%_0.005_265)] hover:bg-[oklch(24%_0.015_265)]` |
| Outline | `border border-[oklch(20%_0.015_265)] text-[oklch(98%_0.005_265)] bg-transparent hover:bg-[oklch(20%_0.015_265)]` |
| Ghost | `bg-transparent text-[oklch(98%_0.005_265)] hover:bg-[oklch(20%_0.015_265)]` |
| Destructive | `bg-[oklch(55%_0.2_25)] text-[oklch(98%_0.005_265)]` |

---

## Data Tables

Data tables are the lifeblood of the Continuum command center. Shadcn's Table component requires heavy customization for extreme data density.

**Table Headers** (`TableHead`): `text-secondary-dark` / `label-sm` (Geist 12px, 500 weight). Headers must remain visually quiet so data stands out. Uppercase is forbidden.

**Table Rows** (`TableRow`): 1px bottom border using `border-surface-dark`. On hover, transition background to `surface-dark-hover` to assist eye tracking across wide screens.

**Data Cells** (`TableCell`):
- Text data: `body-md` (Geist 14px). Left-aligned. Apply `truncate min-w-0` on text-heavy columns.
- Numeric/metric data: `mono-data` (Geist Mono 13px) with `tabular-nums`. **Always right-align.** Never left-align numbers in columns.
- Status/badge cells: center-align.

**Density:**
- Desktop: `py-3 px-4`
- Mobile/compact: `py-2 px-3`

---

## Inputs & Forms

Customizing Shadcn's Form, Input, Select, and Textarea primitives:

- **Base:** `bg-background-dark` sinks the input below the `surface-dark` card. `border border-text-secondary-dark/50` provides a subtle boundary.
- **Focus:** Border shifts to `border-primary-teal` + standard focus ring overlay. Both signals are required — border alone is insufficient for low-vision users.
- **Error:** Border shifts to `border-error`. `FormMessage` renders in `text-error`. Never use color alone — pair with an icon or error label text.
- **Labels** always sit above the input. Helper text is optional but must be in markup when present. Error text appears below the input. Use `gap-2` for input block spacing.
- **Light mode inputs:** Use `bg-background-light border-text-secondary-light/40` with `focus:border-primary-teal`.

---

## Iconography

**Library:** Phosphor Icons (`@phosphor-icons/react`)

Never mix Phosphor and Lucide within the same UI context — pick one and commit. Phosphor's Regular weight (1.5px stroke) aligns precisely with the Singularity aesthetic.

**Style:** Regular weight (1.5px stroke). Mix filled and outlined variants only to denote active vs. inactive states — never for decoration.

**Sizing — lock to three values:**
- `16px` (`w-4 h-4`) — inline text icons, badges
- `20px` (`w-5 h-5`) — button icons, table actions
- `24px` (`w-6 h-6`) — navigation, section headers

Never set `strokeWidth` per-instance. Define it once in a wrapper or theme context.

---

## Shapes & Visual Language

**The Gravitational Metaphor:** The core visual language shifts away from the overused "electron orbiting a nucleus" AI cliché. Continuum's illustrations reference gravitational physics: accretion disks (smooth, continuous rings of data flowing inward), event horizons (a precise boundary between known and unknown state), and gravity wells (data density pulling attention toward high-signal moments).

**Corner Radii:** Buttons and inputs use `md` (8px) for an engineered feel. Cards and panels use `xl` (16px). Never use decorative rounding beyond `xl` on structural containers.

**Edge Treatments:** Borders are 1px only. They feel like thin circuits of energy, not walls. Colored borders wider than 1px on the left or right edge of cards/list items are strictly banned — they are the single most recognizable generic dashboard cliché.

**Forbidden Shapes:** Sharp spikes, aggressive zig-zags, broken or glitchy geometries, and decorative particle/starfield backgrounds.

### Skill Reference — `/brandkit`

Invoke `/brandkit` when generating logo systems, empty-states, illustrations, or identity boards. Ensure generated assets align with the Gravitational Metaphor and strict palette limits:
- **Presentation substrate:** Dark charcoal or deep gravity backgrounds.
- **Negative space:** Sparse visual density with large breathing margins.
- **No sci-fi tropes:** Reject neon grids, floating glowing particles, and generic robot graphics.

### Aesthetic Archetypes — `/industrial-brutalist-ui` and `/minimalist-ui`

While the default visual direction is the slate/teal Continuum Singularity system, specific contexts require alternative visual treatments:
- **`/industrial-brutalist-ui`**: Invoke this when building raw mechanical telemetry panels, log streams, high-density terminal feeds, or classified blueprint-style views. Enforces monospace typography, visible structural grid dividers, ASCII accents, and CRT scanline/phosphor simulations.
- **`/minimalist-ui`**: Invoke this when building long-form documentation pages, system settings panels, reports, or blog elements. Enforces a warm monochrome palette (bone/off-white background), serif display typography, and a flat bento container layout without dropshadows or glowing refractions.

---

## Do's and Don'ts

### Strategic Guardrails

- **Do** restrict the Brand Violet to 10% of screen real estate. It is a spice, not a base.
- **Do** use explicit OKLCH values in Tailwind config. Validate contrast with a WCAG 2.1 tool — L-delta is a useful proxy but not a substitute for proper luminance calculation.
- **Do** use `min-w-0` on flex items in data-dense rows to prevent text from breaking horizontal constraints.
- **Do** define logo clear space relatively: minimum clear space equals 1× the height of the wordmark's "C."
- **Do** right-align all numeric data. Left-align all text data. Never center body text or metrics.
- **Do** use active verbs in UX copy: "Activate," "Connect," "Push to Calendar," "Sync to Meta." Concrete and product-specific beats generic.

### Strict Prohibitions

- **Don't** use neon outer glows to signify active states. Use the defined inset border refraction technique.
- **Don't** use Montserrat for structural UI text. Geist provides superior space-efficiency and technical precision.
- **Don't** use the generic "atomic electron orbiting a nucleus" metaphor. Shift illustration toward gravity wells, accretion disks, and event horizons.
- **Don't** use magic numbers for z-index (`z-99999`, `z-[9000]`). Stick to the defined scale (40, 50, 100, 200).
- **Don't** center-align body text or metric data.
- **Don't** use photography featuring sci-fi aesthetics, cyberpunk themes, glowing neon, or metaphorical robots.
- **Don't** use gradient text fills — `background-clip: text` with gradient backgrounds is banned. Solid colors only.
- **Don't** use `h-screen` for full-height sections. Use `min-h-[100dvh]`.
- **Don't** use "hype" vocabulary: avoid "Magic," "Revolutionizing," or "The AI does everything." AI is a precise assistant to the human operator.

### Skill Reference — `/redesign-existing-projects`

When refactoring, migrating, or visual-upgrading any legacy page or component in this repository, the agent must call upon `/redesign-existing-projects` to run a structural audit before editing:
- **Scan & Diagnose:** List all default fonts (like Inter everywhere), oversaturated accents, generic shadow constructs, and orphaned text blocks before altering layout styles.
- **Functional Preservation:** Ensure the styling modifications upgrade the visual quality of typography and colors without breaking operational Javascript logic or component states.

---

## Skill Strategy — Frontend Design & Implementation

> [!IMPORTANT]
> **Complete Deliverables Enforcement:** Before generating or editing any code files, the agent MUST call upon `/full-output-enforcement` to ensure that full, production-ready, non-truncated deliverables are returned. Generating code blocks with comments like `// TODO`, `// ...`, or `/* rest of code */` is strictly prohibited.

### The Core Stack (Use on Every Feature)

These three skills form a natural pipeline covering design thinking → anti-slop engineering → production code. They should be invoked together on any UI that users will live in.

| Skill | Role | When to invoke |
|---|---|---|
| `/impeccable` | **Strategic anchor.** Defines aesthetic direction, runs the font selection procedure, mandates OKLCH, bans AI tells. Sets the brief. | First — before any design work |
| `/design-taste-frontend` | **Engineering rules.** The dial system (variance/motion/density), specific anti-patterns, Bento 2.0 architecture, Framer Motion specs. | Second — when implementing |
| `/frontend-design` | **Production bridge.** Converts design intent into working code with accessibility, responsive, and motion rules. | Alongside or after design-taste |

Run all three together on: new feature design, component design, any UI that will be "lived in" by users.

---

### The Impeccable Teach — One-Time But Critical

`/impeccable teach` is the most underused skill. It reads the codebase, asks targeted questions, and writes `.impeccable.md` — a persistent design context file that all three core skills read before generating anything. Without it, every design skill produces generic output because it has no brand context.

**Do this once per project, before anything else.** The Singularity design system defined in this document is the source of truth for that context.

---

### Implementation Specialists

Reach for these when coding, not on every feature — only when the specific concern is genuinely complex.

| Skill | Best used for |
|---|---|
| `/shadcn` | Scaffolding and customizing Shadcn primitives to match this design system. Use when adding new components from the registry. |
| `/build-components` | Building new custom UI components from scratch, ensuring compliance with typography, layout, spacing, and accessibility rules. |
| `/tailwind` | Tailwind v4 syntax, config patterns, custom OKLCH values in config, `@layer` patterns. |
| `/next-best-practices` | App Router patterns, RSC vs client component decisions, caching, streaming. Use when building new routes or data-fetching patterns. |
| `/framer-motion-animator` | Layout transitions, gesture-driven interactions, `layoutId` shared element transitions, `AnimatePresence`. Use for complex motion only — not for simple `transition` CSS. |
| `/zustand` | Store architecture, selector patterns, `partialize` for persistence. Use when building or refactoring state. |

---

### Polish & Refinement Loop

These run **after** implementation, not before. Skip them and the output is 80% there.

| Skill | What it does |
|---|---|
| `/polish` | Micro-refinements — spacing inconsistencies, shadow depth, hover state feel, typographic rhythm. The last 20% that separates good from great. |
| `/delight` | Adds the "oh nice" moments — micro-interactions, empty states that teach, subtle motion that rewards attention. |
| `/critique` | Adversarial review of your own work. Call it when something feels off but you can't name why. |
| `/audit` | Structured accessibility and quality pass. Run before shipping. |

**Correct order:** implement → `/polish` → `/delight` → `/critique` → ship.

---

### Specialized Skills

High ROI in specific contexts; wasteful or redundant outside them.

| Skill | When it pays off |
|---|---|
| `/typeset` | Building or auditing a type scale. Useful once per design system, then rarely again. |
| `/colorize` | OKLCH palette construction, accessibility validation. Use when redesigning the palette. |
| `/layout` | Complex layout problems — masonry, asymmetric grids, container query patterns. Not for standard layouts. |
| `/animate` | CSS-only animation (`@keyframes`, transitions). Use instead of Framer Motion when the motion is simple. |
| `/css-animations` | Advanced CSS animation — `animation-timeline`, scroll-driven animations. |
| `/redesign-existing-projects` | Full visual redesign of an existing component or page. Exploration + design + implementation in one pass. |
| `/audit-website` | Run before touching an existing page — surfaces what's broken before new debt is added. |
| `/impeccable extract` | Pulls a design pattern from an existing component into reusable form. Useful during refactor phases. |
| `/brandkit` | Generating high-end brand presentation boards, logo systems, or illustrations matching Singularity constraints. |
| `/industrial-brutalist-ui` | Building raw mechanical telemetry grids, monospace terminal feeds, or Swiss typographic structures. |
| `/minimalist-ui` | Designing warm monochrome bento layouts, documentation, or editorial report views. |

---

### Skills to Use Sparingly

| Skill | Why |
|---|---|
| `/three` / `/react-three-fiber` | Only when the design genuinely calls for 3D canvas. Usually overkill. |
| `/stitch-design-taste` | Generates Stitch-compatible design representations of screens/pages. Useful only when translating Singularity layouts to Google Stitch agent prompts. |
| `/high-end-visual-design` | Marketing and brand design — wrong tool for product dashboards. |

---

### Recommended Sequence for This Project

Given the stack (Next.js App Router, Tailwind CSS 4, Shadcn, Geist, Framer Motion) and the Singularity palette:

```
Design phase:    /impeccable → /design-taste-frontend → /frontend-design
Build phase:     /build-components or /shadcn (new component) + /next-best-practices (new route)
Motion:          /animate (simple) or /framer-motion-animator (complex orchestration)
Polish:          /polish → /delight
Audit:           /critique or /audit
```

`/frontend-design` is most valuable as connective tissue between design-taste and implementation — invoke it when translating a design decision into a specific code pattern (e.g., how to implement the Liquid Glass elevation token as a Tailwind utility).

> **Rule of thumb:** Use design skills when deciding what to build. Use implementation skills when building it. Use polish skills when it's almost done. Invoking implementation skills before the design direction is locked means refactoring twice.

---

## Tailwind v4 OKLCH Wiring

### How `@theme` works in Tailwind v4

Tailwind v4 replaces `tailwind.config.ts` color customization entirely with the `@theme {}` CSS at-rule. There is no JavaScript config for colors. Every variable inside `@theme` is:
1. Emitted as a real CSS custom property on `:root`
2. Used to generate every color utility for that token (`bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`, `shadow-*`, etc.)

Color tokens must use the `--color-` prefix namespace. The part after `--color-` becomes the utility class name.

```css
@theme {
  --color-primary-teal:    oklch(65% 0.13 180);
  --color-background-dark: oklch(14% 0.01 265);
  --color-surface-dark:    oklch(20% 0.015 265);
}
/* Generates: bg-primary-teal, text-primary-teal, border-primary-teal, ring-primary-teal... */
```

### `@theme` vs `@theme inline` — critical distinction

| Declaration | Emits to `:root`? | Generates utilities? | When to use |
|---|---|---|---|
| `@theme { --color-X: value }` | Yes (static value) | Yes | Fixed values that never switch between light/dark |
| `@theme inline { --color-X: var(--Y) }` | Yes (the var reference) | Yes (resolves at runtime via CSS cascade) | Theme-switching tokens — values differ between `:root` and `.dark` |
| `:root { --Y: value }` | Yes | No | Raw CSS custom properties (source layer for theme switching) |

**The three-layer chain (recommended for Continuum):**

```
Layer 1: :root / .dark { --cs-primary: oklch(...) }   → source of truth, switches with theme
Layer 2: :root { --primary: var(--cs-primary) }        → Shadcn semantic names, cascade-based
Layer 3: @theme inline { --color-primary: var(--primary) } → Tailwind utility generation
```

This lets `bg-primary` automatically switch its OKLCH value when `.dark` is on the `<html>` element, with no `dark:` modifier needed on semantic tokens.

### Dark mode strategy

```css
@import "tailwindcss";

/* Class-based dark mode — .dark on <html> triggers dark: utilities */
@custom-variant dark (&:where(.dark, .dark *));
```

> Use `:where()` (zero specificity) over `:is()` (higher specificity) for easier override. Shadcn's own docs use `:is(.dark *)` — either works, but `:where` causes fewer specificity conflicts.

### Wiping the default Tailwind palette

To enforce Continuum Singularity tokens exclusively and prevent accidental use of `bg-red-500`:

```css
@theme {
  --color-*: initial;   /* wipes all default Tailwind colors */

  /* Now only define your brand tokens */
  --color-primary-teal: oklch(65% 0.13 180);
  /* ... etc */
}
```

### Complete `globals.css`

```css
/* src/app/globals.css */

@import "tailwindcss";

/* ── 1. Dark mode strategy ───────────────────────────────────────────────── */
@custom-variant dark (&:where(.dark, .dark *));

/* ── 2. Continuum Singularity brand vars (source of truth) ───────────────── */
:root {
  --radius: 0.5rem;

  /* Brand */
  --cs-teal:             oklch(65% 0.13 180);
  --cs-teal-fg:          oklch(14% 0.01 265);
  --cs-violet:           oklch(52% 0.22 275);
  --cs-magenta:          oklch(65% 0.25 320);

  /* Light mode surfaces */
  --cs-bg:               oklch(99% 0.002 265);
  --cs-fg:               oklch(20% 0.015 265);
  --cs-card:             oklch(96% 0.005 265);
  --cs-card-fg:          oklch(20% 0.015 265);
  --cs-surface:          oklch(96% 0.005 265);
  --cs-surface-hover:    oklch(92% 0.008 265);
  --cs-muted:            oklch(94% 0.005 265);
  --cs-muted-fg:         oklch(45% 0.015 265);
  --cs-border:           oklch(88% 0.008 265);
  --cs-input:            oklch(88% 0.008 265);
  --cs-ring:             oklch(65% 0.13 180);

  /* Feedback */
  --cs-success:          oklch(68% 0.11 150);
  --cs-warning:          oklch(78% 0.17 80);
  --cs-error:            oklch(55% 0.2 25);
  --cs-error-fg:         oklch(98% 0.005 265);

  /* Data viz */
  --cs-chart-1:          oklch(65% 0.13 180);
  --cs-chart-2:          oklch(70% 0.15 220);
  --cs-chart-3:          oklch(55% 0.18 100);
  --cs-chart-4:          oklch(60% 0.20 30);
}

.dark {
  --cs-teal:             oklch(70% 0.14 182);
  --cs-teal-fg:          oklch(10% 0.01 182);

  /* Dark mode surfaces */
  --cs-bg:               oklch(14% 0.01 265);
  --cs-fg:               oklch(98% 0.005 265);
  --cs-card:             oklch(20% 0.015 265);
  --cs-card-fg:          oklch(98% 0.005 265);
  --cs-surface:          oklch(20% 0.015 265);
  --cs-surface-hover:    oklch(24% 0.015 265);
  --cs-muted:            oklch(24% 0.015 265);
  --cs-muted-fg:         oklch(75% 0.015 265);
  --cs-border:           oklch(100% 0 0 / 10%);
  --cs-input:            oklch(100% 0 0 / 15%);
  --cs-ring:             oklch(70% 0.14 182);

  --cs-success:          oklch(72% 0.16 145);
  --cs-warning:          oklch(80% 0.16 85);
  --cs-error:            oklch(65% 0.20 25);
  --cs-error-fg:         oklch(98% 0.005 265);

  --cs-chart-1:          oklch(70% 0.14 182);
  --cs-chart-2:          oklch(60% 0.15 220);
  --cs-chart-3:          oklch(55% 0.18 100);
  --cs-chart-4:          oklch(65% 0.20 30);
}

/* ── 3. Shadcn semantic aliases (cascade-based switching) ─────────────────── */
:root {
  --background:          var(--cs-bg);
  --foreground:          var(--cs-fg);
  --card:                var(--cs-card);
  --card-foreground:     var(--cs-card-fg);
  --popover:             var(--cs-card);
  --popover-foreground:  var(--cs-card-fg);
  --primary:             var(--cs-teal);
  --primary-foreground:  var(--cs-teal-fg);
  --secondary:           var(--cs-surface-hover);
  --secondary-foreground: var(--cs-fg);
  --muted:               var(--cs-muted);
  --muted-foreground:    var(--cs-muted-fg);
  --accent:              color-mix(in oklch, var(--cs-teal) 15%, var(--cs-muted));
  --accent-foreground:   var(--cs-fg);
  --destructive:         var(--cs-error);
  --destructive-foreground: var(--cs-error-fg);
  --border:              var(--cs-border);
  --input:               var(--cs-input);
  --ring:                var(--cs-ring);
  --success:             var(--cs-success);
  --warning:             var(--cs-warning);

  --chart-1: var(--cs-chart-1);
  --chart-2: var(--cs-chart-2);
  --chart-3: var(--cs-chart-3);
  --chart-4: var(--cs-chart-4);

  --sidebar:                    var(--cs-card);
  --sidebar-foreground:         var(--cs-fg);
  --sidebar-primary:            var(--cs-teal);
  --sidebar-primary-foreground: var(--cs-teal-fg);
  --sidebar-accent:             var(--cs-muted);
  --sidebar-accent-foreground:  var(--cs-fg);
  --sidebar-border:             var(--cs-border);
  --sidebar-ring:               var(--cs-ring);
}

/* ── 4. @theme inline — maps Shadcn vars to Tailwind utilities ───────────── */
@theme inline {
  /* Semantic color utilities (auto-switch with .dark) */
  --color-background:           var(--background);
  --color-foreground:           var(--foreground);
  --color-card:                 var(--card);
  --color-card-foreground:      var(--card-foreground);
  --color-popover:              var(--popover);
  --color-popover-foreground:   var(--popover-foreground);
  --color-primary:              var(--primary);
  --color-primary-foreground:   var(--primary-foreground);
  --color-secondary:            var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted:                var(--muted);
  --color-muted-foreground:     var(--muted-foreground);
  --color-accent:               var(--accent);
  --color-accent-foreground:    var(--accent-foreground);
  --color-destructive:          var(--destructive);
  --color-border:               var(--border);
  --color-input:                var(--input);
  --color-ring:                 var(--ring);
  --color-success:              var(--success);
  --color-warning:              var(--warning);
  --color-chart-1:              var(--chart-1);
  --color-chart-2:              var(--chart-2);
  --color-chart-3:              var(--chart-3);
  --color-chart-4:              var(--chart-4);
  --color-sidebar:              var(--sidebar);
  --color-sidebar-foreground:   var(--sidebar-foreground);
  --color-sidebar-primary:      var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent:       var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border:       var(--sidebar-border);
  --color-sidebar-ring:         var(--sidebar-ring);

  /* Fixed brand tokens (never theme-switch) */
  --color-brand-violet:  oklch(52% 0.22 275);
  --color-brand-magenta: oklch(65% 0.25 320);

  /* Radius scale (derived from --radius root var) */
  --radius-sm:  calc(var(--radius) * 0.6);   /* ~4px  */
  --radius-md:  calc(var(--radius) * 0.8);   /* ~8px  */
  --radius-lg:  var(--radius);               /* ~8px  */
  --radius-xl:  calc(var(--radius) * 1.4);   /* ~12px */
  --radius-2xl: calc(var(--radius) * 1.8);   /* ~16px */
  --radius-3xl: calc(var(--radius) * 2.2);   /* ~20px */

  /* Font stacks (references CSS vars injected by next/font) */
  --font-sans:    var(--font-geist-sans);
  --font-mono:    var(--font-geist-mono);
  --font-display: var(--font-display);
}

/* ── 5. @layer base — HTML element defaults ──────────────────────────────── */
@layer base {
  * {
    @apply border-border;
    box-sizing: border-box;
  }

  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :focus-visible {
    outline: 2px solid var(--cs-ring);
    outline-offset: 2px;
  }
}

/* ── 6. Custom utilities ─────────────────────────────────────────────────── */
@utility font-tabular {
  font-variant-numeric: tabular-nums;
}

@utility font-data {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.8125rem;
}

@utility skeleton-shimmer {
  background-image: linear-gradient(
    105deg,
    oklch(20% 0.015 265)        0%,
    oklch(24% 0.015 265)        40%,
    oklch(28% 0.018 265 / 0.9)  50%,
    oklch(24% 0.015 265)        60%,
    oklch(20% 0.015 265)        100%
  );
  background-size: 200% 100%;
  background-repeat: no-repeat;
  animation: skeleton-shimmer 1.6s linear infinite;
}

@keyframes skeleton-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer {
    animation: none;
    background-image: none;
    background-color: oklch(20% 0.015 265 / 0.7);
  }
}
```

### Arbitrary OKLCH in Tailwind classes

Use underscores for spaces inside bracket notation:

```html
<div class="bg-[oklch(65%_0.13_180)]">...</div>
<div class="bg-[oklch(65%_0.13_180)]/10">...</div>  <!-- 10% opacity -->
<div class="bg-(--cs-teal)">...</div>               <!-- reference a CSS var directly -->
```

### `color-mix()` for opacity tints in custom CSS

```css
/* Subtle tinted background behind an active state */
background-color: color-mix(in oklch, var(--cs-teal) 10%, var(--cs-surface));

/* In @layer utilities as a one-off */
.active-tint {
  background-color: color-mix(in oklch, var(--cs-teal) 12%, transparent);
}
```

Tailwind's slash modifier (`bg-primary/10`) is preferred for utility-first usage. Use `color-mix()` in raw CSS where the slash modifier isn't available.

### `components.json` (Shadcn CLI config)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

`"config": ""` (empty string) signals Tailwind v4 CSS-only configuration — no `tailwind.config.ts` needed.

---

## Font Loading

### Geist Sans and Geist Mono

Both are variable fonts available via `next/font/google`. No `weight` array needed — the variable font covers the full axis automatically.

```ts
// src/app/fonts.ts
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

export const geistSans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-sans",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

// Commercial display font — 700 weight only
// File lives at: src/app/fonts/FuturaMaxi-Bold.woff2
// Path is relative to THIS file
export const futuraMaxi = localFont({
  src: "./fonts/FuturaMaxi-Bold.woff2",
  weight: "700",
  style: "normal",
  display: "swap",
  preload: true,
  variable: "--font-display",
  fallback: ["system-ui", "Arial", "sans-serif"],
  // Generates a metric-matched @font-face fallback to eliminate CLS
  adjustFontFallback: "Arial",
});
```

### `app/layout.tsx`

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { geistSans, geistMono, futuraMaxi } from "./fonts";
import "./globals.css";

export const metadata: Metadata = { title: "Continuum" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // Each .variable injects the CSS custom property onto this element,
      // making --font-geist-sans, --font-geist-mono, --font-display
      // available to every descendant — including :root-scoped CSS in globals.css.
      className={`${geistSans.variable} ${geistMono.variable} ${futuraMaxi.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

### Futura Maxi — commercial font file placement

Do **not** place commercial font files in `/public/fonts/` — that makes them publicly accessible by URL. Place them inside `src/app/fonts/` where they are bundled as static assets but not routable:

```
src/app/
  fonts/
    FuturaMaxi-Bold.woff2
  fonts.ts
  layout.tsx
  globals.css
```

If Futura Maxi ships as a variable font (check your license), declare the weight axis range:

```ts
export const futuraMaxi = localFont({
  src: "./fonts/FuturaMaxi-Variable.woff2",
  weight: "100 900",  // full axis range
  style: "normal",
  display: "swap",
  preload: true,
  variable: "--font-display",
  fallback: ["system-ui", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});
```

### Tabular numbers

`font-variant-numeric: tabular-nums` is the modern CSS property (equivalent to `font-feature-settings: "tnum" 1`). Tailwind v4 ships this as a first-class utility:

```html
<td class="font-mono tabular-nums text-right">$1,234,567.89</td>
```

The custom `font-data` utility registered in `globals.css` composes both:

```html
<td class="font-data text-right">$1,234,567.89</td>
```

### Preloading behavior

Fonts in the root layout are preloaded on every route. This is correct for Geist (body font, needed everywhere) and Futura Maxi (hero sections may appear anywhere). If Futura Maxi is only used on a single marketing page, move the `localFont` call to that page's layout with `preload: false` to avoid preloading it on the 95% of routes that don't use it.

---

## Skeleton Loaders & Animation Guidelines

### The Shadcn Skeleton primitive

The Skeleton component at `src/components/ui/skeleton.tsx` is a minimal wrapper:

```tsx
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.ComponentProps<"div"> {
  variant?: "pulse" | "shimmer";
}

function Skeleton({ className, variant = "pulse", ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md",
        variant === "pulse" && "bg-muted/70 animate-pulse",
        variant === "shimmer" && "skeleton-shimmer",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
```

**Pulse** (`animate-pulse`): opacity breathes 1→0.5→1 over 2 seconds. Lighter on CPU. Best for small grids of similar-sized elements.

**Shimmer**: a bright diagonal gradient sweeps left to right over the surface. More visually informative on long tables — the directional motion signals "loading in progress." The `skeleton-shimmer` utility is registered in `globals.css` above.

### When to use which

| Context | Use |
|---|---|
| Small metric widget grid | `pulse` |
| Long data tables (10+ rows) | `shimmer` |
| Chart / graph placeholder | `shimmer` |
| `prefers-reduced-motion` active | Neither — static `bg-muted/70` only |

### Composite skeleton components

**Table row skeleton** — mirrors column widths of the actual table:

```tsx
// src/components/ui/skeletons/TableRowSkeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function TableRowSkeleton({ rowCount = 5, className }: { rowCount?: number; className?: string }) {
  return (
    <div className={cn("rounded-lg border overflow-hidden", className)}>
      <div className="flex items-center gap-4 px-4 py-2.5 border-b bg-muted/30">
        <Skeleton className="h-3 w-6" />
        <Skeleton className="h-3 flex-1" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      {Array.from({ length: rowCount }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
          <Skeleton className="h-3.5 w-6 shrink-0" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <Skeleton className="h-3.5 w-20 shrink-0" />
          <Skeleton className="h-3.5 w-20 shrink-0" />
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}
```

**Metric widget skeleton** — big number + label grid:

```tsx
// src/components/ui/skeletons/MetricWidgetSkeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function MetricWidgetSkeleton({ count = 6, columns = 3, className }: {
  count?: number; columns?: 2 | 3 | 4; className?: string;
}) {
  const grid = { 2: "grid-cols-2", 3: "grid-cols-2 sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <div className={cn("grid gap-2", grid, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md border bg-card/60 p-3 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}
```

**Chart skeleton** — shimmer on a tall block with axis stubs:

```tsx
// src/components/ui/skeletons/ChartSkeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ChartSkeleton({ height = "h-48", showAxes = true, className }: {
  height?: string; showAxes?: boolean; className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        {showAxes && (
          <div className="flex flex-col justify-between py-1 shrink-0 w-8">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-2.5 w-7" />)}
          </div>
        )}
        <Skeleton variant="shimmer" className={cn("flex-1 rounded-md", height)} />
      </div>
      {showAxes && (
        <div className="flex justify-between pl-10 pr-1">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-2.5 w-8" />)}
        </div>
      )}
    </div>
  );
}
```

### Framer Motion: skeleton → content transitions

**Core easing mapped from the design system:**

```ts
// src/lib/animation/variants.ts
import type { Variants, Transition } from "motion/react";

export const entranceTransition: Transition = {
  duration: 0.25,                  // duration-normal
  ease: [0, 0, 0.2, 1],           // ease-entrance
};

export const exitTransition: Transition = {
  duration: 0.15,                  // duration-fast
  ease: [0.4, 0, 1, 1],           // ease-exit
};

export const contentReveal: Variants = {
  hidden:  { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: entranceTransition },
  exit:    { opacity: 0, transition: exitTransition },
};

export const skeletonExit: Variants = {
  hidden:  { opacity: 1 },
  visible: { opacity: 1 },
  exit:    { opacity: 0, transition: exitTransition },
};

// Stagger container for list reveals
export const staggerContainer: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
  exit:    { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
};

export const staggerItem: Variants = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0, 0, 0.2, 1] } },
  exit:    { opacity: 0, transition: { duration: 0.12 } },
};
```

**`AnimatePresence` skeleton → content swap:**

```tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "motion/react";
import { contentReveal, skeletonExit } from "@/lib/animation/variants";
import { MetricWidgetSkeleton } from "@/components/ui/skeletons/MetricWidgetSkeleton";

export function AnimatedMetricPanel({ isLoading, children }: {
  isLoading: boolean; children: React.ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();

  // Reduced motion: render directly without animation
  if (shouldReduceMotion) {
    return isLoading ? <MetricWidgetSkeleton count={6} /> : <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div key="skeleton" variants={skeletonExit} initial="hidden" animate="visible" exit="exit">
          <MetricWidgetSkeleton count={6} />
        </motion.div>
      ) : (
        <motion.div key="content" variants={contentReveal} initial="hidden" animate="visible" exit="exit">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**`AnimatePresence` mode rules:**

| Mode | Behavior | Use for |
|---|---|---|
| `"wait"` | Skeleton fully exits before content enters | Metric widgets, fixed-slot content |
| `"sync"` | Both animate simultaneously | Full-page reveals, side-by-side |
| `"popLayout"` | Exiting element removed from layout flow | List reorders |

### `useReducedMotion` — global provider pattern

Rather than checking `useReducedMotion` in every component, wrap the post-auth shell:

```tsx
// src/components/providers/MotionProvider.tsx
"use client";

import { createContext, useContext } from "react";
import { useReducedMotion } from "motion/react";
import type { Transition, Variants } from "motion/react";

interface MotionConfig {
  shouldReduceMotion: boolean;
  entrance: Variants;
  stagger: Variants;
  staggerItem: Variants;
}

const MotionContext = createContext<MotionConfig | null>(null);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion();
  const t: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.25, ease: [0, 0, 0.2, 1] };

  const value: MotionConfig = {
    shouldReduceMotion,
    entrance: {
      hidden:  shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 },
      visible: { opacity: 1, y: 0, transition: t },
      exit:    { opacity: 0, transition: { duration: 0.15 } },
    },
    stagger: {
      hidden:  {},
      visible: { transition: shouldReduceMotion ? {} : { staggerChildren: 0.04, delayChildren: 0.05 } },
      exit:    {},
    },
    staggerItem: {
      hidden:  shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 },
      visible: { opacity: 1, y: 0, transition: t },
      exit:    { opacity: 0, transition: { duration: 0.12 } },
    },
  };

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion(): MotionConfig {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error("useMotion must be used inside MotionProvider");
  return ctx;
}
```

Mount inside the post-auth layout:

```tsx
// src/app/(post-auth)/layout.tsx
import { MotionProvider } from "@/components/providers/MotionProvider";

export default function PostAuthLayout({ children }) {
  return <MotionProvider>{children}</MotionProvider>;
}
```

### Animation rules quick reference

| Situation | Duration | Easing |
|---|---|---|
| Entrance (fade + slide up) | 250ms | `cubic-bezier(0, 0, 0.2, 1)` |
| Exit (fade) | 150ms | `cubic-bezier(0.4, 0, 1, 1)` |
| Hover color transition | 120ms | `ease` |
| Stagger between items | 40ms | — |
| Skeleton pulse | 2000ms | `cubic-bezier(0.4, 0, 0.6, 1)` |
| Skeleton shimmer | 1600ms | `linear` |
| Tab / panel switch | 200ms | `cubic-bezier(0, 0, 0.2, 1)` |

**Forbidden:** bounce easing, spring with `bounce > 0`, elastic curves, infinite decorative animations on data components, outer glow animations, animating `width`/`height`/`padding` (triggers layout — use `transform` and `opacity` only).

**Performance rules:**
- GPU acceleration for `opacity` and `transform` is automatic in Framer Motion. Do not add `will-change: transform` unless profiling confirms it is needed.
- Never animate more than ~20 elements simultaneously. For long lists, skip animation on items beyond the first viewport batch.
- Isolate all Framer Motion usage in Client Components (`"use client"`).

### `loading.tsx` in App Router

`loading.tsx` wraps `page.tsx` in a `<Suspense>` boundary automatically. Place it alongside the page:

```
src/app/(post-auth)/organic/
  loading.tsx   ← shows immediately on navigation
  page.tsx      ← async RSC, data fetching
```

```tsx
// src/app/(post-auth)/organic/loading.tsx
import { MetricWidgetSkeleton } from "@/components/ui/skeletons/MetricWidgetSkeleton";
import { ChartSkeleton } from "@/components/ui/skeletons/ChartSkeleton";

export default function OrganicLoading() {
  return (
    <div className="p-4 space-y-4">
      <MetricWidgetSkeleton count={6} columns={3} />
      <ChartSkeleton height="h-56" />
    </div>
  );
}
```

For granular streaming within a page, wrap individual slow RSCs in `<Suspense>` directly:

```tsx
// page.tsx
import { Suspense } from "react";

export default function Page() {
  return (
    <div className="grid xl:grid-cols-[3fr_2fr] gap-4 p-4">
      <Suspense fallback={<ChartSkeleton height="h-56" />}>
        <SlowMetricsWidget />  {/* fetches from Meta API */}
      </Suspense>
      <Suspense fallback={<TableRowSkeleton rowCount={8} />}>
        <FastTrendsPanel />    {/* cached, renders quickly */}
      </Suspense>
    </div>
  );
}
```

### Indeterminate progress bar

For AI generation and long async operations (2–15s with no percentage signal), use a thin bar at the top of the widget — not the viewport:

```tsx
// src/components/ui/IndeterminateProgressBar.tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export function IndeterminateProgressBar({ active, className }: {
  active: boolean; className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="bar"
          className={cn("absolute top-0 inset-x-0 h-0.5 overflow-hidden", className)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          {shouldReduceMotion ? (
            <div className="h-full w-1/2 bg-primary rounded-full" />
          ) : (
            <motion.div
              className="h-full bg-gradient-to-r from-transparent via-primary to-transparent"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
              style={{ width: "60%" }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

---

## Component Coverage

### Global dark-mode baseline for all Shadcn components

This CSS variable block in `globals.css` covers all Shadcn component defaults for dark mode. Components consume these variables directly — no per-component class overrides are needed for the baseline:

```css
/* Already covered in the globals.css section above.
   Key mappings for quick reference: */

--primary:             oklch(65% 0.13 180)  /* primary-teal — buttons, rings, active states */
--primary-foreground:  oklch(14% 0.01 265)  /* dark text on teal */
--card:                oklch(20% 0.015 265) /* surface-dark — card backgrounds */
--muted:               oklch(24% 0.015 265) /* surface-dark-hover — muted backgrounds */
--muted-foreground:    oklch(75% 0.015 265) /* text-secondary-dark */
--border:              oklch(100% 0 0 / 10%)/* subtle white border in dark mode */
--ring:                oklch(70% 0.14 182)  /* teal focus ring */
--destructive:         oklch(55% 0.2 25)    /* error */
```

---

### Navigation Menu

```bash
pnpm dlx shadcn@latest add navigation-menu
```

**Anatomy:** `NavigationMenu` → `NavigationMenuList` → `NavigationMenuItem` → `NavigationMenuTrigger` / `NavigationMenuLink` / `NavigationMenuContent`

**Accessibility:** Renders as `<nav>`. `NavigationMenuLink` sets `aria-current="page"` when `active`. Keyboard: Arrow keys move between items; Esc closes submenus.

**Design system rules:**
- Nav bar height: `h-14`
- Active link: `border-b-2 border-primary text-primary`
- Inactive link: `text-muted-foreground hover:text-foreground hover:bg-muted`
- Submenu panel: `bg-card border border-border rounded-lg shadow-lg`
- Typography: `text-sm font-medium`
- Mobile: replace with a `Sheet` component triggered by a hamburger button — `NavigationMenu` has no built-in mobile collapse

```tsx
// Underline-style active indicator
<NavigationMenuLink
  active={isActive}
  className={cn(
    "h-14 rounded-none border-b-2 text-sm font-medium px-4 transition-colors",
    isActive
      ? "border-primary text-primary"
      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
  )}
>
  {label}
</NavigationMenuLink>
```

---

### Dialog

```bash
pnpm dlx shadcn@latest add dialog
```

**Anatomy:** `Dialog` → `DialogTrigger` → `DialogPortal` → `DialogOverlay` + `DialogContent` → `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter`

**Accessibility:** `role="dialog"`, `aria-modal="true"`. `DialogTitle` is required (sets `aria-labelledby`). Focus traps inside on open; Esc closes and returns focus to trigger. Scroll lock on background.

**Design system rules:**
- Overlay: `bg-black/60 backdrop-blur-sm`
- Panel: `bg-card border border-border rounded-xl shadow-[0_24px_48px_oklch(0%_0_0_/_.6)]` (elevation level-3)
- Max widths: `max-w-lg` (forms/confirmations), `max-w-2xl` (settings panels)
- Padding: `p-6`
- Title: `text-base font-semibold text-foreground`
- Description: `text-sm text-muted-foreground`
- Animation: scale + fade on desktop; slide from bottom on mobile

```tsx
<DialogContent className="bg-card border-border rounded-xl shadow-[0_24px_48px_oklch(0%_0_0_/_.6)] max-w-lg
  data-[state=open]:animate-in data-[state=closed]:animate-out
  data-[state=open]:sm:fade-in-0 data-[state=open]:sm:zoom-in-95
  data-[state=open]:max-sm:slide-in-from-bottom-4
  data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
  <DialogHeader>
    <DialogTitle>Create Campaign</DialogTitle>
    <DialogDescription>Configure your campaign settings.</DialogDescription>
  </DialogHeader>
  {/* content */}
  <DialogFooter>
    <Button variant="ghost">Cancel</Button>
    <Button>Create</Button>
  </DialogFooter>
</DialogContent>
```

---

### Drawer (Vaul)

```bash
pnpm dlx shadcn@latest add drawer
```

**Anatomy:** `Drawer` → `DrawerTrigger` → `DrawerPortal` → `DrawerOverlay` + `DrawerContent` → `DrawerHeader` / `DrawerTitle` / `DrawerDescription` / `DrawerFooter` / `DrawerClose`

**Drawer vs Dialog vs Sheet:**

| | Dialog | Sheet | Drawer |
|---|---|---|---|
| Primitive | Radix | Radix | Vaul |
| Motion | Fade/scale | Slide from edge | Physics drag |
| Drag-to-dismiss | No | No | Yes |
| Snap points | No | No | Yes |
| Best for | Confirmations | Persistent panels | Mobile-first, bottom sheets |

**Key `Drawer.Root` props:** `direction` (`"bottom"` / `"right"`), `snapPoints`, `dismissible`, `modal`, `handleOnly`, `repositionInputs` (prevents iOS keyboard from hiding inputs — default `true`)

**Design system rules:**
- Desktop: `direction="right"`, `w-[400px]`, `border-l border-border`
- Mobile: `direction="bottom"`, `rounded-t-xl`, drag handle pill
- Background: `bg-card`
- Overlay: `bg-black/50` (lighter than Dialog — less blocking)

```tsx
<Drawer direction={isDesktop ? "right" : "bottom"} modal>
  <DrawerContent className={cn(
    "bg-card",
    isDesktop
      ? "fixed inset-y-0 right-0 h-full w-[400px] rounded-none rounded-l-xl border-l border-border"
      : "rounded-t-xl border-t border-border",
  )}>
    {!isDesktop && (
      <div className="mx-auto mt-3 h-1 w-8 rounded-full bg-border" />
    )}
    <DrawerHeader>
      <DrawerTitle>Filter Campaigns</DrawerTitle>
    </DrawerHeader>
    <div className="flex-1 overflow-y-auto px-4 py-2">{/* filters */}</div>
    <DrawerFooter className="border-t border-border pt-4">
      <Button>Apply</Button>
      <DrawerClose asChild><Button variant="ghost">Clear</Button></DrawerClose>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

---

### Tabs

```bash
pnpm dlx shadcn@latest add tabs
```

**Anatomy:** `Tabs` → `TabsList` → `TabsTrigger` ×n + `TabsContent` ×n

**Accessibility:** `TabsList` → `role="tablist"`. `TabsTrigger` → `role="tab"`, `aria-selected`, `aria-controls`. Keyboard: Arrow Left/Right to move + activate (automatic mode). Use `activationMode="manual"` when tab content loads async — prevents triggering fetches on hover/focus.

**Design system rules — underline variant (preferred for dashboard):**
- `TabsList`: `h-10 bg-transparent border-b border-border rounded-none p-0`
- `TabsTrigger`: `rounded-none border-b-2 border-transparent h-10 px-4 text-sm font-medium text-muted-foreground`
- Active: `data-[state=active]:border-primary data-[state=active]:text-primary`

**Animated active indicator with Framer Motion `layoutId`:**

```tsx
"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "ad-sets",  label: "Ad Sets"  },
  { value: "creatives",label: "Creatives"},
];

export function CampaignTabs() {
  const [active, setActive] = useState("overview");

  return (
    <Tabs value={active} onValueChange={setActive} activationMode="automatic">
      <TabsList className="h-10 w-full bg-transparent border-b border-border rounded-none p-0 gap-0">
        {TABS.map(({ value, label }) => (
          <TabsTrigger
            key={value}
            value={value}
            className="relative rounded-none h-10 px-4 border-b-2 border-transparent text-sm font-medium
              data-[state=active]:border-transparent data-[state=active]:text-primary
              data-[state=inactive]:text-muted-foreground hover:text-foreground"
          >
            {label}
            {active === value && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 inset-x-0 h-0.5 bg-primary"
                transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
              />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {TABS.map(({ value }) => (
        <TabsContent key={value} value={value} className="pt-4">
          {/* panel content */}
        </TabsContent>
      ))}
    </Tabs>
  );
}
```

---

### Select

```bash
pnpm dlx shadcn@latest add select
```

**Anatomy:** `Select` → `SelectTrigger` → `SelectValue` + `SelectContent` → `SelectGroup` → `SelectLabel` + `SelectItem` ×n + `SelectSeparator`

**Accessibility:** `role="combobox"` on trigger, `aria-expanded`, `aria-controls`. Keyboard: Arrow Up/Down navigates items; Enter/Space selects; typed characters jump to matching item; Esc closes.

**Design system rules:**
- Trigger: `bg-background border-border text-foreground h-9 text-sm`
- Content: `bg-card border-border rounded-lg shadow-lg` (elevation level-2)
- Item: `text-sm text-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground`
- Max height: `max-h-60 overflow-y-auto` (prevent content exceeding viewport)
- Focus ring: `focus:ring-2 focus:ring-primary`

```tsx
<Select>
  <SelectTrigger className="w-48 bg-background border-border text-sm h-9">
    <SelectValue placeholder="Select platform" />
  </SelectTrigger>
  <SelectContent className="bg-card border-border rounded-lg shadow-lg">
    <SelectGroup>
      <SelectLabel className="text-xs font-medium text-muted-foreground px-2 py-1.5">
        Platform
      </SelectLabel>
      <SelectItem value="meta" className="text-sm cursor-pointer">Meta</SelectItem>
      <SelectItem value="google" className="text-sm cursor-pointer">Google</SelectItem>
      <SelectItem value="tiktok" className="text-sm cursor-pointer">TikTok</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

---

### Popover

```bash
pnpm dlx shadcn@latest add popover
```

**Anatomy:** `Popover` → `PopoverTrigger` + `PopoverContent`

**Key props on `PopoverContent`:** `side` (`"top"` / `"right"` / `"bottom"` / `"left"`), `align` (`"start"` / `"center"` / `"end"`), `sideOffset` (gap in px), `avoidCollisions` (default `true` — repositions when near viewport edge)

**Design system rules:**
- Background: `bg-card border-border rounded-lg`
- Shadow: elevation level-2
- Padding: `p-4`
- Max width: `w-72` for info overlays; `w-80` for date pickers and complex controls
- Use `sideOffset={8}` consistently for visual breathing room

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm">Date Range</Button>
  </PopoverTrigger>
  <PopoverContent
    className="w-80 bg-card border-border rounded-lg shadow-lg p-4"
    sideOffset={8}
    align="start"
  >
    {/* DatePicker or filter controls */}
  </PopoverContent>
</Popover>
```

---

### Checkbox

```bash
pnpm dlx shadcn@latest add checkbox
```

**Accessibility:** `role="checkbox"`. Three states: unchecked, checked, indeterminate. Keyboard: Space toggles. Group checkboxes with `<fieldset>` + `<legend>`.

**Design system rules:**
- Unchecked: `border-border bg-background`
- Checked: `bg-primary border-primary text-primary-foreground` (dark text on teal background)
- Indeterminate: `bg-primary/30 border-primary` — for partial table row selection
- Size: 16×16px (`h-4 w-4`), radius `rounded-sm`
- Label: `text-sm text-foreground` with `gap-2` between box and label

**Bulk-selection pattern:**

```tsx
"use client";

import { Checkbox } from "@/components/ui/checkbox";

export function BulkSelectHeader({ rows, selected, onToggleAll }: {
  rows: string[]; selected: Set<string>; onToggleAll: () => void;
}) {
  const allSelected = selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <Checkbox
      checked={allSelected ? true : someSelected ? "indeterminate" : false}
      onCheckedChange={onToggleAll}
      aria-label="Select all rows"
      className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
    />
  );
}
```

---

### Switch

```bash
pnpm dlx shadcn@latest add switch
```

**Accessibility:** `role="switch"`, `aria-checked`. Keyboard: Space toggles. Always pair with a visible label.

**Design system rules:**
- Track unchecked: `bg-muted`
- Track checked: `bg-primary`
- Thumb: `bg-background` (white on teal track)
- Size: default `h-5 w-9`; use `data-[state=checked]:bg-primary` to override Shadcn's default blue

```tsx
<div className="flex items-center gap-3">
  <Switch
    id="campaign-active"
    className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted"
  />
  <Label htmlFor="campaign-active" className="text-sm text-foreground cursor-pointer">
    Campaign active
  </Label>
</div>
```

---

### Toast (Sonner)

```bash
pnpm dlx shadcn@latest add sonner
```

Shadcn recommends Sonner over its older `Toast` primitive. Sonner manages its own portal and queue.

**Setup** — add `<Toaster>` to the root layout (once):

```tsx
// src/app/layout.tsx
import { Toaster } from "@/components/ui/sonner";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast:       "bg-card border-border text-foreground shadow-lg rounded-lg text-sm",
              title:       "font-medium",
              description: "text-muted-foreground",
              success:     "border-success/20",
              error:       "border-destructive/20",
            },
          }}
          richColors
          closeButton
        />
      </body>
    </html>
  );
}
```

**Usage** — call `toast()` from any Client Component:

```tsx
import { toast } from "sonner";

// Success
toast.success("Campaign saved", { description: "Changes synced to Meta." });

// Error
toast.error("Sync failed", { description: "Check your Meta credentials." });

// Loading → success (optimistic pattern)
const id = toast.loading("Publishing campaign...");
await publishCampaign();
toast.success("Campaign live", { id });

// Custom duration
toast("Draft created", { duration: 3000 });
```

**Design system rules:**
- Position: `bottom-right` (non-blocking for data-dense dashboards)
- Auto-dismiss: 4000ms default (Sonner), use 6000ms for error toasts
- Never use toasts for critical destructive confirmations — use a Dialog
- Max 3 toasts visible simultaneously (Sonner's default queue handles this)

---

### Tooltip

```bash
pnpm dlx shadcn@latest add tooltip
```

**Anatomy:** `TooltipProvider` (global, in root layout) → `Tooltip` → `TooltipTrigger` + `TooltipContent`

**Setup** — `<TooltipProvider>` must wrap the application:

```tsx
// src/app/(post-auth)/layout.tsx
import { TooltipProvider } from "@/components/ui/tooltip";

export default function PostAuthLayout({ children }) {
  return <TooltipProvider delayDuration={300}>{children}</TooltipProvider>;
}
```

**Accessibility:** `role="tooltip"`, `aria-describedby` on the trigger. Keyboard: appears on focus. Never place interactive content inside a tooltip — use a Popover instead.

**Design system rules:**
- Background: `bg-card border border-border text-foreground text-xs`
- Max width: `max-w-56` — tooltips should be single-line or max two lines
- Padding: `px-2 py-1`
- Delay: `300ms` — enough to prevent accidental triggers on fast cursor movement
- Avoid tooltips on mobile — content is inaccessible on touch-only devices; use a `?` icon + Popover instead

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button
      aria-label="ROAS definition"
      className="text-muted-foreground hover:text-foreground"
    >
      <Info className="h-3.5 w-3.5" />
    </button>
  </TooltipTrigger>
  <TooltipContent
    side="top"
    className="bg-card border border-border text-foreground text-xs px-2 py-1 max-w-56"
  >
    Return on Ad Spend — revenue generated per dollar of ad spend.
  </TooltipContent>
</Tooltip>
```

---

### Command (Command Palette)

```bash
pnpm dlx shadcn@latest add command
```

**Anatomy:** `Command` → `CommandInput` + `CommandList` → `CommandEmpty` + `CommandGroup` → `CommandItem` ×n + `CommandSeparator`

**Keyboard trigger** — wire `⌘K` / `Ctrl+K` to open a Dialog containing the Command:

```tsx
// src/components/CommandPalette.tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 bg-card border-border rounded-xl shadow-[0_24px_48px_oklch(0%_0_0_/_.6)] max-w-lg">
        <Command className="bg-transparent">
          <CommandInput
            placeholder="Search campaigns, pages, actions..."
            className="border-b border-border h-12 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <CommandList className="max-h-80 overflow-y-auto p-2">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </CommandEmpty>
            <CommandGroup heading="Campaigns" className="text-xs font-medium text-muted-foreground px-2 py-1.5">
              <CommandItem
                className="flex items-center gap-2 px-2 py-2 rounded-md text-sm text-foreground
                  data-[selected]:bg-muted data-[selected]:text-foreground cursor-pointer"
                onSelect={() => { setOpen(false); /* navigate */ }}
              >
                Q3 Brand Awareness
              </CommandItem>
            </CommandGroup>
            <CommandSeparator className="bg-border my-1" />
            <CommandGroup heading="Navigation">
              <CommandItem onSelect={() => setOpen(false)}>
                Go to Dashboard
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
```

**Design system rules:**
- Open via `⌘K` / `Ctrl+K` — render a keyboard shortcut hint in the nav
- Dialog max-width: `max-w-lg`; list max-height: `max-h-80` with scroll
- Group headings: `label-sm` (12px, 500 weight, `text-muted-foreground`)
- Selected item: `bg-muted` background
- Empty state: centered, helpful, links to documentation or suggests alternatives

---

### Sheet

```bash
pnpm dlx shadcn@latest add sheet
```

**Anatomy:** `Sheet` → `SheetTrigger` + `SheetContent` (with `side` prop) → `SheetHeader` / `SheetTitle` / `SheetDescription` / `SheetFooter` / `SheetClose`

**Sheet vs Drawer vs Dialog:**

| | Sheet | Drawer (Vaul) | Dialog |
|---|---|---|---|
| Primitive | Radix Dialog | Vaul | Radix Dialog |
| Drag-to-dismiss | No | Yes | No |
| Persistent (non-modal) | No | Yes (`modal={false}`) | No |
| Best for | Desktop side panels, settings | Mobile-first, bottom sheets | Confirmations, forms |

Use `Sheet` for desktop-only persistent side panels where drag physics aren't needed. Use `Drawer` when you want mobile-native drag-to-dismiss behavior.

**Design system rules:**
- `side="right"`: `w-[400px] max-w-full`
- Background: `bg-card border-l border-border`
- Title: `text-base font-semibold text-foreground`
- Description: `text-sm text-muted-foreground`

```tsx
<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline" size="sm">Settings</Button>
  </SheetTrigger>
  <SheetContent
    side="right"
    className="w-[400px] bg-card border-l border-border p-0 flex flex-col"
  >
    <SheetHeader className="px-6 py-4 border-b border-border">
      <SheetTitle className="text-base font-semibold">Campaign Settings</SheetTitle>
      <SheetDescription className="text-sm text-muted-foreground">
        Adjust targeting, budget, and schedule.
      </SheetDescription>
    </SheetHeader>
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {/* settings content */}
    </div>
    <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
      <SheetClose asChild>
        <Button variant="ghost">Cancel</Button>
      </SheetClose>
      <Button>Save Changes</Button>
    </div>
  </SheetContent>
</Sheet>
```

---

### Disabled States

All interactive components follow the same disabled pattern:

```html
<!-- Tailwind classes for any disabled element -->
disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
```

For non-button elements (cards with disabled states, list items):

```html
aria-disabled="true"
class="opacity-50 cursor-not-allowed pointer-events-none select-none"
```

Never rely on opacity alone — always pair with `cursor-not-allowed` and `pointer-events-none` to prevent accidental interactions.

---

### Empty States

Empty states must teach the interface — not just say "nothing here." Each empty state needs:
1. A visual (icon, illustration — consistent with gravitational physics aesthetic)
2. A headline (what's missing, written as a capability)
3. A description (why it's empty, what to do)
4. A primary CTA (one action, always)

```tsx
// src/components/ui/EmptyState.tsx
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="mb-4 rounded-full bg-muted p-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[40ch] mb-6">{description}</p>
      {action && (
        <Button onClick={action.onClick} className="bg-primary text-primary-foreground">
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

Usage:

```tsx
<EmptyState
  icon={BarChart2}
  title="No campaigns yet"
  description="Connect a Meta ad account and create your first campaign to start tracking performance."
  action={{ label: "Connect Meta", onClick: () => router.push("/settings/integrations") }}
/>
```
