import type {
  GraphEdgeLike,
  GraphNodeLike,
  StudioNodeType,
  WorkflowMediaKind,
} from './workflow-graph';

// Token-lean projection of a canvas graph for the MCP agent. Raw canvas nodes
// carry positions, styles, xyflow internals, runtime flags, base64, and signed
// URLs — none of which help the agent reason. This view-model keeps only the
// high-signal config + wiring + attachment identity, and is the single source of
// the lean shape returned by `get` and every edit confirmation.

const FREE_TEXT_KEYS = new Set(['value', 'prompt', 'positivePrompt', 'negativePrompt']);
const FREE_TEXT_CAP = 160;

// Hard ceilings on how much of a canvas reaches the agent. A workflow can grow
// without bound; the context window cannot. When either ceiling engages the
// projection serves a window and says so via `truncated` — but `node_count` /
// `edge_count` keep describing the whole graph, so the agent is never misled
// about what it is editing.
export const MAX_PROJECTED_NODES = 60;
export const MAX_PROJECTED_WIRING = 120;

export const AGENT_FIELD_WHITELIST: Record<StudioNodeType, string[]> = {
  string: ['value'],
  videoDecode: ['value'],
  nanoGen: ['model', 'positivePrompt', 'aspectRatio', 'imageSize'],
  videoGen: ['model', 'prompt', 'negativePrompt', 'aspectRatio', 'durationSeconds', 'resolution'],
  veoDirector: [
    'model',
    'prompt',
    'negativePrompt',
    'aspectRatio',
    'durationSeconds',
    'resolution',
  ],
  veoFast: ['model', 'prompt', 'negativePrompt', 'aspectRatio', 'durationSeconds', 'resolution'],
  omniGen: ['model', 'prompt', 'aspectRatio'],
  extendVideo: ['prompt'],
  videoEditor: ['outputFormat'],
  timelineEditor: ['outputFormat'],
  publishToPlanner: ['platform', 'status', 'scheduledAt'],
  image: ['fileName', 'referenceType', 'aspectRatio'],
  video: ['fileName'],
  audio: ['fileName'],
  document: [],
};

export interface ProjectedNode {
  id: string;
  type: string;
  label?: string;
  config?: Record<string, unknown>;
}

export interface ProjectedAttachment {
  node_id: string;
  handle: string;
  media_kind: WorkflowMediaKind;
  file_name?: string;
  asset_ref?: string;
}

export interface ProjectedTruncation {
  nodes_omitted: number;
  edges_omitted: number;
}

export interface ProjectedGraph {
  node_count: number;
  edge_count: number;
  node_types: Record<string, number>;
  nodes: ProjectedNode[];
  wiring: string[];
  attachments: ProjectedAttachment[];
  truncated?: ProjectedTruncation;
}

interface ProjectionInput {
  nodes: Array<GraphNodeLike & { type?: string }>;
  edges: GraphEdgeLike[];
}

function capText(value: string): string {
  return value.length <= FREE_TEXT_CAP ? value : `${value.slice(0, FREE_TEXT_CAP).trimEnd()}…`;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function projectConfig(
  type: string,
  data: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const whitelist = AGENT_FIELD_WHITELIST[type as StudioNodeType] ?? [];
  const config: Record<string, unknown> = {};
  for (const key of whitelist) {
    let value = data[key];
    if (isEmpty(value)) continue;
    if (FREE_TEXT_KEYS.has(key) && typeof value === 'string') value = capText(value);
    config[key] = value;
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

const OUTPUT_IMAGE_TYPES = new Set(['nanoGen']);
const OUTPUT_VIDEO_TYPES = new Set([
  'videoGen',
  'veoDirector',
  'veoFast',
  'extendVideo',
  'videoEditor',
  'timelineEditor',
]);

function attachmentFor(
  node: GraphNodeLike & { type?: string },
  edges: GraphEdgeLike[],
): ProjectedAttachment | undefined {
  const data = node.data ?? {};
  const consumingHandle = edges.find((e) => e.source === node.id)?.targetHandle ?? undefined;

  if ((node.type === 'image' || node.type === 'video') && typeof data.sourcePath === 'string') {
    return {
      node_id: node.id,
      handle: consumingHandle ?? node.type,
      media_kind: node.type === 'image' ? 'image' : 'video',
      file_name: typeof data.fileName === 'string' ? data.fileName : undefined,
      asset_ref: typeof data.assetId === 'string' ? data.assetId : undefined,
    };
  }

  if (
    OUTPUT_IMAGE_TYPES.has(node.type ?? '') &&
    typeof data.generatedImageStoragePath === 'string'
  ) {
    return {
      node_id: node.id,
      handle: 'output',
      media_kind: 'image',
      asset_ref:
        typeof data.generatedImageAssetId === 'string' ? data.generatedImageAssetId : undefined,
    };
  }
  if (
    OUTPUT_VIDEO_TYPES.has(node.type ?? '') &&
    typeof data.generatedVideoStoragePath === 'string'
  ) {
    return {
      node_id: node.id,
      handle: 'output',
      media_kind: 'video',
      asset_ref:
        typeof data.generatedVideoAssetId === 'string' ? data.generatedVideoAssetId : undefined,
    };
  }

  return undefined;
}

export function projectGraphForAgent(graph: ProjectionInput): ProjectedGraph {
  const nodeTypes: Record<string, number> = {};
  for (const node of graph.nodes) {
    const type = node.type ?? 'unknown';
    nodeTypes[type] = (nodeTypes[type] ?? 0) + 1;
  }

  const window = graph.nodes.slice(0, MAX_PROJECTED_NODES);
  const nodes: ProjectedNode[] = [];
  const attachments: ProjectedAttachment[] = [];

  for (const node of window) {
    const data = node.data ?? {};
    const projected: ProjectedNode = { id: node.id, type: node.type ?? 'unknown' };
    if (typeof data.label === 'string' && data.label.trim()) projected.label = data.label;
    const config = projectConfig(projected.type, data);
    if (config) projected.config = config;
    nodes.push(projected);

    // Handles resolve against the full edge list, not the wiring window, so an
    // attachment still reports the handle it feeds even past the wiring cap.
    const attachment = attachmentFor(node, graph.edges);
    if (attachment) attachments.push(attachment);
  }

  const wiring = graph.edges
    .slice(0, MAX_PROJECTED_WIRING)
    .map((e) => `${e.source}.${e.sourceHandle ?? 'out'} → ${e.target}.${e.targetHandle ?? 'in'}`);

  const nodesOmitted = graph.nodes.length - nodes.length;
  const edgesOmitted = graph.edges.length - wiring.length;

  const projection: ProjectedGraph = {
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    node_types: nodeTypes,
    nodes,
    wiring,
    attachments,
  };
  if (nodesOmitted > 0 || edgesOmitted > 0) {
    projection.truncated = { nodes_omitted: nodesOmitted, edges_omitted: edgesOmitted };
  }
  return projection;
}
