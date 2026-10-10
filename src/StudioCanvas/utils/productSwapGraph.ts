import {
  buildWorkflowGraph,
  compileProductSwapWorkflow,
  getAllowedSourceHandles,
  mergeGraphs,
  type ProductSwapRecipe,
  type WorkflowGraph,
} from '@continuum/contracts';

export function productSwapGraph(recipe: ProductSwapRecipe, current: WorkflowGraph): WorkflowGraph {
  const compiled = compileProductSwapWorkflow(recipe);
  const externalIds = new Set([recipe.sourceVideoNodeId, ...recipe.productRefNodeIds]);
  const external = [...externalIds].map((id) => {
    const node = current.nodes.find((candidate) => candidate.id === id);
    const handle = id === recipe.sourceVideoNodeId ? 'video' : 'image';
    if (!node || !getAllowedSourceHandles(node).includes(handle)) {
      throw new Error(`The ${handle} reference is no longer on this canvas. Choose it again.`);
    }
    return { ref: id, type: node.type, data: node.data };
  });
  const prefix = `product-swap:${crypto.randomUUID()}`;
  const internalIds = new Set(compiled.nodes.map((node) => node.ref));
  const ref = (id: string) => (internalIds.has(id) ? `${prefix}:${id}` : id);
  const built = buildWorkflowGraph(
    [...external, ...compiled.nodes.map((node) => ({ ...node, ref: ref(node.ref) }))],
    compiled.connections.map((connection) => ({
      ...connection,
      from_ref: ref(connection.from_ref),
      to_ref: ref(connection.to_ref),
    })),
  );
  if (built.errors.length) throw new Error(built.errors.join('\n'));
  return mergeGraphs(current, {
    ...built.graph,
    nodes: built.graph.nodes.filter((node) => !externalIds.has(node.id)),
  });
}
