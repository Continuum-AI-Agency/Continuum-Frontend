import { STUDIO_NODE_REGISTRY, type StudioNodeDefinition } from './node-registry';
import { timelineAuthoringDocumentSchema, timelineDocumentFingerprint } from './timeline-authoring';
import { validateWorkflowGraph } from './workflow-builder';
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
export const FREE_TEXT_CAP = 160;

// Hard ceilings on how much of a canvas reaches the agent. A workflow can grow
// without bound; the context window cannot. When either ceiling engages the
// projection serves a window and says so via `truncated` — but `node_count` /
// `edge_count` keep describing the whole graph, so the agent is never misled
// about what it is editing.
export const MAX_PROJECTED_NODES = 60;
export const MAX_PROJECTED_WIRING = 120;

export const AGENT_FIELD_WHITELIST: Record<StudioNodeType, string[]> = {
  string: ['value'],
  note: ['content'],
  // The op AND its config. Both halves are now real: `action-registry.ts` carries a Zod
  // schema per op, `describeNodeVocabulary` renders each op's config keys, and
  // `update_node` already accepts them. Projecting only `actionId` would hide from the
  // agent the very field the vocabulary just told it to write.
  action: ['actionId', 'config'],
  // `itemType` is the modality LOCK, and it is load-bearing rather than cosmetic:
  // `sourceModality('batch')` is `batchItemType(data)`, so a batch with neither an
  // `itemType` nor a first item carrying a `kind` has NO output modality and every edge
  // from it to a generator is refused ("no compatible handle") — unlike a router, whose
  // lock the canvas stamps from its wiring, nothing derives this one. An agent that
  // cannot see or set it cannot build a working batch at all.
  // `items` is read-only here: `addBatchItems` is the one writer that enforces the lock
  // and the 100 cap, and items arrive by attach_media or by wiring, never as a blob.
  batch: ['combine', 'itemType', 'items'],
  designRef: ['section', 'mode'],
  export: ['format'],
  // A router's lock is derived from its wiring, not chosen.
  router: [],
  // `layers` stays editor-owned — a layer document is authored in the dialog, exactly as
  // `timelineEditor.items` is. The FRAME is not: an agent asked for a 9:16 composite had
  // no way to say so and no way to read back what it got, which made the whole node
  // invisible to it rather than merely half-writable.
  layerEditor: ['frameWidth', 'frameHeight', 'aspectRatio'],
  // `elementId` is the whole binding — the node resolves the saved element from it, and
  // the agent gets ids from the `list_elements` tool. `elementName` is display-only
  // (a label fallback), carried so a projection reads as a name and not a bare uuid.
  element: ['elementId', 'elementName'],
  videoDecode: ['value'],
  frameExtract: ['selector', 'timestampSec', 'outputWidth', 'quality'],
  nanoGen: ['model', 'positivePrompt', 'aspectRatio', 'imageSize'],
  // referenceMode is here because it selects which image handles the node HAS —
  // without it an agent asked for first/last frame would wire to ref-images and
  // silently build the wrong shot.
  videoGen: [
    'model',
    'prompt',
    'negativePrompt',
    'aspectRatio',
    'durationSeconds',
    'resolution',
    'referenceMode',
  ],
  veoDirector: [
    'model',
    'prompt',
    'negativePrompt',
    'aspectRatio',
    'durationSeconds',
    'resolution',
    'referenceMode',
  ],
  veoFast: [
    'model',
    'prompt',
    'negativePrompt',
    'aspectRatio',
    'durationSeconds',
    'resolution',
    'referenceMode',
  ],
  omniGen: ['model', 'prompt', 'aspectRatio'],
  extendVideo: ['prompt'],
  timelineEditor: [
    'outputFormat',
    'items',
    'overlayTracks',
    'exportPresetId',
    'markers',
    'captionsEnabled',
    'agentRenderRequest',
  ],
  hyperframesAgent: [
    'model',
    'prompt',
    'aspectRatio',
    'durationSeconds',
    'resolution',
    'status',
    'revisionNumber',
  ],
  plannerDraft: [
    'mode',
    'format',
    'targetDraftId',
    'caption',
    'dayId',
    'timeOfDay',
    'platform',
    'platformAccountId',
  ],
  // Only the schedule choice. A confirmation is a human act bound to what the human was
  // shown, so nothing an agent writes onto this node can stand in for one.
  organicPublish: ['schedule'],
  paidPublisher: ['format', 'adAccountId', 'campaignId', 'adsetId', 'targetAdId'],
  apiRender: [
    'templateKey',
    'templateName',
    'contractHash',
    'variableDefinitions',
    'variables',
    'delivery',
    'status',
  ],
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
  version_ref?: string;
}

