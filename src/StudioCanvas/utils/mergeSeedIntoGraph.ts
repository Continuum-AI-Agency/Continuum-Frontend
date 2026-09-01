// Append-only graph merge, deduped by id: a seed lands NEXT TO whatever is already
// on the canvas, never over it, and re-applying the same seed is a no-op.
//
// This lived in `lib/library/canvasTemplates.ts` and still exports from there, so
// the Library route and its tests are untouched. It moved here because the canvas
// needs it too and could not reach it: `canvasTemplates` imports `./quickLook` — a
// ~500-line Library/Backend SSE seam (`getApiUrl`, `readServerSentEvents`,
// `createSupabaseBrowserClient`) — and imports back into `@/StudioCanvas/utils`, so
// a canvas hook importing it would drag the Library's generate path into the canvas
// module graph and close an import loop through the Library layer. Here the
// dependency keeps running the one direction it already ran: library -> canvas.

export type PersistedGraph = {
  nodes: unknown[];
  edges: unknown[];
};

// Anything id-bearing: a StudioNode/Edge pair from the planner seed, or a
// CanvasTemplateGraph from the Library. Only the id is read.
export type SeedGraph = {
  nodes: { id: string }[];
  edges: { id: string }[];
};

function idsOf(items: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    const id = (item as { id?: unknown })?.id;
    if (typeof id === 'string') ids.add(id);
  }
  return ids;
}

export function mergeSeedIntoGraph(current: PersistedGraph, seed: SeedGraph): PersistedGraph {
  const nodeIds = idsOf(current.nodes);
  const edgeIds = idsOf(current.edges);
  return {
    nodes: [...current.nodes, ...seed.nodes.filter((node) => !nodeIds.has(node.id))],
    edges: [...current.edges, ...seed.edges.filter((edge) => !edgeIds.has(edge.id))],
  };
}
