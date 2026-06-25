"use client";

import type { Edge } from '@xyflow/react';
import { TIMELINE_MEDIA_INPUT_HANDLE } from "@continuum/contracts";
import { StudioNode, ImageNodeData } from "../types";
import { NodeOutput } from "../types/execution";
import { useStudioStore } from "../stores/useStudioStore";
import { buildExtendVideoPayload, buildNanoGenPayload, buildVeoPayload, buildEnrichPayload, toBackendExtendVideoPayload, toBackendPayload } from "./buildNodePayload";
import { buildDataUrl, parseDataUrl } from "./dataUrl";
import { compositeImages } from "./compositeImages";
import { useWorkflowExecution } from "../hooks/useWorkflowExecution";
import { readServerSentEvents } from "@/lib/sse/readServerSentEvents";
import { resolveVideoGeneratorModel, isVideoGeneratorNodeType } from "./videoModel";
import { resolveClipSources } from "./splice/resolveClipSources";
import { checkSpliceSupport } from "./splice/webcodecsSupport";
import { runSpliceInWorker } from "../workers/spliceWorkerClient";
import type { ClipSlot, VideoEditorNodeData, TimelineItem, TimelineEditorNodeData } from "../types";
import { registerCanvasOutput } from "@/lib/creative-assets/registerCanvasAsset";
import { rehydrateWorkflowMediaNodes } from "./rehydrateWorkflowMedia";

type ExecutorControls = ReturnType<typeof useWorkflowExecution>;

const MAX_CONCURRENT_EXECUTIONS = 3;
const MEDIA_NODE_TYPES = new Set(['nanoGen', 'videoGen', 'veoDirector', 'veoFast', 'extendVideo', 'videoEditor', 'timelineEditor']);

const isMediaNodeType = (nodeType: string | undefined): nodeType is string =>
  typeof nodeType === 'string' && MEDIA_NODE_TYPES.has(nodeType);

type NodeReadiness = {
  ready: boolean;
  reason?: string;
  // The Video Editor (timelineEditor) is a manual break-point: it becomes
  // "awaiting" once its inputs resolve but a human hasn't rendered yet. The
  // scheduler parks awaiting nodes (and their descendants) instead of failing
  // them, so the run halts cleanly at the gate.
  awaiting?: boolean;
};

const normalizeText = (value?: string | null): string | undefined => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length ? trimmed : undefined;
};

const getIncomingEdges = (edges: Edge[], nodeId: string) =>
  edges.filter((edge) => edge.target === nodeId);

const stringExternalInputHandles = new Set(['image', 'audio', 'video', 'document']);

const getStringExternalInputEdges = (edges: Edge[], nodeId: string) =>
  edges.filter(
    (edge) => edge.target === nodeId && stringExternalInputHandles.has(edge.targetHandle ?? '')
  );

const resolveTextInput = (
  edge: Edge,
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
  allEdges: Edge[]
): string | undefined => {
  const output = resolvedOutputs.get(edge.source);
  if (output?.type === 'text') {
    return normalizeText(output.value);
  }

  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'string') {
    const sourceRequiresExecution = getStringExternalInputEdges(allEdges, sourceNode.id).length > 0;
    if (sourceRequiresExecution) {
      const existingValue = normalizeText((sourceNode.data as any).value);
      if (existingValue) {
        return existingValue;
      }
      return undefined;
    }
    return normalizeText((sourceNode.data as any).value);
  }

  if (sourceNode?.type === 'videoDecode') {
    return normalizeText((sourceNode.data as any).value);
  }

  return undefined;
};

const isHttpUrl = (value?: string | null): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim());

// Readiness/availability check for an image reference. A signed URL counts as
// available (the Backend resolves it to bytes), so base64 may be empty.
const resolveImageInput = (
  edge: Edge,
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>
): { base64: string; mimeType: string } | undefined => {
  const output = resolvedOutputs.get(edge.source);
  if (output?.type === 'image' && (output.base64 || isHttpUrl(output.url))) {
    return { base64: output.base64 ?? '', mimeType: output.mimeType };
  }

  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'image') {
    const value = (sourceNode.data as any).image as string | undefined;
    const parsed = parseDataUrl(value);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
    if (isHttpUrl(value)) {
      return { base64: '', mimeType: 'image/png' };
    }
  }

  return undefined;
};

const resolveVideoInput = (
  edge: Edge,
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
  options?: { allowUri?: boolean }
): { base64: string; mimeType: string } | { uri: string } | undefined => {
  const allowUri = Boolean(options?.allowUri);
  const output = resolvedOutputs.get(edge.source);
  if (output?.type === 'video' && output.url) {
    const parsed = parseDataUrl(output.url);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
    if (allowUri && output.url.trim()) {
      return { uri: output.url.trim() };
    }
  }

  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'video') {
    const rawVideo = (sourceNode.data as any).video as string | undefined;
    const parsed = parseDataUrl(rawVideo);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
    if (allowUri && typeof rawVideo === 'string' && rawVideo.trim()) {
      return { uri: rawVideo.trim() };
    }
  }

  if (allowUri && (isVideoGeneratorNodeType(sourceNode?.type) || sourceNode?.type === 'extendVideo' || sourceNode?.type === 'videoEditor')) {
    const generatedVideo = (sourceNode.data as any).generatedVideo as string | undefined;
    const generatedVideoUrl = (sourceNode.data as any).generatedVideoUrl as string | undefined;
    const parsed = parseDataUrl(generatedVideo);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
    const fallbackUri = (typeof generatedVideo === 'string' && generatedVideo.trim()) || (typeof generatedVideoUrl === 'string' && generatedVideoUrl.trim());
    if (fallbackUri) {
      return { uri: fallbackUri };
    }
  }

  return undefined;
};

const resolveAudioInput = (
  edge: Edge,
  nodeById: Map<string, StudioNode>
): { base64: string; mimeType: string } | undefined => {
  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'audio') {
    const parsed = parseDataUrl((sourceNode.data as any).audio as string | undefined);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
  }
  return undefined;
};

type ResolvedDocumentEntry = {
  name: string;
  type: 'pdf' | 'txt';
  extractedText?: string;
  sourceUrl?: string;
  sourceDocumentId?: string;
  content?: string;
};