export interface ProjectedTruncation {
  nodes_omitted: number;
  edges_omitted: number;
}

/** Present when the projection was scoped — the viewport, not the whole canvas. */
export interface ProjectedScope {
  focus: string[];
  hops: number;
  nodes_in_scope: number;
}

export interface ProjectedGraph {
  node_count: number;
  edge_count: number;
  node_types: Record<string, number>;
  nodes: ProjectedNode[];
  wiring: string[];
  attachments: ProjectedAttachment[];
  truncated?: ProjectedTruncation;
  scope?: ProjectedScope;
}

interface ProjectionInput {
  nodes: Array<GraphNodeLike & { type?: string }>;
  edges: GraphEdgeLike[];
}

export interface ProjectionScopeOptions {
  /** Node ids to centre the viewport on. Unknown ids are ignored. */
  focus?: string[];
  /** How many wiring hops out from the focus to include (undirected). Default 1. */
  hops?: number;
  /** Case-insensitive match on id, type, label, and free-text config → focus set. */
  query?: string;
}

const SCOPE_TEXT_KEYS = ['label', 'value', 'prompt', 'positivePrompt', 'fileName'] as const;

/**
 * Find the node ids a natural-language locator refers to — "the publish node",
 * "hero" — without projecting any config. The cheap first hop on a big canvas.
 */
export function findNodeIds(graph: ProjectionInput, query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return graph.nodes
    .filter((node) => {
      if (node.id.toLowerCase().includes(needle)) return true;
      if ((node.type ?? '').toLowerCase().includes(needle)) return true;
      const data = node.data ?? {};
      return SCOPE_TEXT_KEYS.some((key) => {
        const value = data[key];
        return typeof value === 'string' && value.toLowerCase().includes(needle);
      });
    })
    .map((node) => node.id);
}

/**
 * The subgraph within `hops` undirected wiring hops of `focus`. Edges are kept
 * only when BOTH endpoints are in scope, so scoped wiring never dangles.
 */
