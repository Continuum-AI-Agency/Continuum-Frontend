# Studio Canvas Connectors - Functional Findings

Date: 2026-01-10
Scope: Connector behavior and edge system integration (non-styling findings).

## Findings
- [Medium] src/StudioCanvas/components/StudioCanvas.tsx:65, src/StudioCanvas/stores/useStudioStore.ts:17, src/StudioCanvas/components/StudioCanvas.tsx:279
  Edge types are registered as custom (button/dataType) but edges are created with built-in types (bezier/step/smoothstep). Custom edge rendering is effectively unused for most connections, so behavior and labels don’t match the intended edge components.

- [Medium] src/StudioCanvas/edges/ColoredEdge.tsx:24, src/StudioCanvas/components/CustomConnectionLine.tsx:21, src/StudioCanvas/stores/useStudioStore.ts:47
  Color/data-type logic is derived from different sources (targetHandle vs sourceHandle vs fromHandle). This can yield inconsistent type inference and mismatched semantics between preview and finalized edges.

- [Low] src/StudioCanvas/edges/DataTypeEdge.tsx:78
  Edge data is cast directly without validation. If dataType is missing or malformed, fallbacks are implicit rather than enforced, which can degrade later behavior (e.g., marker color, animation speed).