const resolveDocumentInput = (
  edge: Edge,
  nodeById: Map<string, StudioNode>
): ResolvedDocumentEntry[] | undefined => {
  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type !== 'document') return undefined;
  const documents = ((sourceNode.data as any).documents ?? []) as Array<Record<string, unknown>>;
  const validDocuments = documents
    .map((doc): ResolvedDocumentEntry | null => {
      const hasSource =
        (typeof doc.extractedText === 'string' && doc.extractedText.trim()) ||
        (typeof doc.sourceUrl === 'string' && doc.sourceUrl.trim()) ||
        (typeof doc.sourceDocumentId === 'string' && doc.sourceDocumentId.trim()) ||
        (typeof doc.content === 'string' && doc.content.trim());
      if (!hasSource) return null;
      const name = typeof doc.name === 'string' && doc.name.trim() ? doc.name : 'document';
      const type: 'pdf' | 'txt' = doc.type === 'pdf' ? 'pdf' : 'txt';
      return {
        name,
        type,
        extractedText: typeof doc.extractedText === 'string' ? doc.extractedText : undefined,
        sourceUrl: typeof doc.sourceUrl === 'string' ? doc.sourceUrl : undefined,
        sourceDocumentId: typeof doc.sourceDocumentId === 'string' ? doc.sourceDocumentId : undefined,
        content: typeof doc.content === 'string' ? doc.content : undefined,
      };
    })
    .filter((doc): doc is ResolvedDocumentEntry => doc !== null);

  return validDocuments.length > 0 ? validDocuments : undefined;
};

const getPromptValue = (
  node: StudioNode,
  incomingEdges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
  allEdges: Edge[]
): { value?: string; fromEdge: boolean } => {
  const promptHandles = isVideoGeneratorNodeType(node.type) ? ['prompt-in', 'prompt'] : ['prompt'];
  const promptEdges = incomingEdges.filter((edge) => promptHandles.includes(edge.targetHandle ?? ""));

  if (promptEdges.length > 0) {
    const edgePrompt = promptEdges
      .map((edge) => resolveTextInput(edge, resolvedOutputs, nodeById, allEdges))
      .find(Boolean);
    return { value: edgePrompt, fromEdge: true };
  }

  const inlinePrompt =
    node.type === 'nanoGen'
      ? normalizeText((node.data as any).positivePrompt)
      : normalizeText((node.data as any).prompt);

  return { value: inlinePrompt, fromEdge: false };
};

const findMissingOptionalInput = (
  node: StudioNode,
  incomingEdges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
  allEdges: Edge[]
): string | undefined => {
  if (node.type === 'nanoGen') {
    const refEdges = incomingEdges.filter((edge) =>
      ['ref-image', 'ref-images'].includes(edge.targetHandle ?? "")
    );
    for (const edge of refEdges) {
      if (!resolveImageInput(edge, resolvedOutputs, nodeById)) {
        return edge.targetHandle ?? 'ref-images';
      }
    }
    return undefined;
  }

  if (isVideoGeneratorNodeType(node.type)) {
    const videoModel = resolveVideoGeneratorModel(node);
    for (const edge of incomingEdges) {
      const handle = edge.targetHandle ?? "";
      if (handle === 'negative') {
        if (!resolveTextInput(edge, resolvedOutputs, nodeById, allEdges)) {
          return handle;
        }
      } else if (handle === 'ref-image' || handle === 'ref-images') {
        const supportsImageReferences = videoModel !== 'veo-3.1-fast' && videoModel !== 'veo-3.1-lite';
        if (supportsImageReferences && !resolveImageInput(edge, resolvedOutputs, nodeById)) {
          return handle;
        }
      } else if (handle === 'ref-video') {
        if (videoModel === 'kling-omni' && !resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: false })) {
          return handle;
        }
      } else if (handle === 'first-frame' || handle === 'last-frame' || handle.startsWith('frame-')) {
        const supportsFrames = videoModel === 'veo-3.1-fast' || videoModel === 'veo-3.1-lite';
        if (supportsFrames && !resolveImageInput(edge, resolvedOutputs, nodeById)) {
          return handle;
        }
      }
    }
  }

  return undefined;
};

