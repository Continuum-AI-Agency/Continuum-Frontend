import { type ApiRenderInputValue, variationIndexFromHandle } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { ApiRenderNodeData, GeneratedImageVariation, StudioNode } from '../../types';

function pinFromNode(node: StudioNode, sourceHandle: string | null | undefined) {
  const data = node.data as Record<string, unknown>;
  const generated = Array.isArray(data.generatedImages)
    ? (data.generatedImages as GeneratedImageVariation[])
    : [];
  const variation = generated[variationIndexFromHandle(sourceHandle)];
  const assetId = variation?.assetId ?? data.renderOutputAssetId ?? data.assetId;
  const versionId =
    variation?.assetVersionId ?? data.renderOutputAssetVersionId ?? data.assetVersionId;
  return typeof assetId === 'string' && typeof versionId === 'string'
    ? { assetId, versionId }
    : null;
}

export function resolveApiRenderVariables(args: {
  nodeId: string;
  data: ApiRenderNodeData;
  nodes: StudioNode[];
  edges: Edge[];
}): { variables: Record<string, ApiRenderInputValue>; errors: string[] } {
  const variables: Record<string, ApiRenderInputValue> = {};
  const errors: string[] = [];
  const byId = new Map(args.nodes.map((node) => [node.id, node]));
  for (const definition of args.data.variableDefinitions ?? []) {
    // The server fills a reserved variable (today: `watermark_logo`, the brand's own
    // mark, content-addressed and pinned during preflight) and REFUSES a caller-supplied
    // value. Skipping it is not cosmetic: a reserved variable is `required` too, so
    // keying off `required` alone would raise "needs a version-pinned Library asset"
    // and refuse Prepare for a slot the caller is forbidden to fill.
    if (definition.reserved) continue;
    if (definition.kind === 'image' || definition.kind === 'video') {
      const edge = args.edges.find(
        (candidate) =>
          candidate.target === args.nodeId &&
          candidate.targetHandle === `variable-${definition.key}`,
      );
      const source = edge ? byId.get(edge.source) : undefined;
      const pin = source ? pinFromNode(source, edge?.sourceHandle) : null;
      if (pin) variables[definition.key] = pin;
      else if (definition.required)
        errors.push(`${definition.label} needs a version-pinned Library asset`);
      continue;
    }
    const value = args.data.variables?.[definition.key];
    if (value !== undefined && value !== '') variables[definition.key] = value;
    else if (definition.required) errors.push(`${definition.label} is required`);
  }
  return { variables, errors };
}

export const __test__ = { pinFromNode };
