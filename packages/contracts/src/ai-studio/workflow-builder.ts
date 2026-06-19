import {
  STUDIO_NODE_TYPES,
  type StudioNodeType,
  type GraphNodeLike,
  type GraphEdgeLike,
  type WorkflowMediaKind,
  createNodeData,
  getAllowedSourceHandles,
  getAllowedTargetHandles,
  isValidConnection,
} from "./workflow-graph";

// Construct + surgically edit AI Studio workflow graphs from a structured spec,
// auto-resolving valid handles, laying out positions, and validating against the
// canonical canvas rules in workflow-graph.ts.

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  style?: Record<string, number>;
  width?: number;
  height?: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: Record<string, unknown>;
}

const COLUMN_SPACING = 360;
const ROW_SPACING = 220;

const isStudioNodeType = (type: string): type is StudioNodeType =>
  (STUDIO_NODE_TYPES as readonly string[]).includes(type);

function inferDataType(sourceHandle?: string | null): string {
  switch (sourceHandle) {
    case "image":
    case "video":
    case "audio":
    case "document":
      return sourceHandle;
    default:
      return "text";
  }
}

// ---------------------------------------------------------------------------
// Connection resolution
// ---------------------------------------------------------------------------

export type ResolveResult =
  | { ok: true; sourceHandle: string; targetHandle: string }
  | { ok: false; reason: string };

function orderCandidates(candidates: string[], roleHint?: string): string[] {
  if (!roleHint) return candidates;
  const score = (handle: string): number => {
    if (handle === roleHint) return 0;
    if (handle.includes(roleHint) || roleHint.includes(handle)) return 1;
    return 2;
  };
  return [...candidates].sort((a, b) => score(a) - score(b));
}

export function resolveConnection(
  sourceNode: GraphNodeLike,
  targetNode: GraphNodeLike,
  opts: { roleHint?: string; edges?: GraphEdgeLike[] } = {},
): ResolveResult {
  const sourceHandles = getAllowedSourceHandles(sourceNode);
  if (sourceHandles.length === 0) {
    return { ok: false, reason: `node ${sourceNode.id} (${sourceNode.type}) produces no output` };
  }
  const sourceHandle = sourceHandles[0];
  const candidates = orderCandidates(getAllowedTargetHandles(targetNode), opts.roleHint);
  const edges = opts.edges ?? [];

  for (const targetHandle of candidates) {
    const valid = isValidConnection(
      { source: sourceNode.id, sourceHandle, target: targetNode.id, targetHandle },
      edges,
      [sourceNode, targetNode],
    );
    if (valid) return { ok: true, sourceHandle, targetHandle };
  }

  return {
    ok: false,
    reason: `no compatible handle from ${sourceNode.type ?? "?"} to ${targetNode.type ?? "?"}${opts.roleHint ? ` (role ${opts.roleHint})` : ""}`,
  };
}