const getNodeReadiness = (
  node: StudioNode,
  edges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
  failedNodes: Set<string>,
  awaitingNodes: Set<string> = new Set()
): NodeReadiness => {
  const incomingEdges = getIncomingEdges(edges, node.id);

  if (node.type === 'string') {
    const externalInputEdges = getStringExternalInputEdges(edges, node.id);
    if (externalInputEdges.length === 0) {
      return normalizeText((node.data as any).value)
        ? { ready: true }
        : { ready: false, reason: 'Missing required prompt' };
    }

    for (const edge of externalInputEdges) {
      const targetHandle = edge.targetHandle ?? '';
      const inputAvailable =
        targetHandle === 'image'
          ? Boolean(resolveImageInput(edge, resolvedOutputs, nodeById))
          : targetHandle === 'audio'
            ? Boolean(resolveAudioInput(edge, nodeById))
            : targetHandle === 'video'
              ? Boolean(resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: false }))
              : targetHandle === 'document'
                ? Boolean(resolveDocumentInput(edge, nodeById))
                : false;

      if (!inputAvailable) {
        return {
          ready: false,
          reason: `Missing connected input for ${targetHandle || 'string input'}`,
        };
      }
    }

    return { ready: true };
  }

  const failedEdge = incomingEdges.find((edge) => failedNodes.has(edge.source));
  if (failedEdge) {
    return { ready: false, reason: 'Upstream dependency failed' };
  }

  // Park anything downstream of a Video Editor gate that is still awaiting a
  // human render, mirroring the failed-dependency propagation above.
  const awaitingEdge = incomingEdges.find((edge) => awaitingNodes.has(edge.source));
  if (awaitingEdge) {
    return { ready: false, awaiting: true, reason: 'Waiting on an upstream Video Editor' };
  }

  if (node.type === 'videoDecode') {
    const videoEdges = incomingEdges.filter((edge) => edge.targetHandle === 'video');
    if (videoEdges.length === 0) {
      return { ready: false, reason: 'Missing required video input' };
    }
    const hasVideo = videoEdges.some((edge) => resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: true }));
    if (!hasVideo) {
      return { ready: false, reason: 'Missing connected input for video' };
    }
    return { ready: true };
  }

  if (node.type === 'extendVideo') {
    const videoEdges = incomingEdges.filter((edge) => edge.targetHandle === 'video');
    if (videoEdges.length === 0) {
      return { ready: false, reason: 'Missing required video input' };
    }
    const hasVideo = videoEdges.some((edge) => resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: true }));
    if (!hasVideo) {
      return { ready: false, reason: 'Missing connected input for video' };
    }

    const promptEdges = incomingEdges.filter((edge) => edge.targetHandle === 'prompt');
    if (promptEdges.length > 0) {
      const promptValue = promptEdges
        .map((edge) => resolveTextInput(edge, resolvedOutputs, nodeById, edges))
        .find(Boolean);
      if (!promptValue) {
        return { ready: false, reason: 'Missing connected input for prompt' };
      }
    }

    return { ready: true };
  }

  if (node.type === 'videoEditor') {
    const slots = ((node.data as VideoEditorNodeData).clipSlots ?? []) as ClipSlot[];
    if (slots.length < 2) {
      return { ready: false, reason: 'Need at least 2 clip slots' };
    }
    for (const slot of slots) {
      const handleId = `clip-${slot.id}`;
      const edge = incomingEdges.find((candidate) => candidate.targetHandle === handleId);
      if (!edge) {
        return { ready: false, reason: `Clip slot ${slot.order + 1} is not connected` };
      }
      if (!resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: true })) {
        return { ready: false, reason: `Clip slot ${slot.order + 1} has no resolvable video` };
      }
    }
    return { ready: true };
  }

  if (node.type === 'timelineEditor') {
    const data = node.data as TimelineEditorNodeData;
    const items = (data.items ?? []) as TimelineItem[];
    const poolEdges = incomingEdges.filter((edge) => (edge.targetHandle ?? '') === TIMELINE_MEDIA_INPUT_HANDLE);
    if (poolEdges.length === 0) {
      return { ready: false, reason: 'Connect at least one clip or image to the Video Editor' };
    }
    // Every placed clip must reference a connected, resolvable pool source.
    for (const item of items) {
      const edge = poolEdges.find((candidate) => candidate.source === item.sourceNodeId);
      if (!edge) {
        return { ready: false, reason: 'A timeline clip references a disconnected source' };
      }
      const hasVideo = Boolean(resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: true }));
      const hasImage = Boolean(resolveImageInput(edge, resolvedOutputs, nodeById));
      if (!hasVideo && !hasImage) {
        return { ready: false, reason: 'A timeline clip has no resolvable media yet' };
      }
    }
    // Hard manual break-point: only "ready" (resumable) once a human has rendered
    // and the clip has been persisted this session. Until then it is "awaiting".
    const committedUrl = data.generatedVideoUrl ?? (typeof data.generatedVideo === 'string' ? data.generatedVideo : undefined);
    if (data.committed && committedUrl) {
      return { ready: true };
    }
    return { ready: false, awaiting: true, reason: 'Awaiting manual edit — open the Video Editor and render' };
  }

  const prompt = getPromptValue(node, incomingEdges, resolvedOutputs, nodeById, edges);
  if (!prompt.value) {
    return {
      ready: false,
      reason: prompt.fromEdge ? 'Missing prompt input' : 'Missing required prompt',
    };
  }

  const missingOptional = findMissingOptionalInput(node, incomingEdges, resolvedOutputs, nodeById, edges);
  if (missingOptional) {
    return { ready: false, reason: `Missing connected input for ${missingOptional}` };
  }

  return { ready: true };
};

const isRunnableNodeType = (nodeType: string | undefined): boolean =>
  nodeType === 'string' || nodeType === 'videoDecode' || isMediaNodeType(nodeType);

// Runnable leaf nodes reachable downstream of `startId`. Used to resume a run
// after a Video Editor break-point: targeting each leaf re-runs the parked
// downstream chain (via each leaf's upstream closure) while reusing the now-
// committed gate and any already-completed upstream generators.
export const collectDownstreamLeafIds = (
  startId: string,
  edges: Edge[],
  nodeById: Map<string, { type?: string }>,
): string[] => {
  const runnableTargets = (id: string): string[] =>
    edges
      .filter((edge) => edge.source === id)
      .map((edge) => edge.target)
      .filter((target) => isRunnableNodeType(nodeById.get(target)?.type));

  const leaves = new Set<string>();
  const seen = new Set<string>();
  const stack = [...runnableTargets(startId)];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const next = runnableTargets(current);
    if (next.length === 0) leaves.add(current);
    else stack.push(...next);
  }
  return [...leaves];
};

// Walk edges backward from the target to gather every node that feeds it
// (directly or transitively). Running a single node must also execute this
// dependency closure so its prompt/reference inputs are produced — a whole-graph
// run scoped to the target's subgraph rather than the target in isolation.
const collectUpstreamClosure = (targetNodeId: string, edges: Edge[]): Set<string> => {
  const ancestors = new Set<string>();
  const queue = [targetNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.target !== current || ancestors.has(edge.source)) continue;
      ancestors.add(edge.source);
      queue.push(edge.source);
    }
  }
  return ancestors;
};

const resolveExecutableNodes = (
  nodes: StudioNode[],
  edges: Edge[],
  targetNodeId?: string
): StudioNode[] => {
  if (!targetNodeId) return nodes.filter((node) => isMediaNodeType(node.type));
  const target = nodes.find((node) => node.id === targetNodeId);
  if (!target || !isRunnableNodeType(target.type)) return [];
  const scope = collectUpstreamClosure(targetNodeId, edges);
  scope.add(targetNodeId);
  return nodes.filter((node) => scope.has(node.id) && isRunnableNodeType(node.type));
};

