# AI Studio Canvas Replacement Plan

## Summary
This plan replaces the current AI Studio canvas UX with a light‑mode, data‑type‑driven edge system, category‑coded nodes, full‑bleed media nodes, resizable image nodes, a comprehensive canvas context menu, full‑screen canvas layout, and an “At a glance” presence module. It respects `docs/styleguide.md` and the existing port type/edge definitions.

## Decisions Locked
- Light mode as the baseline.
- Edge colors follow data types, not node categories.
- Port type colors must be respected.
- Image nodes and generator outputs are full‑bleed with floating labels.
- Reference, preview, and generator image nodes are resizable.
- Right‑click canvas context menu is required and comprehensive.
- Canvas fills the full screen.
- Realtime moves to an expandable “At a glance” control.

## Design System Alignment
- Use semantic tokens from `docs/styleguide.md`.
- Maintain 7:1 contrast in light mode.
- Keep motion purposeful and subtle, and honor reduced‑motion.

## Canvas Token Source
Single source of truth for canvas tokens exists at:
- `src/components/ai-studio/canvas/canvas.css`

Tokens included:
- Edge data types: `--edge-text`, `--edge-image`, `--edge-video`, `--edge-audio`, `--edge-document`
- Edge states: `--edge-alpha-*`, `--edge-stroke-width`, `--edge-flow-*`
- Port types: `--port-text`, `--port-image`, `--port-video`, `--port-aspect`, `--port-provider`
- Node category accents: `--node-*`
- Canvas surface: `--studio-grid-dot`, `--studio-canvas-vignette`

## Canvas Layout & Navigation
- Canvas fills the available viewport and is the dominant surface.
- Default interaction is drag‑to‑pan.
- Provide visible zoom controls and a numeric zoom indicator.
- Light‑mode grid or dot‑matrix background for spatial orientation.

## Node System
Node categories are derived from `src/components/ai-studio/canvas/index.ts`. Category color is a secondary accent on the node itself. It does not override edge colors.

Node definitions:
| Node Type | Category Accent | Primary Purpose | Key States |
| --- | --- | --- | --- |
| Prompt | `--node-prompt` | Text prompt input | default, hover, selected, active, error, disabled |
| Negative | `--node-negative` | Negative prompt input | default, hover, selected, active, error, disabled |
| Model | `--node-model` | Provider and aspect selection | default, hover, selected, active, error, disabled |
| Attachment | `--node-attachment` | Reference image/video input | default, hover, selected, active, error, disabled |
| Generator | `--node-generator` | Image/video generation | default, hover, selected, active, error, disabled |
| Preview | `--node-preview` | Output preview | default, hover, selected, active, error, disabled |
| Array | `--node-array` | Array editor for iteration | default, hover, selected, active, error, disabled |
| Iterator | `--node-iterator` | Iterate through array items | default, hover, selected, active, error, disabled |
| ImageProcessor | `--node-image-processor` | Image editing actions | default, hover, selected, active, error, disabled |
| LLM | `--node-llm` | Text generation | default, hover, selected, active, error, disabled |
| Composite | `--node-composite` | Multi‑input image operations | default, hover, selected, active, error, disabled |

### Node Visual Rules
- Category accent appears as a thin left rail, title underline, or top strip.
- Selected state adds a visible ring using `text-brand-primary` semantics.
- Active execution state uses a subtle glow or outline in category accent.
- Handles are integrated and follow port type colors.

## Ports & Handles
Port types are defined by `src/lib/ai-studio/portTypes.ts`.
- `text`, `image`, `video`, `aspect`, `provider`
- Handle colors match `getPortColor` and the port tokens in the canvas stylesheet.
- Handle IDs must align to `HANDLE_ID_TO_PORT_TYPE` for compatibility.

## Edge System
Use `DataTypeEdge` behavior as canonical.

Edge rules:
- Edge color is based on data type tokens.
- Path type can be `bezier`, `straight`, `step`, or `smoothstep`.
- Idle edges are static and low‑contrast.
- Active execution edges animate flow only while active.
- Reduced motion switches to a static highlight.

Edge data types supported:
- `text`, `image`, `video`
- `audio`, `document` are supported by the edge renderer but require explicit usage if introduced.

## Full‑Bleed Media Nodes
Applies to:
- Attachment
- Preview
- Generator (when output exists)

Rules:
- Media fills the node surface.
- Labels float on top of the media.
- Labels include category accent and optional status chip.
- Ensure label readability via translucency or blur.

## Resizable Nodes
Applies to:
- Attachment
- Preview
- Generator (with output)

Rules:
- Resize handles appear on hover or selection.
- Maintain aspect ratio by default.
- Modifier key enables free‑resize.
- Enforce a minimum size so labels and handles remain usable.

## Context Menu (Right‑Click)
Required actions:
- Add Node: all types listed above.
- Recent: last inserted node types.
- Clipboard: paste, duplicate selection.
- View: zoom in/out, fit view, toggle grid, toggle snap.
- Layout: align, distribute, auto‑layout.
- Library: open full node catalog.

## Panels & Toolbar
- Floating panels styled as “instrument surfaces.”
- All interactive targets meet 44x44 minimum.
- Panel content includes category legend and edge data‑type key.

## Realtime “At a Glance”
Replace the existing sync status placement with:
- Collapsed state: avatar stack only.
- Expanded state: sync status, saving state, and user info.
- Hover on avatar shows a mini user card with name and cursor color.

## Accessibility & Performance
- Visible focus rings for all interactive elements.
- Ensure contrast meets 7:1 minimum in light mode.
- Avoid continuous animation; only animate active execution.
- Avoid heavy SVG animation when graph is large.

## Implementation Steps
1. Wire `src/components/ai-studio/canvas/canvas.css` into the canvas root and ensure `.studio-canvas` or `.ai-studio-canvas` is applied.
2. Update all node components to use category accents and state rules.
3. Apply full‑bleed media layout and floating labels to Attachment, Preview, and Generator nodes.
4. Implement resizable behavior for those nodes.
5. Update edges and connections to respect data‑type tokens and active‑only animation.
6. Add a comprehensive canvas context menu.
7. Move realtime UI into the “At a glance” control.
8. Validate reduced‑motion and contrast requirements.

## Open Checks
- Confirm handle IDs for Array and Iterator nodes where they are not explicitly set.
- Confirm whether edge label styling should be visible by default or only on hover.
