import {
  type ApiRenderInputValue,
  apiRenderVariableHandleId,
  apiRenderVariableLabel,
  pinFromNode,
  pinsFromValue,
  resolveApiRenderVariables,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { ApiRenderNodeData, StudioNode } from '../../types';

// The resolution itself moved to `@continuum/contracts/ai-studio/api-render-variables`:
// the headless runner sends these variables with nobody watching, and the Canvas gates
// Prepare on them, so a second copy of "a wired source beats the typed field" would let
// an unattended render carry values the graph does not depict. What stays here is the
// canvas-only half — the per-slot status line and the variation fan-out, neither of which
// the Backend has any use for.
export { apiRenderVariableLabel, resolveApiRenderVariables };

/**
 * Per media slot: how it is filled, for the field's own status line.
 *
 * `picked` counts assets chosen straight from the Library and is reported even when the
 * slot is also wired — the field says which one is winning, so a user who wires over a
 * picked asset can see that the pick is still there and still theirs to fall back on.
 */
export function inspectApiRenderMediaInputs(args: {
  nodeId: string;
  data: ApiRenderNodeData;
  nodes: StudioNode[];
  edges: Edge[];
}): Map<string, { connected: number; ready: number; picked: number }> {
  const byId = new Map(args.nodes.map((node) => [node.id, node]));
  return new Map(
    (args.data.variableDefinitions ?? [])
      .filter((definition) => definition.kind === 'image' || definition.kind === 'video')
      .map((definition) => {
        const wired = args.edges.filter(
          (edge) =>
            edge.target === args.nodeId &&
            edge.targetHandle === apiRenderVariableHandleId(definition.key),
        );
        return [
          definition.key,
          {
            connected: wired.length,
            ready: wired.filter((edge) => {
              const source = byId.get(edge.source);
              return source ? pinFromNode(source, edge.sourceHandle) !== null : false;
            }).length,
            picked: pinsFromValue(args.data.variables?.[definition.key]).length,
          },
        ];
      }),
  );
}
export { resolveApiRenderVariations } from '@continuum/contracts';

export const __test__ = { pinFromNode };