export function selectSubgraph(
  graph: ProjectionInput,
  focus: string[],
  hops: number,
): ProjectionInput {
  const known = new Set(graph.nodes.map((n) => n.id));
  let frontier = new Set(focus.filter((id) => known.has(id)));
  const inScope = new Set(frontier);

  for (let hop = 0; hop < hops && frontier.size > 0; hop += 1) {
    const next = new Set<string>();
    for (const edge of graph.edges) {
      if (frontier.has(edge.source) && !inScope.has(edge.target)) next.add(edge.target);
      if (frontier.has(edge.target) && !inScope.has(edge.source)) next.add(edge.source);
    }
    for (const id of next) inScope.add(id);
    frontier = next;
  }

  return {
    nodes: graph.nodes.filter((n) => inScope.has(n.id)),
    edges: graph.edges.filter((e) => inScope.has(e.source) && inScope.has(e.target)),
  };
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

const MAX_PROJECTED_TIMELINE_ITEMS = 40;

// A batch is capped at 100 items and each one can carry a signed URL and storage
// coordinates. The agent needs to know WHAT is in the batch and HOW MANY — never the
// bytes-level identity of every item.
const MAX_PROJECTED_BATCH_ITEMS = 20;

function projectBatchItem(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  // `url` / `storageBucket` / `storagePath` are deliberately absent: they are re-signed
  // on canvas open and are exactly the noise this projection exists to strip.
  for (const key of ['id', 'kind', 'label', 'value', 'assetId']) {
    if (isEmpty(item[key])) continue;
    projected[key] =
      key === 'value' && typeof item[key] === 'string' ? capText(item[key]) : item[key];
  }
  return Object.keys(projected).length > 0 ? projected : undefined;
}

function projectTimelineItem(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  for (const key of [
    'id',
    'order',
    'sourceNodeId',
    'kind',
    'trimStartSec',
    'trimEndSec',
    'durationSec',
    'muteAudio',
    'volume',
    'fadeInSec',
    'fadeOutSec',
    'transition',
    'startSec',
  ]) {
    if (!isEmpty(item[key])) projected[key] = item[key];
  }
  if (item.effects && typeof item.effects === 'object') {
    const effects = item.effects as Record<string, unknown>;
    const compactEffects: Record<string, unknown> = {};
    for (const key of [
      'opacity',
      'adjustments',
      'filterPreset',
      'transform',
      'flipH',
      'flipV',
      'blendMode',
      'kenBurns',
      'speed',
    ]) {
      if (!isEmpty(effects[key])) compactEffects[key] = effects[key];
    }
    if (Object.keys(compactEffects).length > 0) projected.effects = compactEffects;
    if (Array.isArray(effects.keyframes) && effects.keyframes.length > 0) {
      projected.keyframeCount = effects.keyframes.length;
    }
    if (Array.isArray(effects.text) && effects.text.length > 0) {
      projected.textOverlayCount = effects.text.length;
    }
  }
  return Object.keys(projected).length > 0 ? projected : undefined;
}

// The initial snapshot carries stable editor ids and exact cut facts, but caps
// large timelines. Full transcripts and the complete document stay behind
// inspect_video_editor so ordinary Canvas composition remains token-lean.
const CONFIG_TRANSFORMS: Record<string, (value: unknown) => unknown> = {
  // The cap SAYS it engaged. A silently sliced list reads downstream as the whole batch,
  // and "how many items" is the number that decides how much a run costs.
  'batch.items': (value) => {
    if (!Array.isArray(value)) return undefined;
    const projected = value
      .slice(0, MAX_PROJECTED_BATCH_ITEMS)
      .map(projectBatchItem)
      .filter((item): item is Record<string, unknown> => Boolean(item));
    const omitted = value.length - projected.length;
    return omitted > 0 ? [...projected, { items_omitted: omitted }] : projected;
  },
  'timelineEditor.items': (value) => {
    if (!Array.isArray(value)) return undefined;
    return value
      .slice(0, MAX_PROJECTED_TIMELINE_ITEMS)
      .map(projectTimelineItem)
      .filter((item): item is Record<string, unknown> => Boolean(item));
  },
  'timelineEditor.overlayTracks': (value) => {
    if (!Array.isArray(value)) return undefined;
    return value.slice(0, 8).flatMap((track) => {
      if (!track || typeof track !== 'object') return [];
      const record = track as Record<string, unknown>;
      if (typeof record.id !== 'string') return [];
      const items = Array.isArray(record.items)
        ? record.items
            .slice(0, MAX_PROJECTED_TIMELINE_ITEMS)
            .map(projectTimelineItem)
            .filter((item): item is Record<string, unknown> => Boolean(item))
        : [];
      return [{ id: record.id, items }];
    });
  },
};

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
    const transform = CONFIG_TRANSFORMS[`${type}.${key}`];
    if (transform) value = transform(value);
    if (isEmpty(value)) continue;
    config[key] = value;
  }
  if (type === 'timelineEditor') {
    const document = timelineAuthoringDocumentSchema.safeParse({
      items: data.items ?? [],
      ...(data.overlayTracks !== undefined ? { overlayTracks: data.overlayTracks } : {}),
      ...(data.exportPresetId !== undefined ? { exportPresetId: data.exportPresetId } : {}),
      ...(data.markers !== undefined ? { markers: data.markers } : {}),
      ...(data.captionsEnabled !== undefined ? { captionsEnabled: data.captionsEnabled } : {}),
      ...(data.captionCues !== undefined ? { captionCues: data.captionCues } : {}),
      ...(data.captionWords !== undefined ? { captionWords: data.captionWords } : {}),
      ...(data.captionStyle !== undefined ? { captionStyle: data.captionStyle } : {}),
    });
    if (document.success) {
      config.documentFingerprint = timelineDocumentFingerprint(document.data);
    }
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

const OUTPUT_IMAGE_TYPES = new Set(['nanoGen']);
const OUTPUT_VIDEO_TYPES = new Set([
  'videoGen',
  'veoDirector',
  'veoFast',
  'extendVideo',
  'timelineEditor',
  'hyperframesAgent',
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
      version_ref: typeof data.assetVersionId === 'string' ? data.assetVersionId : undefined,
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
      version_ref: typeof data.assetVersionId === 'string' ? data.assetVersionId : undefined,
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
      version_ref: typeof data.assetVersionId === 'string' ? data.assetVersionId : undefined,
    };
  }

  return undefined;
}