// Mirrors the pre-populate condition below: a node whose previous output can be
// reused as-is (so a targeted run does not re-run finished upstream nodes).
const nodeHasUsableOutput = (node: StudioNode): boolean => {
  const data = node.data as Record<string, unknown>;
  if (node.type === 'string' || node.type === 'videoDecode') {
    return normalizeText(data.value as string | undefined) !== undefined;
  }
  if (Boolean(data.error) || !data.isComplete) return false;
  return Boolean(data.generatedImage || data.generatedImageUrl || data.generatedVideo || data.generatedVideoUrl);
};

const REFERENCE_INPUT_HANDLES = new Set([
  'ref-image',
  'ref-images',
  'ref-video',
  'first-frame',
  'last-frame',
  'image',
  'video',
]);

const isReferenceInputHandle = (handle?: string | null): boolean =>
  typeof handle === 'string' && (REFERENCE_INPUT_HANDLES.has(handle) || handle.startsWith('frame-'));

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

// A reference whose media is not already inline base64 needs hydration: fetch a
// fresh signed URL and inline its bytes (or re-sign a generator output). Library/
// Continuum references arrive as a signed URL that expires after ~1h, or had their
// inline base64 stripped on save; left as-is, the Backend fetch of a stale URL
// fails the whole generation, while an upload (synchronous base64) always works.
const referenceNeedsHydration = (node: StudioNode): boolean => {
  const data = node.data as Record<string, unknown>;
  if (node.type === 'image' || node.type === 'video') {
    const value = asTrimmedString(node.type === 'video' ? data.video : data.image);
    if (value.startsWith('data:')) return false;
    return typeof data.sourcePath === 'string'
      || typeof data.sourceUrl === 'string'
      || value.startsWith('http');
  }
  const imageValue = asTrimmedString(data.generatedImage);
  if (!imageValue.startsWith('data:') && typeof data.generatedImageStoragePath === 'string' && typeof data.generatedImageBucket === 'string') {
    return true;
  }
  const videoValue = asTrimmedString(data.generatedVideo);
  if (!videoValue.startsWith('data:') && typeof data.generatedVideoStoragePath === 'string' && typeof data.generatedVideoBucket === 'string') {
    return true;
  }
  return false;
};

// Before building generation payloads, inline/re-sign the reference media feeding
// the run so a single-node generate sends fresh bytes (or a fresh URL). The load
// path already does this (rehydrateWorkflowMediaNodes); the hot path did not, which
// silently dropped or expired Library/Continuum references. No-op when every
// reference is already inline base64 or has no durable source to hydrate from.
async function ensureReferenceMediaHydrated(
  nodes: StudioNode[],
  edges: Edge[],
  executableNodeIds: Set<string>
): Promise<void> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const candidateIds = new Set<string>();
  for (const edge of edges) {
    if (!executableNodeIds.has(edge.target)) continue;
    if (!isReferenceInputHandle(edge.targetHandle)) continue;
    const source = nodeById.get(edge.source);
    if (!source) continue;
    if (source.type === 'image' || source.type === 'video' || isMediaNodeType(source.type)) {
      candidateIds.add(source.id);
    }
  }

  const candidates = nodes.filter((node) => candidateIds.has(node.id) && referenceNeedsHydration(node));
  if (candidates.length === 0) return;

  const hydrated = await rehydrateWorkflowMediaNodes(candidates);
  for (const node of hydrated) {
    const original = nodeById.get(node.id);
    if (original && original.data !== node.data) {
      useStudioStore.getState().updateNodeData(node.id, node.data as Partial<StudioNode['data']>);
    }
  }
}

type ExecuteWorkflowOptions = {
  targetNodeId?: string;
  clearDownstream?: boolean;
  brandId?: string;
  roomId?: string;
};

