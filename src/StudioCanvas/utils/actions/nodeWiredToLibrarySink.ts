import { isCanvasLibrarySinkNodeType } from '@continuum/contracts';

/** True when a downstream path reaches Export or API Render. */
export function nodeWiredToLibrarySink(
  nodeId: string,
  edges: readonly { source: string; target: string }[],
  nodeTypeById: ReadonlyMap<string, string | undefined>,
): boolean {
  const seen = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    for (const edge of edges) {
      if (edge.source !== id) continue;
      const targetType = nodeTypeById.get(edge.target);
      if (targetType && isCanvasLibrarySinkNodeType(targetType)) return true;
      stack.push(edge.target);
    }
  }
  return false;
}
