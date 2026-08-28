import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderInputValue,
  apiRenderVariableHandleId,
  type PinnedRenderAsset,
  variationIndexFromHandle,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { ApiRenderNodeData, GeneratedImageVariation, StudioNode } from '../../types';

/**
 * The text an upstream node produces. Three keys because three node families spell it
 * differently — a Text Block writes `value`, a decoder writes `value`, an enriched or
 * agent-authored node writes `text`/`generatedText`. Same ladder `upstreamCaption` walks
 * for the Planner draft node.
 */
function textFromNode(node: StudioNode): string | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  for (const candidate of [data.value, data.text, data.generatedText]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return null;
}

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

const ENGLISH_LABELS: Record<string, string> = {
  imagen: 'Image',
  logo: 'Logo',
  texto: 'Text',
  title: 'Title',
  titulo: 'Title',
};

export function apiRenderVariableLabel(definition: { key: string; label: string }): string {
  const key = definition.key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return ENGLISH_LABELS[key] ?? definition.label;
}

export function inspectApiRenderMediaInputs(args: {
  nodeId: string;
  data: ApiRenderNodeData;
  nodes: StudioNode[];
  edges: Edge[];
}): Map<string, { connected: number; ready: number }> {
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
          },
        ];
      }),
  );
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
    const wired = args.edges.filter(
      (candidate) =>
        candidate.target === args.nodeId &&
        candidate.targetHandle === apiRenderVariableHandleId(definition.key),
    );
    if (definition.kind === 'image' || definition.kind === 'video') {
      // Edge order is the order the user wired them; a `multiple` port is a list the
      // renderer LOOPS over, so position is meaning, not incidental.
      const pins = wired.map((edge) => {
        const source = byId.get(edge.source);
        return source ? pinFromNode(source, edge.sourceHandle) : null;
      });
      // One guard for both ways a wired slot lies: a member with no durable Library
      // identity, and more members than the wire contract accepts. Dropping either
      // would render a shorter list than the canvas shows — succeeding, wrongly.
      const max = definition.multiple ? API_RENDER_MEDIA_LIST_MAX : 1;
      if (pins.some((pin) => pin === null) || pins.length > max)
        errors.push(`${apiRenderVariableLabel(definition)} needs a Library asset`);
      else if (pins.length > 0)
        variables[definition.key] = definition.multiple ? (pins as PinnedRenderAsset[]) : pins[0]!;
      else if (definition.required)
        errors.push(`${apiRenderVariableLabel(definition)} needs a Library asset`);
      continue;
    }
    // A wired text source WINS over the field typed on the node. The field stays as the
    // fallback for an unwired variable, but once an edge exists the canvas shows text
    // flowing into this slot — sending the inline value instead would render something
    // the graph does not depict. A wired source with nothing in it is MISSING, not empty:
    // sending '' would satisfy a required slot with a blank.
    if (definition.kind === 'text' && wired.length > 0) {
      const source = byId.get(wired[0]!.source);
      const text = source ? textFromNode(source) : null;
      if (text !== null) variables[definition.key] = text;
      else if (definition.required)
        errors.push(`${apiRenderVariableLabel(definition)} is required`);
      continue;
    }
    const value = args.data.variables?.[definition.key];
    if (value !== undefined && value !== '') variables[definition.key] = value;
    else if (definition.required) errors.push(`${apiRenderVariableLabel(definition)} is required`);
  }
  return { variables, errors };
}

/**
 * A scalar media slot with several wires means one render per wire. Single values are
 * broadcast across those renders; real `media_list` slots remain one ordered list.
 */
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