export function projectGraphForAgent(
  graph: ProjectionInput,
  scopeOptions?: ProjectionScopeOptions,
): ProjectedGraph {
  // Whole-graph facts are computed BEFORE any scoping: a scoped viewport must
  // never mislead the agent about the size of the canvas it is editing.
  const nodeTypes: Record<string, number> = {};
  for (const node of graph.nodes) {
    const type = node.type ?? 'unknown';
    nodeTypes[type] = (nodeTypes[type] ?? 0) + 1;
  }
  const totalNodes = graph.nodes.length;
  const totalEdges = graph.edges.length;

  let scoped = graph;
  let scope: ProjectedScope | undefined;
  if (scopeOptions) {
    const fromQuery = scopeOptions.query ? findNodeIds(graph, scopeOptions.query) : [];
    const focus = [...new Set([...(scopeOptions.focus ?? []), ...fromQuery])];
    if (focus.length > 0) {
      const hops = Math.max(0, Math.min(scopeOptions.hops ?? 1, 3));
      scoped = selectSubgraph(graph, focus, hops);
      scope = { focus, hops, nodes_in_scope: scoped.nodes.length };
    }
  }

  const window = scoped.nodes.slice(0, MAX_PROJECTED_NODES);
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

  const wiring = scoped.edges
    .slice(0, MAX_PROJECTED_WIRING)
    .map((e) => `${e.source}.${e.sourceHandle ?? 'out'} → ${e.target}.${e.targetHandle ?? 'in'}`);

  // `truncated` reports what the WINDOW dropped from what was requested (the
  // scope if one engaged, else the whole graph) — scoping itself is not
  // truncation, and `scope` already says how much of the canvas is in view.
  const nodesOmitted = scoped.nodes.length - nodes.length;
  const edgesOmitted = scoped.edges.length - wiring.length;

  const projection: ProjectedGraph = {
    node_count: totalNodes,
    edge_count: totalEdges,
    node_types: nodeTypes,
    nodes,
    wiring,
    attachments,
  };
  if (nodesOmitted > 0 || edgesOmitted > 0) {
    projection.truncated = { nodes_omitted: nodesOmitted, edges_omitted: edgesOmitted };
  }
  if (scope) projection.scope = scope;
  return projection;
}

// ---------------------------------------------------------------------------
// Outline + diagnosis — the two reads that scale past MAX_PROJECTED_NODES
// ---------------------------------------------------------------------------

// Past ~60 nodes a full projection serves an arbitrary slice of the canvas and calls
// it the canvas. An OUTLINE serves all of it instead: identity, type and degree, no
// config and no wiring strings. One line is ~10 tokens against a projected node's
// ~100, so the whole shape of a 200-node workflow costs less than a third of a
// truncated read of it — and the agent can then focus a second, scoped hop on the
// part that matters. The cap is a backstop, not the working limit.
export const MAX_OUTLINED_NODES = 250;

export interface OutlinedGraph {
  node_count: number;
  edge_count: number;
  node_types: Record<string, number>;
  /** `<id> <type> ["label"] <in-degree>→<out-degree>`, one line per node. */
  outline: string[];
  truncated?: ProjectedTruncation;
}

function countNodeTypes(nodes: ProjectionInput['nodes']): Record<string, number> {
  const nodeTypes: Record<string, number> = {};
  for (const node of nodes) {
    const type = node.type ?? 'unknown';
    nodeTypes[type] = (nodeTypes[type] ?? 0) + 1;
  }
  return nodeTypes;
}

/**
 * Identity and shape only. Deliberately NOT a projection with fields removed: the
 * whole point is that no per-node config is read at all, so the cost per node is
 * flat regardless of how much prompt text a node carries.
 */
