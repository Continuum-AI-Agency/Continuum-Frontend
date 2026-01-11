# Studio Canvas Connectors - Styling Spec

Date: 2026-01-11
Scope: Styling-only specification for connectors, handles, labels, canvas, and animations.
Goal: Match the florafauna aesthetic while preserving existing data-type colors and supporting light/dark mode via global theme toggle.

## 1) Theme and tokens
- Respect global theme toggle (light/dark).
- All connector styling must use semantic tokens; no hardcoded hex in components.

### 1.1 Data-type color tokens (existing hues, unchanged)
- edge-text: use existing text edge hue (currently slate-400).
- edge-image: use existing image edge hue (currently indigo-500).
- edge-video: use existing video edge hue (currently purple-500).

### 1.2 State tokens (alpha-driven)
Define these as theme-aware CSS variables or Tailwind semantic utilities:
- edge-base: edge-* at 65% alpha
- edge-hover: edge-* at 85% alpha
- edge-selected: edge-* at 100% alpha + subtle glow
- edge-active: edge-* with traveling dash/gradient
- edge-muted: edge-* at 40% alpha

### 1.3 Glow token
- edge-glow: soft glow using edge-* hue at 20-30% alpha, blur 6-10px
- Use only for hover/selected/active, never for base state.

## 2) Canvas + grid
- Dark mode: deep charcoal base with faint dotted grid at 8-12% opacity. Optional subtle vignette/noise.
- Light mode: soft neutral base with faint dotted grid at 6-10% opacity.
- Grid must be lower contrast than static edges in both modes.

## 3) Edge geometry
- Single stroke weight across all edge types: 1.5-2px (pick one and stick to it).
- Rounded caps and joins.
- No dashed lines for non-active edges.

## 4) Directional pulse (active only)
Active edges = edges connected into a generator node that is "ready" (all required parameters full).
- Style: a single traveling dash/gradient moving source -> target.
- Segment length: 14-24px (visual length along path).
- Tail: opacity falloff to 0%, directionally toward target.
- Duration: 1.6s to 2.4s linear (slower for readability).
- Non-active edges remain static.

### Reduced motion
- If prefers-reduced-motion, disable travel; show edge-active as static edge-selected + subtle glow.

## 5) Handles (size unchanged)
- Do NOT change handle sizes.
- Colors use edge-* tokens; ensure contrast against canvas.
- Hover/selected: increase alpha only (no hue change).

## 6) Labels
- Keep label pills minimal and consistent.
- Typography: uppercase, small size, tight tracking.
- Color: use edge-* at 70-80% alpha; avoid full neon.
- Background: subtle surface token matching theme, not pure black/white.

## 7) Interaction states summary
- Base: edge-base.
- Hover: edge-hover + edge-glow.
- Selected: edge-selected + edge-glow.
- Active: edge-base + traveling dash/gradient + edge-glow.
- Muted/invalid: edge-muted.

## 8) Implementation targets (styling only)
- globals.css: define connector tokens and animation keyframes.
- Edge components:
  - src/StudioCanvas/edges/DataTypeEdge.tsx
  - src/StudioCanvas/edges/AnimatedEdge.tsx
  - src/StudioCanvas/edges/ColoredEdge.tsx
- Connection preview:
  - src/StudioCanvas/components/CustomConnectionLine.tsx
- Node handle labels/handles:
  - src/StudioCanvas/nodes/StringNode.tsx
  - src/StudioCanvas/nodes/ImageGenBlock.tsx
  - src/StudioCanvas/nodes/VideoGenBlock.tsx
  - src/StudioCanvas/nodes/VideoReferenceNode.tsx
  - src/StudioCanvas/nodes/ImageNode.tsx

## 9) Acceptance checks
- Theme toggle switches edge/label/grid styling correctly.
- Static edges are quiet; active edges are readable and directional.
- Colors match existing data-type hues.
- Handles keep their current size.
- No hardcoded hex colors remain in connector styling.