export async function executeWorkflow(
  controls: ExecutorControls,
  options: ExecuteWorkflowOptions = {}
) {
  // Inline/re-sign reference media feeding the run BEFORE building payloads. A
  // Library/Continuum reference arrives as a signed URL (which expires ~1h) or had
  // its inline base64 stripped on save; left as-is, a single-node generate sends an
  // expired URL the Backend cannot fetch (the generation fails) or no reference at
  // all. This mirrors the load path so the hot path is equally robust.
  {
    const snapshot = useStudioStore.getState();
    const scopeNodeIds = resolveExecutableNodes(snapshot.nodes, snapshot.edges, options.targetNodeId).map((node) => node.id);
    if (scopeNodeIds.length === 0) {
      console.log("No executable nodes found");
      controls.show?.({
        title: "Nothing to run",
        description: "This flow has no runnable nodes. Add a generation node (or connect one), then run again.",
        variant: "error",
      });
      return;
    }
    await ensureReferenceMediaHydrated(snapshot.nodes, snapshot.edges, new Set(scopeNodeIds));
  }

  const { nodes, edges } = useStudioStore.getState();
  const { executeGeneration, executeEnrichment } = controls;
  console.info("[studio] executeWorkflow start", {
    targetNodeId: options.targetNodeId,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const executableNodes = resolveExecutableNodes(nodes, edges, options.targetNodeId);
  const executableNodeIds = executableNodes.map((n) => n.id);

  if (executableNodeIds.length === 0) {
    console.log("No executable nodes found");
    controls.show?.({
      title: "Nothing to run",
      description: "This flow has no runnable nodes. Add a generation node (or connect one), then run again.",
      variant: "error",
    });
    return;
  }
  console.info("[studio] executeWorkflow scope", {
    targetNodeId: options.targetNodeId,
    executableNodeIds,
  });

  const nodesToReset = new Set(executableNodeIds);

  const resetNodeIds = nodes
    .filter((node) => {
      if (!isRunnableNodeType(node.type) || !nodesToReset.has(node.id)) return false;
      // Targeted runs reuse finished upstream results: reset only the target and
      // any dependency that has not yet produced a usable output. Completed
      // upstreams keep their state so they are pre-populated and reused below.
      if (options.targetNodeId && node.id !== options.targetNodeId && nodeHasUsableOutput(node)) {
        return false;
      }
      return true;
    })
    .map((node) => node.id);

  for (const nodeId of resetNodeIds) {
    const existingNode = nodeById.get(nodeId);
    const existingVideo = (existingNode?.data as { generatedVideo?: unknown } | undefined)?.generatedVideo;
    if (typeof existingVideo === 'string' && existingVideo.startsWith('blob:')) {
      try { URL.revokeObjectURL(existingVideo); } catch { /* noop */ }
    }
    useStudioStore.getState().updateNodeData(nodeId, {
      isExecuting: false,
      isComplete: false,
      error: undefined,
      generatedImage: undefined,
      generatedImageUrl: undefined,
      generatedVideo: undefined,
      generatedVideoUrl: undefined,
      progress: undefined,
    });
  }

  const resolvedOutputs = new Map<string, NodeOutput>();
  const failedNodes = new Set<string>();
  // Nodes parked at (or downstream of) a Video Editor break-point awaiting a
  // human render. Tracked separately from failedNodes so the run halts cleanly
  // rather than cascading failures past the gate.
  const awaitingNodes = new Set<string>();

  const imageNodePromises: Promise<void>[] = [];
  
  for (const node of nodes) {
    if (node.type === 'string') {
      const value = normalizeText((node.data as any).value);
      if (value) {
        resolvedOutputs.set(node.id, { type: 'text', value });
      }
    }

    if (node.type === 'videoDecode') {
      const value = normalizeText((node.data as any).value);
      if (value) {
        resolvedOutputs.set(node.id, { type: 'text', value });
      }
    }

    if (node.type === 'image') {
      const imageData = node.data as ImageNodeData;
      
      if (imageData.markupLayer && imageData.originalImage) {
        const promise = compositeImages(imageData.originalImage, imageData.markupLayer)
          .then((composited) => {
            resolvedOutputs.set(node.id, { 
              type: 'image', 
              base64: composited.base64, 
              mimeType: composited.mimeType 
            });
          })
          .catch((error) => {
            console.error('Failed to composite image with markup:', error);
            const parsed = parseDataUrl(imageData.image);
            if (parsed?.base64) {
              resolvedOutputs.set(node.id, { type: 'image', base64: parsed.base64, mimeType: parsed.mimeType });
            }
          });
        imageNodePromises.push(promise);
      } else {
        const parsed = parseDataUrl(imageData.image);
        if (parsed?.base64) {
          resolvedOutputs.set(node.id, { type: 'image', base64: parsed.base64, mimeType: parsed.mimeType });
        } else if (isHttpUrl(imageData.image)) {
          // URL reference (uploaded asset signed URL, or an Instagram grab not yet
          // inlined): pass the URL to the Backend, which resolves it to bytes for
          // the model. No client-side fetch/inlining — the signed URL is the source
          // of truth and works even when loaded from a saved canvas.
          resolvedOutputs.set(node.id, {
            type: 'image',
            base64: '',
            mimeType: 'image/png',
            url: imageData.image,
            storagePath: imageData.sourcePath,
            storageBucket: (imageData as any).bucket,
          });
        } else if (isHttpUrl(imageData.sourceUrl)) {
          // Saved canvases strip the inline base64 from `image`; only the durable
          // signed URL in `sourceUrl` survives. Use it (last resort, when hydration
          // could not re-sign a node lacking storage coords) so a pulled Continuum
          // reference is still passed to the Backend instead of silently dropped.
          resolvedOutputs.set(node.id, {
            type: 'image',
            base64: '',
            mimeType: 'image/png',
            url: imageData.sourceUrl,
            storagePath: imageData.sourcePath,
            storageBucket: (imageData as any).bucket,
          });
        }
      }
    }

    if (node.type === 'video') {
      const parsed = parseDataUrl((node.data as any).video as string | undefined);
      if (parsed?.base64) {
        resolvedOutputs.set(node.id, { type: 'video', url: (node.data as any).video });
      }
    }

    // Pre-populate completed generator outputs if they were not reset
    if (!resetNodeIds.includes(node.id) && (node.data as any).isComplete && !(node.data as any).error) {
      if (node.type === 'nanoGen') {
         const genImage = (node.data as any).generatedImage as string | undefined;
         const genImageUrl = (node.data as any).generatedImageUrl as string | undefined;
         if (genImage) {
            const parsed = parseDataUrl(genImage);
            if (parsed?.base64) {
                resolvedOutputs.set(node.id, { type: 'image', base64: parsed.base64, mimeType: parsed.mimeType, url: genImageUrl });
            }
         } else if (genImageUrl) {
            resolvedOutputs.set(node.id, { type: 'image', base64: '', mimeType: 'image/png', url: genImageUrl });
         }
      } else if (isVideoGeneratorNodeType(node.type) || node.type === 'extendVideo' || node.type === 'videoEditor' || node.type === 'timelineEditor') {
         const genVideo = ((node.data as any).generatedVideo as string | undefined) ?? ((node.data as any).generatedVideoUrl as string | undefined);
         if (genVideo) {
             resolvedOutputs.set(node.id, { type: 'video', url: genVideo });
         }
      } else if (node.type === 'string') {
         // Already handled above, but just in case logic changes
         const val = (node.data as any).value;
         if (val && !resolvedOutputs.has(node.id)) {
            resolvedOutputs.set(node.id, { type: 'text', value: val });
         }
      }
    }
  }

  if (imageNodePromises.length > 0) {
    await Promise.all(imageNodePromises);
  }

  const updateNodeStatus = (nodeId: string, status: 'running' | 'awaiting' | 'completed' | 'failed', error?: string) => {
    useStudioStore.getState().updateNodeData(nodeId, {
      isExecuting: status === 'running',
      isComplete: status === 'completed',
      // Surfaced by the Video Editor node as a "paused — needs editing" badge.
      awaitingInput: status === 'awaiting',
      error: error,
    });
    if (status !== 'running') {
      useStudioStore.getState().triggerSave();
    }
  };

  // Auto-register a durable canvas creation into the media library (source=
  // "canvas") with provenance. Fire-and-forget: never blocks or throws into the
  // generation flow. Skips base64-only / in-memory results and anonymous brands.
  const registerCanvasIfDurable = (
    nodeId: string,
    asset: { kind: "image" | "video"; bucket?: string; storagePath?: string; url?: string; mimeType: string },
  ) => {
    const brandProfileId = options.brandId;
    if (!brandProfileId || brandProfileId === "default-brand") return;
    if (!asset.url || asset.url.startsWith("data:") || !asset.bucket || !asset.storagePath) return;
    const node = nodeById.get(nodeId);
    const data = (node?.data ?? {}) as { prompt?: unknown; model?: unknown };
    const fileName = asset.storagePath.split("/").pop() || `canvas-${asset.kind}`;
    void registerCanvasOutput({
      brandProfileId,
      kind: asset.kind,
      bucket: asset.bucket,
      storagePath: asset.storagePath,
      fileName,
      mimeType: asset.mimeType,
      originRef: {
        kind: "canvas",
        roomId: options.roomId ?? null,
        nodeId,
        prompt: typeof data.prompt === "string" ? data.prompt : null,
        model: typeof data.model === "string" ? data.model : null,
        generator: node?.type ?? null,
      },
    });
  };

  const setNodeOutput = (nodeId: string, output: NodeOutput) => {
    resolvedOutputs.set(nodeId, output);
    if (output.type === 'image') {
      const rawBase64 = output.base64 ?? "";
      const parsed = rawBase64.startsWith("data:") ? parseDataUrl(rawBase64) : null;
      const mimeType = parsed?.mimeType ?? output.mimeType;
      const base64 = (parsed?.base64 ?? rawBase64).replace(/\s+/g, "");
      const persistentUrl = output.url && !output.url.startsWith("data:") ? output.url : undefined;
      // URL-first: the signed URL is the source of truth. Only build a base64
      // data-URL preview when the generation fell back to inline bytes.
      const previewImage = persistentUrl ?? (base64 ? buildDataUrl(mimeType, base64) : undefined);
      console.info("[studio] setting generatedImage", {
        nodeId,
        mimeType,
        base64Length: base64.length,
        hasUrl: Boolean(persistentUrl),
      });
      useStudioStore.getState().updateNodeData(nodeId, {
        generatedImage: previewImage,
        generatedImageUrl: persistentUrl,
        generatedImageStoragePath: output.storagePath,
        generatedImageBucket: output.storageBucket,
        isComplete: true,
        isExecuting: false
      });
      useStudioStore.getState().triggerSave();
      const updatedNode = useStudioStore.getState().nodes.find((node) => node.id === nodeId);
      console.info("[studio] generatedImage set", {
        nodeId,
        hasGeneratedImage: Boolean((updatedNode?.data as any)?.generatedImage),
        hasGeneratedImageUrl: Boolean((updatedNode?.data as any)?.generatedImageUrl),
        previewPrefix: typeof (updatedNode?.data as any)?.generatedImage === "string"
          ? (updatedNode?.data as any).generatedImage.slice(0, 48)
          : undefined,
      });
      registerCanvasIfDurable(nodeId, {
        kind: "image",
        bucket: output.storageBucket,
        storagePath: output.storagePath,
        url: persistentUrl,
        mimeType,
      });
    } else if (output.type === 'video') {
      const persistentUrl = output.url && !output.url.startsWith("data:") ? output.url : undefined;
      useStudioStore.getState().updateNodeData(nodeId, {
        generatedVideo: output.url,
        generatedVideoUrl: persistentUrl,
        generatedVideoStoragePath: output.storagePath,
        generatedVideoBucket: output.storageBucket,
        isComplete: true,
        isExecuting: false
      });
      useStudioStore.getState().triggerSave();
      registerCanvasIfDurable(nodeId, {
        kind: "video",
        bucket: output.storageBucket,
        storagePath: output.storagePath,
        url: persistentUrl,
        mimeType: "video/mp4",
      });
    } else if (output.type === 'text') {
      useStudioStore.getState().updateNodeData(nodeId, { 
        value: output.value,
        isComplete: true,
        isExecuting: false
      });
      useStudioStore.getState().triggerSave();
    }
  };

  async function executeNode(nodeId: string): Promise<boolean> {
    const node = nodeById.get(nodeId);
    if (!node) return false;

    updateNodeStatus(nodeId, 'running');

    try {
      const brandId = options.brandId || "default-brand";
      if (node.type === 'string') {
        const payload = await buildEnrichPayload(node, resolvedOutputs, nodes, edges, brandId);
        
        const hasExternalInputs = (payload?.context?.images?.length ?? 0) > 0 || !!payload?.context?.audio || (payload?.context?.documents?.length ?? 0) > 0 || !!payload?.context?.video;

        console.info("[studio] executeNode string", { nodeId, hasExternalInputs, promptLength: payload?.prompt?.length });

        if (typeof executeEnrichment !== 'function') {
             updateNodeStatus(nodeId, 'failed', "Enrichment execution unavailable");
             return false;
        }

        let hasReceivedPartialUpdate = false;

        const onPartialUpdate = (data: { delta: string }) => {
             if (!data.delta) return;
             const currentNodes = useStudioStore.getState().nodes;
             const node = currentNodes.find(n => n.id === nodeId);
             const currentVal = (node?.data as any).value || "";
             const nextValue = hasReceivedPartialUpdate ? `${currentVal}${data.delta}` : data.delta;
             hasReceivedPartialUpdate = true;
             useStudioStore.getState().updateNodeData(nodeId, { value: nextValue });
        };

        let result;
        if (!hasExternalInputs && payload?.prompt && payload.prompt.trim()) {
            console.info("[studio] triggering fast enrichment for node", nodeId);
            const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
            const supabase = createSupabaseBrowserClient();
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            console.info("[studio] using token for fast enrichment", token ? "present" : "missing");
            if (!token) {
                throw new Error("Authentication session required for prompt enrichment");
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/prompt-fast-enrich`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'apikey': process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify({ prompt: payload.prompt }),
            });

            if (!response.ok) {
                const err = await response.text();
                console.error("[studio] Fast enrichment HTTP error", response.status, err);
                updateNodeStatus(nodeId, 'failed', err || "Fast enrichment failed");
                return false;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                updateNodeStatus(nodeId, 'failed', "No response body");
                return false;
            }

            let accumulatedValue = "";
            let streamError: string | undefined;

            await readServerSentEvents({
              reader,
              onEvent: (eventName, data) => {
                const payloadText = data.trimStart();

                if (eventName === "delta" || eventName === "message") {
                  try {
                    const parsed = JSON.parse(payloadText) as { delta?: string };
                    if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
                      accumulatedValue += parsed.delta;
                      onPartialUpdate({ delta: parsed.delta });
                    }
                  } catch {
                    console.warn("[studio] failed to parse fast enrichment delta", {
                      nodeId,
                      eventName,
                      payloadPreview: payloadText.slice(0, 120),
                    });
                  }
                  return;
                }

                if (eventName === "error") {
                  try {
                    const parsed = JSON.parse(payloadText) as { message?: string; error?: string };
                    streamError = parsed.message || parsed.error || payloadText || "Fast enrichment failed";
                  } catch {
                    streamError = payloadText || "Fast enrichment failed";
                  }
                }
              },
            });

            if (streamError) {
                console.error("[studio] fast enrichment stream error", { nodeId, streamError });
                updateNodeStatus(nodeId, 'failed', streamError);
                return false;
            }

            if (!accumulatedValue.trim()) {
                console.error("[studio] fast enrichment stream completed without output", { nodeId });
                updateNodeStatus(nodeId, 'failed', "Fast enrichment returned empty output");
                return false;
            }

            setNodeOutput(nodeId, { type: 'text', value: accumulatedValue });
            updateNodeStatus(nodeId, 'completed');
            console.info("[studio] fast enrichment complete", { nodeId, length: accumulatedValue.length });
            return true;
        } else {
            if (!payload) {
                setNodeOutput(nodeId, { type: 'text', value: (node.data as any).value || "" });
                return true;
            }
            result = await executeEnrichment(nodeId, payload, onPartialUpdate);
        }
        
        if (result && !result.success) {
             console.error("Enrichment error", result.error);
             updateNodeStatus(nodeId, 'failed', result.error || "Enrichment failed");
             return false;
        }
        
        if (result?.output?.type === 'text') {
             setNodeOutput(nodeId, result.output);
             updateNodeStatus(nodeId, 'completed');
             console.info("[studio] standard enrichment complete", { nodeId });
             return true;
        }
        
        if (result?.success) {
             updateNodeStatus(nodeId, 'completed');
             return true;
        }
      }

      if (node.type === 'videoDecode') {
        const incoming = getIncomingEdges(edges, nodeId);
        const videoEdge = incoming.find((edge) => edge.targetHandle === 'video');
        const resolvedVideo = videoEdge
          ? resolveVideoInput(videoEdge, resolvedOutputs, nodeById, { allowUri: true })
          : undefined;

        if (!resolvedVideo) {
          updateNodeStatus(nodeId, 'failed', 'Missing connected video input');
          return false;
        }

        const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          updateNodeStatus(nodeId, 'failed', 'Authentication session required for video decode');
          return false;
        }

        const requestBody: Record<string, unknown> = {};
        if (options.brandId && options.brandId !== 'default-brand') {
          requestBody.brandId = options.brandId;
        }
        if ('base64' in resolvedVideo) {
          requestBody.videoBase64 = resolvedVideo.base64;
          requestBody.mimeType = resolvedVideo.mimeType;
        } else {
          requestBody.videoUrl = resolvedVideo.uri;
        }

        const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/video-decoder`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const err = await response.text();
          console.error('[studio] video decode HTTP error', response.status, err);
          updateNodeStatus(nodeId, 'failed', err || 'Video decode failed');
          return false;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          updateNodeStatus(nodeId, 'failed', 'No response body');
          return false;
        }

        // Clear any prior breakdown so the streamed result replaces it.
        useStudioStore.getState().updateNodeData(nodeId, { value: '' });

        let accumulatedValue = '';
        let streamError: string | undefined;

        await readServerSentEvents({
          reader,
          onEvent: (eventName, data) => {
            const payloadText = data.trimStart();

            if (eventName === 'delta' || eventName === 'message') {
              try {
                const parsed = JSON.parse(payloadText) as { delta?: string };
                if (typeof parsed.delta === 'string' && parsed.delta.length > 0) {
                  accumulatedValue += parsed.delta;
                  useStudioStore.getState().updateNodeData(nodeId, { value: accumulatedValue });
                }
              } catch {
                console.warn('[studio] failed to parse video decode delta', {
                  nodeId,
                  payloadPreview: payloadText.slice(0, 120),
                });
              }
              return;
            }

            if (eventName === 'error') {
              try {
                const parsed = JSON.parse(payloadText) as { message?: string; error?: string };
                streamError = parsed.message || parsed.error || payloadText || 'Video decode failed';
              } catch {
                streamError = payloadText || 'Video decode failed';
              }
            }
          },
        });

        if (streamError) {
          console.error('[studio] video decode stream error', { nodeId, streamError });
          updateNodeStatus(nodeId, 'failed', streamError);
          return false;
        }

        if (!accumulatedValue.trim()) {
          updateNodeStatus(nodeId, 'failed', 'Video decode returned empty output');
          return false;
        }

        setNodeOutput(nodeId, { type: 'text', value: accumulatedValue });
        updateNodeStatus(nodeId, 'completed');
        console.info('[studio] video decode complete', { nodeId, length: accumulatedValue.length });
        return true;
      }

      if (node.type === 'extendVideo') {
        const payload = buildExtendVideoPayload(node, resolvedOutputs, nodes, edges, brandId);

        if (!payload) {
          updateNodeStatus(nodeId, 'failed', 'Missing required inputs or prompt');
          return false;
        }

        if (!('executeVideoExtension' in controls) || typeof controls.executeVideoExtension !== 'function') {
          updateNodeStatus(nodeId, 'failed', 'Video extension execution unavailable');
          return false;
        }
        const backendPayload = toBackendExtendVideoPayload(payload);
        const result = await controls.executeVideoExtension(nodeId, backendPayload);
        console.info("[studio] executeVideoExtension result", {
          nodeId,
          success: result.success,
          hasOutput: Boolean(result.output),
          error: result.error,
        });

        if (!result.success) {
          updateNodeStatus(nodeId, 'failed', result.error || 'Generation failed');
          return false;
        }

        if (result.output) {
          setNodeOutput(nodeId, result.output);
          updateNodeStatus(nodeId, 'completed');
          return true;
        }

        updateNodeStatus(nodeId, 'failed', 'No output received');
        return false;
      }

      if (node.type === 'timelineEditor') {
        // The render happens in the node UI on "Render & Continue" (a manual
        // break-point), so by the time the scheduler runs this node it is either
        // already committed — in which case we just surface the persisted clip to
        // downstream consumers — or it should never have been scheduled (readiness
        // parks the uncommitted gate as "awaiting").
        const data = node.data as TimelineEditorNodeData;
        const committedUrl = data.generatedVideoUrl ?? (typeof data.generatedVideo === 'string' ? data.generatedVideo : undefined);
        if (data.committed && committedUrl) {
          setNodeOutput(nodeId, { type: 'video', url: committedUrl });
          updateNodeStatus(nodeId, 'completed');
          return true;
        }
        updateNodeStatus(nodeId, 'awaiting');
        return false;
      }

      if (node.type === 'videoEditor') {
        const support = await checkSpliceSupport();
        if (!support.ok) {
          updateNodeStatus(nodeId, 'failed', support.reason);
          return false;
        }

        const slots = ((node.data as VideoEditorNodeData).clipSlots ?? []) as ClipSlot[];
        const registerController = (controls as { registerController?: (id: string) => AbortController }).registerController;
        const releaseController = (controls as { releaseController?: (id: string, ctrl: AbortController) => void }).releaseController;
        const controller = registerController?.(nodeId) ?? new AbortController();
        try {
          const clips = await resolveClipSources(slots, edges, nodes, resolvedOutputs, nodeId);
          const result = await runSpliceInWorker({
            clips,
            signal: controller.signal,
            onProgress: ({ progress }) => {
              useStudioStore.getState().updateNodeData(nodeId, { progress });
            },
          });
          setNodeOutput(nodeId, { type: 'video', url: result.objectUrl });
          useStudioStore.getState().updateNodeData(nodeId, { progress: 1 });
          updateNodeStatus(nodeId, 'completed');
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Splice failed';
          updateNodeStatus(nodeId, 'failed', message);
          return false;
        } finally {
          releaseController?.(nodeId, controller);
        }
      }

      let payload = null;

      if (node.type === 'nanoGen') {
        payload = buildNanoGenPayload(node, resolvedOutputs, nodes, edges, brandId);
      } else if (isVideoGeneratorNodeType(node.type)) {
        payload = buildVeoPayload(node, resolvedOutputs, nodes, edges, brandId);
      }

      if (!payload) {
        updateNodeStatus(nodeId, 'failed', 'Missing required inputs or prompt');
        return false;
      }

      const backendPayload = toBackendPayload(payload);
      const result = await executeGeneration(nodeId, backendPayload);
      console.info("[studio] executeGeneration result", {
        nodeId,
        success: result.success,
        hasOutput: Boolean(result.output),
        error: result.error,
      });

      if (!result.success) {
        updateNodeStatus(nodeId, 'failed', result.error || 'Generation failed');
        return false;
      }

      if (result.output) {
        setNodeOutput(nodeId, result.output);
        updateNodeStatus(nodeId, 'completed');
        return true;
      }

      updateNodeStatus(nodeId, 'failed', 'No output received');
      return false;
    } catch (err) {
      console.error(err);
      updateNodeStatus(nodeId, 'failed', String(err));
      return false;
    }
  }

  const pendingNodes = new Set(
    executableNodeIds.filter(id => {
      if (options.targetNodeId === id) {
        console.info("[studio] forcing target node into pending", id);
        return true;
      }
      return !resolvedOutputs.has(id);
    })
  );
  console.info("[studio] pendingNodes initialized", Array.from(pendingNodes));
  const runningNodes = new Map<string, Promise<{ id: string; success: boolean }>>();

  while (pendingNodes.size > 0 || runningNodes.size > 0) {
    const readyNodes = Array.from(pendingNodes).filter((nodeId) => {
      const node = nodeById.get(nodeId);
      if (!node) return false;
      const readiness = getNodeReadiness(node, edges, resolvedOutputs, nodeById, failedNodes, awaitingNodes);
      console.info("[studio] checking readiness", { nodeId, type: node.type, ready: readiness.ready, reason: readiness.reason });
      return readiness.ready;
    });

    while (readyNodes.length > 0 && runningNodes.size < MAX_CONCURRENT_EXECUTIONS) {
      const nodeId = readyNodes.shift()!;
      pendingNodes.delete(nodeId);
      const execution = executeNode(nodeId).then((success) => ({ id: nodeId, success }));
      runningNodes.set(nodeId, execution);
    }

    if (runningNodes.size === 0) {
      // Nothing left to run. Classify the stalled nodes: a Video Editor gate (and
      // everything downstream of it) that is merely awaiting a human render is
      // PARKED, not failed — the run halts cleanly and resumes when the human
      // clicks "Render & Continue". Iterate to a fixed point so the awaiting state
      // propagates through the full downstream chain regardless of scan order.
      let changed = true;
      while (changed) {
        changed = false;
        for (const nodeId of pendingNodes) {
          if (awaitingNodes.has(nodeId)) continue;
          const node = nodeById.get(nodeId);
          if (!node) continue;
          const readiness = getNodeReadiness(node, edges, resolvedOutputs, nodeById, failedNodes, awaitingNodes);
          if (readiness.awaiting) {
            awaitingNodes.add(nodeId);
            updateNodeStatus(nodeId, 'awaiting');
            changed = true;
          }
        }
      }

      for (const nodeId of pendingNodes) {
        if (awaitingNodes.has(nodeId)) continue;
        const node = nodeById.get(nodeId);
        if (!node) continue;
        const readiness = getNodeReadiness(node, edges, resolvedOutputs, nodeById, failedNodes, awaitingNodes);
        updateNodeStatus(nodeId, 'failed', readiness.reason ?? 'Missing required inputs or prompt');
        failedNodes.add(nodeId);
      }
      pendingNodes.clear();
      break;
    }

    const result = await Promise.race(runningNodes.values());
    runningNodes.delete(result.id);
    if (!result.success) {
      failedNodes.add(result.id);
    }
  }

  console.log("Workflow execution finished");
}