export function outlineGraphForAgent(graph: ProjectionInput): OutlinedGraph {
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const edge of graph.edges) {
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const window = graph.nodes.slice(0, MAX_OUTLINED_NODES);
  const outline = window.map((node) => {
    const data = node.data ?? {};
    const label =
      typeof data.label === 'string' && data.label.trim() ? ` "${capText(data.label)}"` : '';
    return `${node.id} ${node.type ?? 'unknown'}${label} ${inDegree.get(node.id) ?? 0}→${outDegree.get(node.id) ?? 0}`;
  });

  const result: OutlinedGraph = {
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    node_types: countNodeTypes(graph.nodes),
    outline,
  };
  const nodesOmitted = graph.nodes.length - outline.length;
  if (nodesOmitted > 0) result.truncated = { nodes_omitted: nodesOmitted, edges_omitted: 0 };
  return result;
}

export interface CanvasGraphIssue {
  node_id?: string;
  edge_id?: string;
  code: string;
  issue: string;
}

export interface GraphDiagnosis {
  node_count: number;
  edge_count: number;
  issues: CanvasGraphIssue[];
  issues_omitted?: number;
}

export const MAX_REPORTED_GRAPH_ISSUES = 20;

// The fields whose absence leaves a node inert — it renders nothing and drops every
// edge wired to it, silently. Each is the node's whole binding, not a preference, and
// none of them is an edge-level fault, so `validateWorkflowGraph` cannot see them.
const REQUIRED_BINDING_BY_TYPE: Partial<Record<StudioNodeType, string>> = {
  action: 'actionId',
  export: 'format',
  element: 'elementId',
  designRef: 'section',
  batch: 'itemType',
};

// Which nodes are USELESS unwired, as opposed to merely terminal. A generator with no
// consumer is the normal end of a workflow — the human runs it and takes the image — so
// flagging it would fire on nearly every healthy canvas, and a diagnostic that fires on
// healthy canvases is noise the agent learns to ignore. `producesMedia` is exactly the
// line: a node that yields media can be the deliverable, a node that does not (a prompt,
// an unwired reference, a router, a batch) does nothing at all until something reads it.
function isMidChainType(type: string): boolean {
  if (type === 'note' || type === 'export') return false;
  const definition: StudioNodeDefinition | undefined = STUDIO_NODE_REGISTRY[type as StudioNodeType];
  return definition !== undefined && definition.sink === undefined && !definition.producesMedia;
}

/**
 * The cheap answer to "why won't my canvas run".
 *
 * The edge-level half — cycles, dangling edges, incompatible or over-capacity
 * connections, missing prompts — is `validateWorkflowGraph`, the same check the builder
 * runs, so a diagnosis can never disagree with what a write would reject. Added here are
 * only the two faults that are invisible to it: a node whose binding was never set, and
 * a mid-chain node nothing consumes. Both are legal graphs that quietly produce nothing.
 */
export function diagnoseGraphForAgent(graph: ProjectionInput): GraphDiagnosis {
  const issues: CanvasGraphIssue[] = validateWorkflowGraph({
    nodes: graph.nodes,
    edges: graph.edges,
  }).issues.map((issue) => ({
    ...(issue.nodeId ? { node_id: issue.nodeId } : {}),
    ...(issue.edgeId ? { edge_id: issue.edgeId } : {}),
    code: issue.code,
    issue: issue.message,
  }));

  const outgoing = new Set(graph.edges.map((edge) => edge.source));

  for (const node of graph.nodes) {
    const type = node.type ?? 'unknown';
    const data = node.data ?? {};

    const binding = REQUIRED_BINDING_BY_TYPE[type as StudioNodeType];
    if (binding && isEmpty(data[binding])) {
      // A batch carrying items already has its modality from the first item's `kind`,
      // so an itemType-less batch is only inert while it is also empty.
      const inert = type !== 'batch' || !Array.isArray(data.items) || data.items.length === 0;
      if (inert) {
        issues.push({
          node_id: node.id,
          code: 'missing_binding',
          issue: `${binding} is not set — the node is inert and drops every edge wired to it`,
        });
      }
    }

    if (isMidChainType(type) && !outgoing.has(node.id)) {
      issues.push({
        node_id: node.id,
        code: 'nothing_consumes',
        issue: 'nothing consumes it — wire it onward or remove it',
      });
    }
  }

  const result: GraphDiagnosis = {
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    issues: issues.slice(0, MAX_REPORTED_GRAPH_ISSUES),
  };
  if (issues.length > MAX_REPORTED_GRAPH_ISSUES) {
    result.issues_omitted = issues.length - MAX_REPORTED_GRAPH_ISSUES;
  }
  return result;
}