function makeEdge(source: string, sourceHandle: string, target: string, targetHandle: string): WorkflowEdge {
  return {
    id: `e:${source}:${target}:${targetHandle}`,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: "dataType",
    className: "studio-edge",
    data: { dataType: inferDataType(sourceHandle), pathType: "button" },
  };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function autoLayout(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]));

  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
      const next = (layer.get(edge.source) ?? 0) + 1;
      if (next > (layer.get(edge.target) ?? 0)) {
        layer.set(edge.target, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const rowByLayer = new Map<number, number>();
  return nodes.map((node) => {
    const depth = layer.get(node.id) ?? 0;
    const row = rowByLayer.get(depth) ?? 0;
    rowByLayer.set(depth, row + 1);
    return { ...node, position: { x: depth * COLUMN_SPACING, y: row * ROW_SPACING } };
  });
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface NodeSpec {
  ref: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface ConnectSpec {
  from_ref: string;
  to_ref: string;
  role?: string;
}

export interface BuildResult {
  graph: WorkflowGraph;
  warnings: string[];
  errors: string[];
}

function makeNode(id: string, type: string, dataOverrides: Record<string, unknown> = {}): WorkflowNode {
  const { data, style } = createNodeData(type as StudioNodeType, dataOverrides);
  const node: WorkflowNode = { id, type, position: { x: 0, y: 0 }, data };
  if (style) {
    node.style = style;
    node.width = style.width;
    node.height = style.height;
  }
  return node;
}

export function buildWorkflowGraph(
  nodeSpecs: NodeSpec[],
  connectSpecs: ConnectSpec[] = [],
  opts: { metadata?: Record<string, unknown> } = {},
): BuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodes: WorkflowNode[] = [];
  const seen = new Set<string>();

  for (const spec of nodeSpecs) {
    if (seen.has(spec.ref)) {
      errors.push(`duplicate node ref "${spec.ref}"`);
      continue;
    }
    if (!isStudioNodeType(spec.type)) {
      errors.push(`unknown node type "${spec.type}" for ref "${spec.ref}"`);
      continue;
    }
    seen.add(spec.ref);
    nodes.push(makeNode(spec.ref, spec.type, spec.data));
  }

  const edges: WorkflowEdge[] = [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const spec of connectSpecs) {
    const from = nodeById.get(spec.from_ref);
    const to = nodeById.get(spec.to_ref);
    if (!from || !to) {
      errors.push(`connection references missing node: ${spec.from_ref} → ${spec.to_ref}`);
      continue;
    }
    const resolved = resolveConnection(from, to, { roleHint: spec.role, edges });
    if (!resolved.ok) {
      errors.push(resolved.reason);
      continue;
    }
    edges.push(makeEdge(from.id, resolved.sourceHandle, to.id, resolved.targetHandle));
  }

  const graph: WorkflowGraph = { nodes: autoLayout(nodes, edges), edges };
  if (opts.metadata) graph.metadata = opts.metadata;
  return { graph, warnings, errors };
}

// ---------------------------------------------------------------------------
// Surgical edits
// ---------------------------------------------------------------------------

export interface AttachMediaInput {
  assetId?: string;
  bucket: string;
  storagePath: string;
  fileName?: string;
  mediaKind: WorkflowMediaKind;
  referenceType?: string;
}

export type WorkflowEditOp =
  | { op: "add_node"; ref: string; type: string; data?: Record<string, unknown> }
  | { op: "remove_node"; id: string }
  | { op: "update_node"; id: string; data: Record<string, unknown> }
  | { op: "connect"; from: string; to: string; role?: string }
  | { op: "disconnect"; from?: string; to?: string; targetHandle?: string }
  | { op: "rewire"; from: string; to: string; role?: string }
  | { op: "attach_media"; id: string; media: AttachMediaInput }
  | { op: "detach_media"; id: string }
  | { op: "rename"; id: string; label: string };

export interface ApplyResult {
  graph: WorkflowGraph;
  errors: string[];
}

const REFERENCE_NODE_KIND: Record<string, WorkflowMediaKind> = {
  image: "image",
  video: "video",
  audio: "audio",
  document: "document",
};

const MEDIA_DATA_KEYS = ["sourcePath", "bucket", "sourceUrl", "fileName", "referenceType"];

export function applyOps(graph: WorkflowGraph, ops: WorkflowEditOp[]): ApplyResult {
  let nodes: WorkflowNode[] = [...graph.nodes];
  let edges: WorkflowEdge[] = [...graph.edges];
  const errors: string[] = [];

  const replaceNode = (id: string, mutate: (node: WorkflowNode) => WorkflowNode): boolean => {
    const index = nodes.findIndex((n) => n.id === id);
    if (index === -1) return false;
    nodes = nodes.map((n, i) => (i === index ? mutate({ ...n, data: { ...n.data } }) : n));
    return true;
  };

  for (const op of ops) {
    switch (op.op) {
      case "add_node": {
        if (nodes.some((n) => n.id === op.ref)) {
          errors.push(`node "${op.ref}" already exists`);
          break;
        }
        if (!isStudioNodeType(op.type)) {
          errors.push(`unknown node type "${op.type}"`);
          break;
        }
        nodes = [...nodes, makeNode(op.ref, op.type, op.data)];
        break;
      }
      case "remove_node": {
        if (!nodes.some((n) => n.id === op.id)) {
          errors.push(`node "${op.id}" not found`);
          break;
        }
        nodes = nodes.filter((n) => n.id !== op.id);
        edges = edges.filter((e) => e.source !== op.id && e.target !== op.id);
        break;
      }
      case "update_node": {
        if (!replaceNode(op.id, (n) => ({ ...n, data: { ...n.data, ...op.data } }))) {
          errors.push(`node "${op.id}" not found`);
        }
        break;
      }
      case "rename": {
        if (!replaceNode(op.id, (n) => ({ ...n, data: { ...n.data, label: op.label } }))) {
          errors.push(`node "${op.id}" not found`);
        }
        break;
      }
      case "connect": {
        const result = connectNodes(nodes, edges, op.from, op.to, op.role);
        if (!result.ok) errors.push(result.reason);
        else edges = [...edges, result.edge];
        break;
      }
      case "rewire": {
        edges = edges.filter((e) => e.source !== op.from);
        const result = connectNodes(nodes, edges, op.from, op.to, op.role);
        if (!result.ok) errors.push(result.reason);
        else edges = [...edges, result.edge];
        break;
      }
      case "disconnect": {
        if (op.from === undefined && op.to === undefined && op.targetHandle === undefined) {
          errors.push("disconnect requires at least one of from / to / targetHandle");
          break;
        }
        edges = edges.filter(
          (e) =>
            !(
              (op.from === undefined || e.source === op.from) &&
              (op.to === undefined || e.target === op.to) &&
              (op.targetHandle === undefined || e.targetHandle === op.targetHandle)
            ),
        );
        break;
      }
      case "attach_media": {
        const node = nodes.find((n) => n.id === op.id);
        if (!node) {
          errors.push(`node "${op.id}" not found`);
          break;
        }
        const expected = REFERENCE_NODE_KIND[node.type];
        if (!expected) {
          errors.push(`node "${op.id}" (${node.type}) cannot hold an attached asset`);
          break;
        }
        if (expected !== op.media.mediaKind) {
          errors.push(`cannot attach ${op.media.mediaKind} to a ${node.type} node`);
          break;
        }
        replaceNode(op.id, (n) => ({
          ...n,
          data: {
            ...n.data,
            sourcePath: op.media.storagePath,
            bucket: op.media.bucket,
            fileName: op.media.fileName,
            ...(node.type === "image" ? { referenceType: op.media.referenceType ?? "default" } : {}),
          },
        }));
        break;
      }
      case "detach_media": {
        if (!replaceNode(op.id, (n) => ({ ...n, data: dropKeys(n.data, MEDIA_DATA_KEYS) }))) {
          errors.push(`node "${op.id}" not found`);
        }
        break;
      }
    }
  }

  const graphOut: WorkflowGraph = { nodes, edges };
  if (graph.metadata) graphOut.metadata = graph.metadata;
  return { graph: graphOut, errors };
}

function connectNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  fromId: string,
  toId: string,
  role?: string,
): { ok: true; edge: WorkflowEdge } | { ok: false; reason: string } {
  const from = nodes.find((n) => n.id === fromId);
  const to = nodes.find((n) => n.id === toId);
  if (!from || !to) return { ok: false, reason: `connect references missing node: ${fromId} → ${toId}` };
  const resolved = resolveConnection(from, to, { roleHint: role, edges });
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  return { ok: true, edge: makeEdge(from.id, resolved.sourceHandle, to.id, resolved.targetHandle) };
}

function dropKeys(data: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next = { ...data };
  for (const key of keys) delete next[key];
  return next;
}

// ---------------------------------------------------------------------------
// Whole-graph validation
// ---------------------------------------------------------------------------

export interface GraphIssue {
  code: "unknown_node_type" | "dangling_edge" | "invalid_connection";
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: GraphIssue[];
}

export function validateWorkflowGraph(graph: { nodes: GraphNodeLike[]; edges: GraphEdgeLike[] }): ValidationResult {
  const issues: GraphIssue[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  for (const node of graph.nodes) {
    if (!node.type || !(STUDIO_NODE_TYPES as readonly string[]).includes(node.type)) {
      issues.push({ code: "unknown_node_type", message: `unknown node type "${node.type}"`, nodeId: node.id });
    }
  }

  graph.edges.forEach((edge, index) => {
    const edgeId = edge.id ?? `edge[${index}]`;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ code: "dangling_edge", message: `edge ${edgeId} references a missing node`, edgeId });
      return;
    }
    const others = graph.edges.filter((e) => e !== edge);
    if (!isValidConnection(edge, others, graph.nodes)) {
      issues.push({
        code: "invalid_connection",
        message: `edge ${edgeId} (${edge.source} → ${edge.target}.${edge.targetHandle ?? "?"}) is not a valid connection`,
        edgeId,
      });
    }
  });

  return { ok: issues.length === 0, issues };
}
