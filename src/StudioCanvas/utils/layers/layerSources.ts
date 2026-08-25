import { LAYER_EDITOR_IMAGE_INPUT_HANDLE } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import { exportSourceFromNodeData } from '../export/runExport';

/**
 * What is wired into a Layer Editor's `image-in` pool.
 *
 * The field-priority list for "what image is this node currently holding"
 * (`generatedImageUrl` -> `generatedImage` -> `image` -> an image node's `sourceUrl`)
 * already exists once, in `utils/export/runExport.ts`. A second copy here is precisely
 * the drift AGENTS.md §4 warns about — the two would disagree the first time a
 * generator gains a field — so this reuses that reader and only narrows to images.
 */

export interface LayerSource {
  nodeId: string;
  /** A data:, blob: or signed https: URL. */
  ref: string;
  /** Defaulted from the node's own label/type; becomes `LayerEditorLayer.name`. */
  name: string;
  assetId?: string;
  assetVersionId?: string;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * A human label for a layer, in the order a person would recognise it: the node's own
 * label, then its stored file name, then its type. Never the node id.
 */
const nameFor = (node: { id: string; type?: string; data?: unknown }, index: number): string => {
  const data = asRecord(node.data);
  return (
    stringOrUndefined(data.label) ??
    stringOrUndefined(data.fileName) ??
    `${node.type ?? 'Layer'} ${index + 1}`
  );
};

/**
 * Every image feeding `layerEditorNodeId`, in edge order.
 *
 * `image-in` is a POOL — contracts caps it at `LAYER_EDITOR_LAYER_LIMIT` — so N edges
 * into one handle is the ordinary way to hand the editor N layers.
 */
export function layerSourcesFromGraph(
  layerEditorNodeId: string,
  edges: readonly Edge[],
  nodes: readonly { id: string; type?: string; data?: unknown }[],
): LayerSource[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return edges
    .filter(
      (edge) =>
        edge.target === layerEditorNodeId &&
        (edge.targetHandle ?? LAYER_EDITOR_IMAGE_INPUT_HANDLE) === LAYER_EDITOR_IMAGE_INPUT_HANDLE,
    )
    .map((edge) => byId.get(edge.source))
    .filter((node): node is { id: string; type?: string; data?: unknown } => Boolean(node))
    .map((node, index): LayerSource | null => {
      const source = exportSourceFromNodeData(node);
      // Images only. A video wired here would be refused by contracts' connection
      // validation, but a node that emits both keeps a poster still alongside its clip
      // and `exportSourceFromNodeData` answers "video" for it — which is right for the
      // Export node and wrong for a stills compositor.
      if (!source || source.kind !== 'image' || typeof source.ref !== 'string') return null;
      const data = asRecord(node.data);
      return {
        nodeId: node.id,
        ref: source.ref,
        name: nameFor(node, index),
        assetId: stringOrUndefined(data.renderOutputAssetId) ?? stringOrUndefined(data.assetId),
        assetVersionId:
          stringOrUndefined(data.renderOutputAssetVersionId) ??
          stringOrUndefined(data.assetVersionId),
      };
    })
    .filter((source): source is LayerSource => source !== null);
}
