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
export function resolveApiRenderVariations(args: {
  nodeId: string;
  data: ApiRenderNodeData;
  nodes: StudioNode[];
  edges: Edge[];
}): {
  count: number;
  records: Array<{ label: string; variables: Record<string, ApiRenderInputValue> }>;
  errors: string[];
} {
  const scalarMediaHandles = new Set(
    (args.data.variableDefinitions ?? [])
      .filter(
        (variable) =>
          !variable.reserved &&
          !variable.multiple &&
          (variable.kind === 'image' || variable.kind === 'video'),
      )
      .map((variable) => apiRenderVariableHandleId(variable.key)),
  );
  const counts = new Map<string, number>();
  for (const edge of args.edges) {
    if (edge.target !== args.nodeId || !scalarMediaHandles.has(edge.targetHandle ?? '')) continue;
    counts.set(edge.targetHandle as string, (counts.get(edge.targetHandle as string) ?? 0) + 1);
  }
  const count = Math.max(1, ...counts.values());
  const mismatched = [...counts.entries()].find(([, value]) => value > 1 && value !== count);
  if (mismatched) {
    const definition = (args.data.variableDefinitions ?? []).find(
      (variable) => apiRenderVariableHandleId(variable.key) === mismatched[0],
    );
    return {
      count,
      records: [],
      errors: [
        `${definition ? apiRenderVariableLabel(definition) : 'Media'} needs either 1 or ${count} inputs`,
      ],
    };
  }

  const records = Array.from({ length: count }, (_, index) => {
    const edges = args.edges.filter((edge) => {
      if (edge.target !== args.nodeId || !scalarMediaHandles.has(edge.targetHandle ?? '')) {
        return true;
      }
      const siblings = args.edges.filter(
        (candidate) =>
          candidate.target === args.nodeId && candidate.targetHandle === edge.targetHandle,
      );
      return siblings.length === 1 || siblings[index] === edge;
    });
    const resolved = resolveApiRenderVariables({ ...args, edges });
    return { label: `Variation ${index + 1}`, ...resolved };
  });
  const errors = [...new Set(records.flatMap((record) => record.errors))];
  return {
    count,
    records: errors.length ? [] : records.map(({ label, variables }) => ({ label, variables })),
    errors,
  };
}

export const __test__ = { pinFromNode };
