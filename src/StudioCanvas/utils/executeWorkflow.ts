'use client';

import {
  ACTION_DEFS,
  type ActionDef,
  type ActionModality,
  actionDef,
  actionOutputModality,
  type BatchItem,
  batchItemType,
  combineBatches,
  isActionId,
  LAYER_EDITOR_IMAGE_INPUT_HANDLE,
  MAX_BATCH_ITEMS,
  type OmniGenRequest,
  type RegisterCanvasAssetResponse,
  routerLockedType,
  STUDIO_MEDIA_NODE_TYPES,
  STUDIO_PUBLISHER_NODE_KINDS,
  STUDIO_RUNNABLE_NODE_TYPES,
  type StudioNodeType,
  TIMELINE_MEDIA_INPUT_HANDLE,
  VIDEO_REFERENCE_VIDEO_HANDLE,
  variationIndexFromHandle,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import { loadBrandTypeInputs } from '@/lib/brands/brandTypeInputs.client';
import { registerCanvasOutput } from '@/lib/creative-assets/registerCanvasAsset';
import { persistAssetRendition } from '@/lib/library/assetPreview';
import { readServerSentEvents } from '@/lib/sse/readServerSentEvents';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import type {
  FrameExtractNodeData,
  GeneratedImageVariation,
  HyperframesAgentNodeData,
  ImageNodeData,
  LayerEditorNodeData,
  StudioNode,
  TimelineEditorNodeData,
  TimelineItem,
} from '../types';
import type { ImageOutputItem, NodeOutput } from '../types/execution';
import { type ResolvedActionInput, runAction } from './actions/runAction';
import { fanOut } from './batch/fanout';
import {
  batchGenerationPlan,
  collectionSourcesFor,
  runGenerationFanOut,
} from './batch/generationFanout';
import {
  buildEnrichPayload,
  buildExtendVideoPayload,
  buildNanoGenPayload,
  buildVeoPayload,
  collectReferenceAssetIds,
  toBackendExtendVideoPayload,
  toBackendPayload,
} from './buildNodePayload';
import { compositeImages } from './compositeImages';
import { buildDataUrl, parseDataUrl } from './dataUrl';
import {
  exportKindForSources,
  exportSourcesFromOutputs,
  resolveExportFormat,
  runExport,
} from './export/runExport';
import { extractVideoFrame } from './extractVideoFrame';
import { computeGenerationSignature, isSignatureTracked, nodeIsStale } from './generationSignature';
import { hasHydratableMediaReference, rehydrateWorkflowMediaNodes } from './rehydrateWorkflowMedia';
import { startHyperframesAgentNode } from './startHyperframesAgent';
import { isVideoGeneratorNodeType, resolveVideoGeneratorModel } from './videoModel';

type ExecutorControls = ReturnType<typeof useWorkflowExecution>;

const MAX_CONCURRENT_EXECUTIONS = 3;

// Was a hand-written list here, a second one in `canvasRunRequests.ts` and a third in
// `generationSignature.ts` — three sets of "which nodes run" that had already drifted
// apart from each other (omniGen, hyperframesAgent and frameExtract produced media and
// were missing from the run summary). All three now derive from the contracts registry,
// which is `satisfies Record<StudioNodeType, …>` and so fails the typecheck in BOTH
// directions.
const MEDIA_NODE_TYPES = STUDIO_MEDIA_NODE_TYPES;

const isMediaNodeType = (nodeType: string | undefined): nodeType is string =>
  typeof nodeType === 'string' && MEDIA_NODE_TYPES.has(nodeType as StudioNodeType);

// The seeding pass pre-populates these, and a whole-graph run reaches them through the
// upstream closure of whatever consumes them. Scheduling them on their own would make
// "Run" execute every loose text box on the canvas — a behaviour change nobody asked
// for, so they are subtracted from the runnable set rather than the set being widened.
const SEEDED_INPUT_TYPES = new Set<StudioNodeType>(['string', 'videoDecode']);

/** The scope of a whole-graph Run: everything runnable that is not a seeded input. */
const isRunAllNodeType = (nodeType: string | undefined): nodeType is string =>
  typeof nodeType === 'string' &&
  STUDIO_RUNNABLE_NODE_TYPES.has(nodeType as StudioNodeType) &&
  !SEEDED_INPUT_TYPES.has(nodeType as StudioNodeType);

// Canvas V3 types whose vocabulary shipped in Wave 1 but whose runtime has not. They
// are unreachable from the palette, but the MCP agent write path can still create one,
// and falling through to the generator branch would kill the run with "Missing required
// inputs or prompt" — a message about a prompt, on a node that has none.
const UNIMPLEMENTED_RUNNABLE_TYPES: Partial<Record<StudioNodeType, string>> = {};

// Publisher sinks are structurally valid but NOT runnable: a run walks upstream
// and never executes them. They are terminal DELIVERY HANDOFFS — the generated
// media is delivered from the node itself (Attach to draft / Replace creative,
// backed by the same publishing service as the studio_deliver MCP tool). Surfacing
// them keeps a run from looking complete while its terminal node silently no-ops.
//
// Derived from the registry's `sink` field. Publishing in particular is the one handoff
// a Run must never perform on its own: it is irreversible and publicly visible, and it
// is gated on a human confirmation bound to what that human was shown.
const PUBLISHER_NODE_KINDS: Readonly<Partial<Record<string, 'organic' | 'paid' | 'render'>>> =
  STUDIO_PUBLISHER_NODE_KINDS;

export const PUBLISHER_HANDOFF_STATE = 'handoff — deliver via studio_deliver';

export interface PublisherHandoff {
  nodeId: string;
  kind: 'organic' | 'paid' | 'render';
  state: string;
}

/**
 * Publisher sinks that sit downstream of the nodes a run would execute — the ones
 * a user might expect the Run button to publish, but which never execute. Scoped
 * to reachable sinks so an unconnected publisher elsewhere on the board is ignored.
 */
export const collectPublisherHandoffs = (
  nodes: StudioNode[],
  edges: Edge[],
  scopeNodeIds?: readonly string[],
): PublisherHandoff[] => {
  const scope = scopeNodeIds ? new Set(scopeNodeIds) : null;
  const reachablePublisher = (publisherId: string): boolean => {
    if (!scope) return true;
    return edges.some((edge) => edge.target === publisherId && scope.has(edge.source));
  };
  return nodes.flatMap((node) => {
    const kind = PUBLISHER_NODE_KINDS[node.type ?? ''];
    if (kind === undefined || !reachablePublisher(node.id)) return [];
    return [{ nodeId: node.id, kind, state: PUBLISHER_HANDOFF_STATE }];
  });
};

type NodeReadiness = {
  ready: boolean;
  reason?: string;
  blockedNodeId?: string;
  // The Video Editor (timelineEditor) is a manual break-point: it becomes
  // "awaiting" once its inputs resolve but a human hasn't rendered yet. The
  // scheduler parks awaiting nodes (and their descendants) instead of failing
  // them, so the run halts cleanly at the gate.
  awaiting?: boolean;
};

const normalizeText = (value?: string | null): string | undefined => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length ? trimmed : undefined;
};

const getIncomingEdges = (edges: Edge[], nodeId: string) =>
  edges.filter((edge) => edge.target === nodeId);

const stringExternalInputHandles = new Set(['image', 'audio', 'video', 'document']);

const getStringExternalInputEdges = (edges: Edge[], nodeId: string) =>
  edges.filter(
    (edge) => edge.target === nodeId && stringExternalInputHandles.has(edge.targetHandle ?? ''),
  );

const resolveTextInput = (
  edge: Edge,
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
  allEdges: Edge[],
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
//
// A multi-variation (`images`) upstream is routed by the edge's source handle,
// exactly as `imageRefFromOutput` routes the payload — the two must agree or a
// 4-up node reads as "ready" to the payload builder and "missing" to readiness.
const resolveImageInput = (
  edge: Edge,
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
): { base64: string; mimeType: string } | undefined => {
  const output = resolvedOutputs.get(edge.source);
  if (output?.type === 'image' && (output.base64 || isHttpUrl(output.url))) {
    return { base64: output.base64 ?? '', mimeType: output.mimeType };
  }

  if (output?.type === 'images') {
    const item = output.items[variationIndexFromHandle(edge.sourceHandle)] ?? output.items[0];
    if (item && (item.base64 || isHttpUrl(item.url))) {
      return { base64: item.base64 ?? '', mimeType: item.mimeType };
    }
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
  options?: { allowUri?: boolean },
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

  if (
    allowUri &&
    (isVideoGeneratorNodeType(sourceNode?.type) ||
      sourceNode?.type === 'omniGen' ||
      sourceNode?.type === 'extendVideo' ||
      sourceNode?.type === 'timelineEditor' ||
      // An action or a router that emitted video persisted it to the same
      // `generatedVideo*` fields every other video producer uses. Both re-run on every
      // pass today, so the live path reads `resolvedOutputs` above — this is the
      // fallback for anything that resolves a node's inputs outside a run.
      sourceNode?.type === 'action' ||
      sourceNode?.type === 'router')
  ) {
    const generatedVideo = (sourceNode.data as any).generatedVideo as string | undefined;
    const generatedVideoUrl = (sourceNode.data as any).generatedVideoUrl as string | undefined;
    const parsed = parseDataUrl(generatedVideo);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
    const fallbackUri =
      (typeof generatedVideo === 'string' && generatedVideo.trim()) ||
      (typeof generatedVideoUrl === 'string' && generatedVideoUrl.trim());
    if (fallbackUri) {
      return { uri: fallbackUri };
    }
  }

  return undefined;
};

const resolveAudioInput = (
  edge: Edge,
  nodeById: Map<string, StudioNode>,
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
  nodeById: Map<string, StudioNode>,
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
        sourceDocumentId:
          typeof doc.sourceDocumentId === 'string' ? doc.sourceDocumentId : undefined,
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
  allEdges: Edge[],
): { value?: string; fromEdge: boolean } => {
  const promptHandles =
    isVideoGeneratorNodeType(node.type) ||
    node.type === 'omniGen' ||
    node.type === 'hyperframesAgent'
      ? ['prompt-in', 'prompt']
      : ['prompt'];
  const promptEdges = incomingEdges.filter((edge) =>
    promptHandles.includes(edge.targetHandle ?? ''),
  );

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

type MissingOptionalInput = {
  label: string;
  blockedNodeId: string;
  /**
   * Why it is missing, when "missing" is misleading.
   *
   * An edge that EXISTS but whose media will not resolve reads to the user as
   * "Missing connected input for ref-image" on a node they can see is connected. The
   * real cause is upstream — a reference whose signed URL could not be refreshed
   * because the media-signing call never reached the backend, for instance. Naming the
   * two cases apart is the difference between a five-minute diagnosis and an hour.
   */
  reason?: string;
};

/**
 * True when a reference node HAS durable coordinates but no readable media — that is,
 * hydration was supposed to turn its storage path into a signed URL and did not.
 *
 * Deliberately narrower than "has nothing": a reference the user simply never filled in
 * is a different problem with a better message already ("Reference image required"),
 * and widening this would swallow it.
 */
const referenceIsUnreadable = (node: StudioNode | undefined): boolean => {
  if (!node || (node.type !== 'image' && node.type !== 'video')) return false;
  const data = node.data as Record<string, unknown>;
  // `hasHydratableMediaReference` already encodes "this node has coordinates worth
  // hydrating", and it rejects whitespace paths and non-http source URLs. Blank or
  // malformed metadata is a authoring problem with its own clearer message, not a
  // transient one worth blaming the network for.
  if (!hasHydratableMediaReference(node)) return false;
  const value = asTrimmedString(data[node.type]);
  return !value || (!value.startsWith('data:') && !isHttpUrl(value));
};

const unresolvedReferenceReason = (
  handle: string,
  sourceNode: StudioNode | undefined,
): string | undefined =>
  referenceIsUnreadable(sourceNode)
    ? `The reference on "${handle}" could not be loaded — its signed URL was never refreshed. Check that the canvas can reach the backend.`
    : undefined;

/**
 * A collection satisfies a reference port.
 *
 * The generation fan-out unwraps it to ONE item per run, so judging it with
 * `resolveImageInput` — which only knows single images — parks the whole graph in
 * preflight with "Missing connected input for ref-images" and nothing ever generates.
 * The action branch of `getNodeReadiness` already had to learn this; a batch wired into
 * a GENERATOR hit the identical trap one function over.
 */
const feedsCollection = (edge: Edge, resolvedOutputs: Map<string, NodeOutput>): boolean =>
  resolvedOutputs.get(edge.source)?.type === 'collection';

const findMissingOptionalInput = (
  node: StudioNode,
  incomingEdges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
  allEdges: Edge[],
): MissingOptionalInput | undefined => {
  if (node.type === 'nanoGen') {
    const refEdges = incomingEdges.filter((edge) =>
      ['ref-image', 'ref-images'].includes(edge.targetHandle ?? ''),
    );
    for (const edge of refEdges) {
      if (feedsCollection(edge, resolvedOutputs)) continue;
      if (!resolveImageInput(edge, resolvedOutputs, nodeById)) {
        const handle = edge.targetHandle ?? 'ref-images';
        return {
          label: handle,
          blockedNodeId: edge.source,
          reason: unresolvedReferenceReason(handle, nodeById.get(edge.source)),
        };
      }
    }
    return undefined;
  }

  if (isVideoGeneratorNodeType(node.type)) {
    const videoModel = resolveVideoGeneratorModel(node);
    for (const edge of incomingEdges) {
      const handle = edge.targetHandle ?? '';
      if (feedsCollection(edge, resolvedOutputs)) continue;
      if (handle === 'negative') {
        if (!resolveTextInput(edge, resolvedOutputs, nodeById, allEdges)) {
          return { label: handle, blockedNodeId: edge.source };
        }
      } else if (handle === 'ref-image' || handle === 'ref-images') {
        const supportsImageReferences =
          videoModel !== 'veo-3.1-fast' && videoModel !== 'veo-3.1-lite';
        if (supportsImageReferences && !resolveImageInput(edge, resolvedOutputs, nodeById)) {
          return { label: handle, blockedNodeId: edge.source };
        }
      } else if (handle === 'ref-video') {
        if (
          videoModel === 'kling-omni' &&
          !resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: false })
        ) {
          return { label: handle, blockedNodeId: edge.source };
        }
      } else if (
        handle === 'first-frame' ||
        handle === 'last-frame' ||
        handle.startsWith('frame-')
      ) {
        const supportsFrames = videoModel === 'veo-3.1-fast' || videoModel === 'veo-3.1-lite';
        if (supportsFrames && !resolveImageInput(edge, resolvedOutputs, nodeById)) {
          return { label: handle, blockedNodeId: edge.source };
        }
      }
    }
  }

  return undefined;
};

// ---------------------------------------------------------------------------
// Canvas V3 input resolution
// ---------------------------------------------------------------------------

/** A NodeOutput as one action input on `handle`, whatever modality it carries. */
const actionInputFromOutput = (output: NodeOutput, handle: string): ResolvedActionInput => {
  if (output.type === 'text') return { handle, text: output.value };
  if (output.type === 'image') {
    return {
      handle,
      imageUrl: output.base64 ? buildDataUrl(output.mimeType, output.base64) : output.url,
      ...(output.assetId ? { assetId: output.assetId } : {}),
    };
  }
  if (output.type === 'images') {
    const item = output.items[0];
    return {
      handle,
      imageUrl: item?.base64 ? buildDataUrl(item.mimeType, item.base64) : item?.url,
      ...(item?.assetId ? { assetId: item.assetId } : {}),
    };
  }
  if (output.type === 'video') {
    return { handle, imageUrl: output.url, ...(output.assetId ? { assetId: output.assetId } : {}) };
  }
  // A collection reaching here means the fan-out did not unwrap it — the caller's bug,
  // not a shape to guess at.
  return { handle };
};

/** Items to fan an action over, when one of its inputs resolved to a collection. */
const collectionInputFor = (
  def: ActionDef,
  nodeId: string,
  edges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
): { handle: string; modality: ActionModality; items: NodeOutput[] } | undefined => {
  for (const port of def.inputs) {
    const edge = getIncomingEdges(edges, nodeId).find((e) => e.targetHandle === port.handle);
    const output = edge ? resolvedOutputs.get(edge.source) : undefined;
    if (output?.type === 'collection') {
      return { handle: port.handle, modality: port.modality, items: output.items };
    }
  }
  return undefined;
};

/** One collection item as the action input for `handle`. */
const actionInputFromItem = async (
  item: NodeOutput,
  handle: string,
  modality: ActionModality,
): Promise<ResolvedActionInput> => {
  const resolved = actionInputFromOutput(item, handle);
  if (modality !== 'video') return resolved;
  return { handle, blob: await fetchBlob(resolved.imageUrl, handle) };
};

/** Everything an action's declared ports resolve to, fetched into readable form. */
const resolveActionInputsFor = async (
  def: Pick<ActionDef, 'inputs'>,
  nodeId: string,
  edges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
): Promise<ResolvedActionInput[]> => {
  const incoming = getIncomingEdges(edges, nodeId);
  const inputs: ResolvedActionInput[] = [];

  for (const port of def.inputs) {
    // EVERY edge wired to the port, in wiring order, capped at the port's declared max.
    // A `find` here silently starved multi-input ports — `text.concat` joined one
    // string forever and `video.stitch` had nothing to stitch, however many edges the
    // user wired.
    const wired = incoming.filter((candidate) => candidate.targetHandle === port.handle);
    if (wired.length === 0)
      throw new Error(`Nothing is connected to this action's "${port.handle}" input`);

    for (const edge of wired.slice(0, port.max)) {
      if (port.modality === 'text') {
        const text = resolveTextInput(edge, resolvedOutputs, nodeById, edges);
        if (text === undefined) throw new Error(`The text feeding "${port.handle}" is not ready`);
        inputs.push({ handle: port.handle, text });
        continue;
      }

      const output = resolvedOutputs.get(edge.source);
      if (output) {
        const resolved = actionInputFromOutput(output, port.handle);
        inputs.push(
          port.modality === 'video'
            ? { handle: port.handle, blob: await fetchBlob(resolved.imageUrl, port.handle) }
            : resolved,
        );
        continue;
      }

      // No run output yet: read the reference node's own durable fields. This is how a
      // plain image/video node feeds an action without ever having "run".
      const sourceData = (nodeById.get(edge.source)?.data ?? {}) as Record<string, unknown>;
      const url = [sourceData.image, sourceData.video, sourceData.sourceUrl].find(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );
      if (!url) throw new Error(`The input on "${port.handle}" is not ready`);
      // A reference node already knows which Library asset it holds, and that id is
      // the only way a backend op can register its result as a DERIVATIVE of this.
      const assetId =
        typeof sourceData.assetId === 'string' && sourceData.assetId.length > 0
          ? { assetId: sourceData.assetId }
          : {};
      inputs.push(
        port.modality === 'video'
          ? { handle: port.handle, blob: await fetchBlob(url, port.handle), ...assetId }
          : { handle: port.handle, imageUrl: url, ...assetId },
      );
    }
  }

  return inputs;
};

/** A worker op re-encodes bytes, so a video input has to be fetched, not linked. */
const fetchBlob = async (url: string | undefined, handle: string): Promise<Blob> => {
  if (!url) throw new Error(`The input on "${handle}" has no readable source`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not read the clip on "${handle}" (${response.status})`);
  }
  return response.blob();
};

/**
 * A batch node's items as a collection output.
 *
 * Two wired batches combine through the contracts' pure zip/cross; a single batch is
 * just its own items. Truncation is returned rather than applied silently — a run that
 * quietly dropped items would report success for work it never did.
 */
const materializeBatch = (
  node: StudioNode,
  edges: Edge[],
  nodeById: Map<string, StudioNode>,
): { output: NodeOutput; truncated: boolean } | undefined => {
  const own = ((node.data as Record<string, unknown>).items ?? []) as BatchItem[];
  const itemType = batchItemType(node.data as Record<string, unknown>);
  if (own.length === 0 || !itemType) return undefined;

  const partner = getIncomingEdges(edges, node.id)
    .map((edge) => nodeById.get(edge.source))
    .find((source) => source?.type === 'batch');

  if (partner) {
    const mode = ((node.data as Record<string, unknown>).combine ?? 'zip') as 'zip' | 'cross';
    const other = ((partner.data as Record<string, unknown>).items ?? []) as BatchItem[];
    const combined = combineBatches(mode, own, other);
    return {
      output: {
        type: 'collection',
        itemType,
        items: combined.pairs.map((pair) => batchItemOutput(pair.left, itemType)),
        labels: combined.pairs.map(
          (pair) => `${pair.left.label ?? ''} × ${pair.right.label ?? ''}`,
        ),
      },
      truncated: combined.truncated,
    };
  }

  const capped = own.slice(0, MAX_BATCH_ITEMS);
  return {
    output: {
      type: 'collection',
      itemType,
      items: capped.map((item) => batchItemOutput(item, itemType)),
      labels: capped.map((item, index) => item.label ?? `Item ${index + 1}`),
    },
    truncated: own.length > MAX_BATCH_ITEMS,
  };
};

const batchItemOutput = (item: BatchItem, itemType: 'text' | 'image' | 'video'): NodeOutput => {
  if (itemType === 'text') return { type: 'text', value: item.value ?? '' };
  if (itemType === 'video') return { type: 'video', url: item.url ?? '', assetId: item.assetId };
  return { type: 'image', base64: '', mimeType: 'image/png', url: item.url, assetId: item.assetId };
};

const getNodeReadiness = (
  node: StudioNode,
  edges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
  failedNodes: Set<string>,
  awaitingNodes: Set<string> = new Set(),
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
    const hasVideo = videoEdges.some((edge) =>
      resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: true }),
    );
    if (!hasVideo) {
      return { ready: false, reason: 'Missing connected input for video' };
    }
    return { ready: true };
  }

  if (node.type === 'frameExtract') {
    const videoEdges = incomingEdges.filter((edge) => edge.targetHandle === 'video');
    if (videoEdges.length === 0) {
      return { ready: false, reason: 'Missing required video input' };
    }
    const hasVideo = videoEdges.some((edge) =>
      resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: true }),
    );
    return hasVideo
      ? { ready: true }
      : { ready: false, reason: 'Missing connected input for video' };
  }

  if (node.type === 'extendVideo') {
    const videoEdges = incomingEdges.filter((edge) => edge.targetHandle === 'video');
    if (videoEdges.length === 0) {
      return { ready: false, reason: 'Missing required video input' };
    }
    const hasVideo = videoEdges.some((edge) =>
      resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: true }),
    );
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

  if (node.type === 'timelineEditor') {
    const data = node.data as TimelineEditorNodeData;
    const items = (data.items ?? []) as TimelineItem[];
    const poolEdges = incomingEdges.filter(
      (edge) => (edge.targetHandle ?? '') === TIMELINE_MEDIA_INPUT_HANDLE,
    );
    if (poolEdges.length === 0) {
      return { ready: false, reason: 'Connect at least one clip or image to the Video Editor' };
    }
    // Every placed clip must reference a connected, resolvable pool source.
    for (const item of items) {
      const edge = poolEdges.find((candidate) => candidate.source === item.sourceNodeId);
      if (!edge) {
        return { ready: false, reason: 'A timeline clip references a disconnected source' };
      }
      const hasVideo = Boolean(
        resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: true }),
      );
      const hasImage = Boolean(resolveImageInput(edge, resolvedOutputs, nodeById));
      if (!hasVideo && !hasImage) {
        return { ready: false, reason: 'A timeline clip has no resolvable media yet' };
      }
    }
    // Hard manual break-point: only "ready" (resumable) once a human has rendered
    // and the clip has been persisted this session. Until then it is "awaiting".
    const committedUrl =
      data.generatedVideoUrl ??
      (typeof data.generatedVideo === 'string' ? data.generatedVideo : undefined);
    if (data.committed && committedUrl) {
      return { ready: true };
    }
    return {
      ready: false,
      awaiting: true,
      reason: 'Awaiting manual edit — open the Video Editor and render',
    };
  }

  if (node.type === 'hyperframesAgent') {
    const data = node.data as HyperframesAgentNodeData;
    const renderedUrl = data.generatedVideoUrl;
    if (renderedUrl) return { ready: true };
    if (data.activeRunId) {
      return { ready: false, awaiting: true, reason: 'HyperFrames Agent is still working' };
    }
    const prompt = getPromptValue(node, incomingEdges, resolvedOutputs, nodeById, edges);
    if (!prompt.value) return { ready: false, reason: 'Add or connect a prompt' };
    return { ready: true };
  }

  // ── Canvas V3 ───────────────────────────────────────────────────────────────
  // These must sit ABOVE the prompt fallthrough: none of them has a prompt, and the
  // fallthrough would park every one of them on "Missing required prompt".

  if (node.type === 'action') {
    const def = actionDef((node.data as Record<string, unknown>).actionId);
    if (!def) return { ready: false, reason: 'Pick an operation for this action' };
    for (const port of def.inputs) {
      const edge = incomingEdges.find((candidate) => candidate.targetHandle === port.handle);
      if (!edge) return { ready: false, reason: `Connect ${port.modality} to "${port.handle}"` };
      // A collection satisfies ANY port modality: the fan-out unwraps it to one item
      // per run, and the items are already type-locked to the batch's `itemType`.
      // Checking this only on the video port (as the first cut did) made a batch of
      // prompts feeding a text op read as permanently not-ready, and the run bailed in
      // preflight without saying why.
      const available =
        resolvedOutputs.get(edge.source)?.type === 'collection' ||
        (port.modality === 'text'
          ? resolveTextInput(edge, resolvedOutputs, nodeById, edges) !== undefined
          : port.modality === 'image'
            ? Boolean(resolveImageInput(edge, resolvedOutputs, nodeById))
            : Boolean(resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: true })));
      if (!available) {
        return { ready: false, reason: `Waiting on the ${port.modality} feeding "${port.handle}"` };
      }
    }
    return { ready: true };
  }

  if (node.type === 'router') {
    const edge = incomingEdges[0];
    if (!edge) return { ready: false, reason: 'Connect something to route' };
    return resolvedOutputs.has(edge.source)
      ? { ready: true }
      : { ready: false, reason: 'Waiting on the upstream node' };
  }

  if (node.type === 'batch') {
    const items = (node.data as Record<string, unknown>).items;
    if (Array.isArray(items) && items.length > 0) return { ready: true };
    return incomingEdges.some((edge) => resolvedOutputs.has(edge.source))
      ? { ready: true }
      : { ready: false, reason: 'Add items, or connect something to collect' };
  }

  if (node.type === 'export') {
    // Terminal, and its input is a POOL — one resolved edge is enough to have
    // something to write.
    return incomingEdges.some((edge) => resolvedOutputs.has(edge.source))
      ? { ready: true }
      : { ready: false, reason: 'Connect something to export' };
  }

  if (node.type === 'layerEditor') {
    const data = node.data as LayerEditorNodeData;
    const pool = incomingEdges.filter(
      (edge) => (edge.targetHandle ?? '') === LAYER_EDITOR_IMAGE_INPUT_HANDLE,
    );
    if (pool.length === 0) {
      return { ready: false, reason: 'Connect at least one image to the Layer Editor' };
    }
    // Manual break-point, exactly like the Video Editor: a person presses Compose.
    if (!(data.generatedImageUrl ?? data.generatedImage)) {
      return {
        ready: false,
        reason: 'Awaiting manual edit — open the Layer Editor and compose',
      };
    }
    return { ready: true };
  }

  // Ready on purpose: they execute, and executing is how they announce that their
  // runtime has not shipped. Parking them would hang the run instead.
  if (UNIMPLEMENTED_RUNNABLE_TYPES[node.type as StudioNodeType]) return { ready: true };

  const prompt = getPromptValue(node, incomingEdges, resolvedOutputs, nodeById, edges);
  if (!prompt.value) {
    return {
      ready: false,
      reason: prompt.fromEdge ? 'Missing prompt input' : 'Missing required prompt',
    };
  }

  const missingOptional = findMissingOptionalInput(
    node,
    incomingEdges,
    resolvedOutputs,
    nodeById,
    edges,
  );
  if (missingOptional) {
    return {
      ready: false,
      reason: missingOptional.reason ?? `Missing connected input for ${missingOptional.label}`,
      blockedNodeId: missingOptional.blockedNodeId,
    };
  }

  return { ready: true };
};

const isRunnableNodeType = (nodeType: string | undefined): boolean =>
  typeof nodeType === 'string' && STUDIO_RUNNABLE_NODE_TYPES.has(nodeType as StudioNodeType);

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
  targetNodeId?: string,
): StudioNode[] => {
  if (!targetNodeId) return nodes.filter((node) => isRunAllNodeType(node.type));
  const target = nodes.find((node) => node.id === targetNodeId);
  if (!target || !isRunnableNodeType(target.type)) return [];
  const scope = collectUpstreamClosure(targetNodeId, edges);
  scope.add(targetNodeId);
  return nodes.filter((node) => scope.has(node.id) && isRunnableNodeType(node.type));
};

// A node whose previous output can be reused as-is (so a run does not re-run a
// node that already has content). Keyed on the durable generated output itself,
// NOT the transient `isComplete` flag: that flag is stripped on every save and
// not restored on load, so gating on it made reloaded/synced nodes regenerate
// even though their output (re-signed `generatedImageUrl`) is present.
const nodeHasUsableOutput = (node: StudioNode): boolean => {
  const data = node.data as Record<string, unknown>;
  if (node.type === 'string' || node.type === 'videoDecode') {
    return normalizeText(data.value as string | undefined) !== undefined;
  }
  // The Canvas V3 pass-throughs always re-run. They are not signature-tracked — the
  // registry pins `signatureFields` to the four generator types — so an edited
  // `actionId`, `config` or batch item would otherwise go undetected and the stale
  // output be reused. Re-running a deterministic local op costs compute, not credits.
  //
  // ponytail: blanket re-run. Signature-track them if a slow op (video.speed
  // re-encodes a whole clip) makes the recompute hurt.
  if (node.type === 'action' || node.type === 'router' || node.type === 'batch') return false;
  if (data.error) return false;
  return Boolean(
    data.generatedImage || data.generatedImageUrl || data.generatedVideo || data.generatedVideoUrl,
  );
};

const resolveRegenerationSet = (
  executableNodes: StudioNode[],
  edges: Edge[],
  nodeById: Map<string, StudioNode>,
  options: ExecuteWorkflowOptions,
): Set<string> => {
  const executableNodeIdSet = new Set(executableNodes.map((node) => node.id));
  const roots = executableNodes
    .filter((node) => {
      if (options.forceRegenerateAll) return true;
      if (options.targetNodeId === node.id) return true;
      if (!nodeHasUsableOutput(node)) return true;
      return nodeIsStale(node, edges, nodeById);
    })
    .map((node) => node.id);

  return collectDownstreamClosure(roots, edges, executableNodeIdSet);
};

type WorkflowPreflightIssue = {
  nodeId: string;
  blockedNodeId: string;
  reason: string;
};

const buildOptimisticPreflightOutputs = (
  executableNodes: StudioNode[],
  nodes: StudioNode[],
): Map<string, NodeOutput> => {
  const outputs = new Map<string, NodeOutput>();
  for (const node of executableNodes) {
    // An `action` is whatever its OP emits. Keying this off the node type would file
    // every action under the media branch below and preflight a find-and-replace as a
    // video producer — the exact confusion the registry's own comment warns about.
    const actionModality =
      node.type === 'action' ? actionOutputModality(node.data?.actionId) : undefined;

    if (node.type === 'string' || node.type === 'videoDecode' || actionModality === 'text') {
      outputs.set(node.id, { type: 'text', value: 'preflight-ready' });
    } else if (
      node.type === 'nanoGen' ||
      node.type === 'frameExtract' ||
      actionModality === 'image'
    ) {
      outputs.set(node.id, { type: 'image', base64: 'preflight-ready', mimeType: 'image/png' });
    } else if (node.type === 'batch') {
      // A batch's modality is known before anything runs — it is the item kind. Leaving
      // it unset made every consumer of a batch read as not-ready during preflight, and
      // preflight bails the whole run silently.
      const itemType = batchItemType(node.data as Record<string, unknown>);
      if (itemType) {
        outputs.set(node.id, { type: 'collection', itemType, items: [] });
      }
    } else if (node.type === 'router') {
      // A router only knows its modality once it is locked; before that, asserting one
      // would invent a constraint. Left unset so the consumer is judged on its own
      // inputs rather than on a guess.
      const locked = (node.data as Record<string, unknown>).lockedType;
      if (locked === 'text') outputs.set(node.id, { type: 'text', value: 'preflight-ready' });
      else if (locked === 'image') {
        outputs.set(node.id, { type: 'image', base64: 'preflight-ready', mimeType: 'image/png' });
      } else if (locked === 'video') {
        outputs.set(node.id, { type: 'video', url: 'data:video/mp4;base64,preflight-ready' });
      }
    } else if (actionModality === 'video' || isMediaNodeType(node.type)) {
      outputs.set(node.id, { type: 'video', url: 'data:video/mp4;base64,preflight-ready' });
    }
  }

  for (const node of nodes) {
    if (!hasHydratableMediaReference(node)) continue;
    if (node.type === 'image') {
      outputs.set(node.id, {
        type: 'image',
        base64: 'preflight-ready',
        mimeType: 'image/png',
      });
    } else if (node.type === 'video') {
      outputs.set(node.id, { type: 'video', url: 'data:video/mp4;base64,preflight-ready' });
    }
  }
  return outputs;
};

const findWorkflowPreflightIssue = (
  executableNodes: StudioNode[],
  nodes: StudioNode[],
  edges: Edge[],
  mustRegenerate: Set<string>,
): WorkflowPreflightIssue | undefined => {
  const resolvedOutputs = buildOptimisticPreflightOutputs(executableNodes, nodes);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const failedNodes = new Set<string>();

  for (const node of executableNodes) {
    if (!mustRegenerate.has(node.id)) continue;
    const readiness = getNodeReadiness(node, edges, resolvedOutputs, nodeById, failedNodes);
    if (readiness.ready || readiness.awaiting) continue;
    return {
      nodeId: node.id,
      blockedNodeId: readiness.blockedNodeId ?? node.id,
      reason: readiness.reason ?? 'Missing required inputs or prompt',
    };
  }

  return undefined;
};

const surfacePreflightIssue = (
  controls: ExecutorControls,
  nodes: StudioNode[],
  issue: WorkflowPreflightIssue,
) => {
  useStudioStore
    .getState()
    .setNodes(nodes.map((node) => ({ ...node, selected: node.id === issue.blockedNodeId })));
  useStudioStore.getState().updateNodeData(issue.nodeId, {
    isExecuting: false,
    error: issue.reason,
  });

  const blockedNode = nodes.find((node) => node.id === issue.blockedNodeId);
  const isMissingImageReference =
    blockedNode?.type === 'image' &&
    issue.reason.startsWith('Missing connected input for ref-image');
  controls.show?.({
    title: isMissingImageReference ? 'Reference image required' : 'Flow needs input',
    description: isMissingImageReference
      ? 'Add a reference image to run this flow.'
      : `${issue.reason}. Fix the selected node, then run the flow again.`,
    variant: 'error',
  });
};

// Forward mirror of collectUpstreamClosure: every node reachable downstream of
// the roots, bounded to `scope`. Used to cascade regeneration — when a node is
// regenerated (empty, errored, edited, or the explicit target), every in-scope
// node it feeds must regenerate too, since their input just changed.
const collectDownstreamClosure = (
  rootIds: Iterable<string>,
  edges: Edge[],
  scope: Set<string>,
): Set<string> => {
  const closure = new Set<string>();
  const queue: string[] = [];
  for (const id of rootIds) {
    if (scope.has(id) && !closure.has(id)) {
      closure.add(id);
      queue.push(id);
    }
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.source !== current || closure.has(edge.target) || !scope.has(edge.target)) continue;
      closure.add(edge.target);
      queue.push(edge.target);
    }
  }
  return closure;
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
  typeof handle === 'string' &&
  (REFERENCE_INPUT_HANDLES.has(handle) || handle.startsWith('frame-'));

const asTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

// A reference whose media is not already inline base64 needs hydration: fetch a
// fresh signed URL and inline its bytes (or re-sign a generator output). Library/
// Continuum references arrive as a signed URL that expires after ~1h, or had their
// inline base64 stripped on save; left as-is, the Backend fetch of a stale URL
// fails the whole generation, while an upload (synchronous base64) always works.
const referenceNeedsHydration = (node: StudioNode): boolean => {
  const data = node.data as Record<string, unknown>;
  if (node.type === 'image' || node.type === 'video') {
    return hasHydratableMediaReference(node);
  }
  const imageValue = asTrimmedString(data.generatedImage);
  if (
    !imageValue.startsWith('data:') &&
    typeof data.generatedImageStoragePath === 'string' &&
    typeof data.generatedImageBucket === 'string'
  ) {
    return true;
  }
  const videoValue = asTrimmedString(data.generatedVideo);
  if (
    !videoValue.startsWith('data:') &&
    typeof data.generatedVideoStoragePath === 'string' &&
    typeof data.generatedVideoBucket === 'string'
  ) {
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
  executableNodeIds: Set<string>,
  brandProfileId?: string,
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

  const candidates = nodes.filter(
    (node) => candidateIds.has(node.id) && referenceNeedsHydration(node),
  );
  if (candidates.length === 0) return;

  const hydrated = await rehydrateWorkflowMediaNodes(candidates, undefined, brandProfileId);
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
  // "Rerun all": regenerate every runnable node from scratch, ignoring existing
  // content and signatures. The explicit "start over" path, since a normal run
  // now reuses nodes that already have content.
  forceRegenerateAll?: boolean;
};

export async function executeWorkflow(
  controls: ExecutorControls,
  options: ExecuteWorkflowOptions = {},
) {
  // The store is the canvas's own answer for "which brand am I", and it survives a caller
  // that forgot to pass one. Nothing below substitutes a placeholder for a missing brand:
  // an id no brand can have used to reach the Backend and come back as a permissions
  // denial, which is not what had gone wrong.
  const workflowBrandId = options.brandId ?? useStudioStore.getState().brandId;

  // Inline/re-sign reference media feeding the run BEFORE building payloads. A
  // Library/Continuum reference arrives as a signed URL (which expires ~1h) or had
  // its inline base64 stripped on save; left as-is, a single-node generate sends an
  // expired URL the Backend cannot fetch (the generation fails) or no reference at
  // all. This mirrors the load path so the hot path is equally robust.
  {
    const snapshot = useStudioStore.getState();
    const scopeNodeIds = resolveExecutableNodes(
      snapshot.nodes,
      snapshot.edges,
      options.targetNodeId,
    ).map((node) => node.id);
    if (scopeNodeIds.length === 0) {
      console.log('No executable nodes found');
      controls.show?.({
        title: 'Nothing to run',
        description:
          'This flow has no runnable nodes. Add a generation node (or connect one), then run again.',
        variant: 'error',
      });
      return;
    }
    const executableNodes = resolveExecutableNodes(
      snapshot.nodes,
      snapshot.edges,
      options.targetNodeId,
    );
    const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
    const mustRegenerate = resolveRegenerationSet(
      executableNodes,
      snapshot.edges,
      nodeById,
      options,
    );
    const preflightIssue = findWorkflowPreflightIssue(
      executableNodes,
      snapshot.nodes,
      snapshot.edges,
      mustRegenerate,
    );
    if (preflightIssue) {
      surfacePreflightIssue(controls, snapshot.nodes, preflightIssue);
      return;
    }
    await ensureReferenceMediaHydrated(
      snapshot.nodes,
      snapshot.edges,
      new Set(scopeNodeIds),
      workflowBrandId,
    );
  }

  const { nodes, edges } = useStudioStore.getState();
  const { executeGeneration, executeEnrichment } = controls;
  console.info('[studio] executeWorkflow start', {
    targetNodeId: options.targetNodeId,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const executableNodes = resolveExecutableNodes(nodes, edges, options.targetNodeId);
  const executableNodeIds = executableNodes.map((n) => n.id);

  if (executableNodeIds.length === 0) {
    console.log('No executable nodes found');
    controls.show?.({
      title: 'Nothing to run',
      description:
        'This flow has no runnable nodes. Add a generation node (or connect one), then run again.',
      variant: 'error',
    });
    return;
  }
  console.info('[studio] executeWorkflow scope', {
    targetNodeId: options.targetNodeId,
    executableNodeIds,
  });

  // Report — never silently skip — any publisher sink fed by this run. The run
  // produces the media; delivery is an explicit handoff from the publisher node.
  const publisherHandoffs = collectPublisherHandoffs(nodes, edges, executableNodeIds);
  if (publisherHandoffs.length > 0) {
    controls.show?.({
      title: 'Publisher nodes are delivery handoffs',
      description: `The run generates the media; a run never publishes. Deliver from the ${
        publisherHandoffs.length === 1 ? 'publisher node' : 'publisher nodes'
      } (Attach to draft / Replace creative).`,
      variant: 'info',
    });
  }

  // A run regenerates a node only when it must: the explicit Run target, a node
  // with no usable output (empty or errored), or a node edited since it
  // generated (signature drift). Everything downstream of such a node also
  // regenerates — its input just changed. Every other node that already has
  // content is reused. This unifies the per-node Run (scope = target + its
  // upstream closure) and the global Run-all (scope = all media nodes).
  const mustRegenerate = resolveRegenerationSet(executableNodes, edges, nodeById, options);

  const resetNodeIds = executableNodes
    .filter((node) => mustRegenerate.has(node.id))
    .map((node) => node.id);

  for (const nodeId of resetNodeIds) {
    const existingNode = nodeById.get(nodeId);
    const existingVideo = (existingNode?.data as { generatedVideo?: unknown } | undefined)
      ?.generatedVideo;
    if (typeof existingVideo === 'string' && existingVideo.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(existingVideo);
      } catch {
        /* noop */
      }
    }
    useStudioStore.getState().updateNodeData(nodeId, {
      isExecuting: false,
      isComplete: false,
      error: undefined,
      errorCode: undefined,
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
              mimeType: composited.mimeType,
            });
          })
          .catch((error) => {
            console.error('Failed to composite image with markup:', error);
            const parsed = parseDataUrl(imageData.image);
            if (parsed?.base64) {
              resolvedOutputs.set(node.id, {
                type: 'image',
                base64: parsed.base64,
                mimeType: parsed.mimeType,
              });
            }
          });
        imageNodePromises.push(promise);
      } else {
        const parsed = parseDataUrl(imageData.image);
        if (parsed?.base64) {
          resolvedOutputs.set(node.id, {
            type: 'image',
            base64: parsed.base64,
            mimeType: parsed.mimeType,
          });
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
      const videoData = node.data as {
        video?: string;
        sourceUrl?: string;
        sourcePath?: string;
        bucket?: string;
      };
      const rawVideo = videoData.video ?? videoData.sourceUrl;
      const parsed = parseDataUrl(rawVideo);
      if (parsed?.base64) {
        resolvedOutputs.set(node.id, { type: 'video', url: rawVideo! });
      } else if (isHttpUrl(rawVideo)) {
        resolvedOutputs.set(node.id, {
          type: 'video',
          url: rawVideo,
          storagePath: videoData.sourcePath,
          storageBucket: videoData.bucket,
        });
      }
    }

    // Reuse a node's existing output (feed it to downstream consumers) when the
    // node is not slated to regenerate and already holds usable content.
    if (!mustRegenerate.has(node.id) && nodeHasUsableOutput(node)) {
      if (node.type === 'nanoGen' || node.type === 'frameExtract' || node.type === 'layerEditor') {
        const genImage = (node.data as any).generatedImage as string | undefined;
        const genImageUrl = (node.data as any).generatedImageUrl as string | undefined;
        const durableImageUrl = isHttpUrl(genImage) ? genImage : genImageUrl;
        const genImages = (node.data as any).generatedImages as
          | GeneratedImageVariation[]
          | undefined;
        // A saved 4-variation node must come back as `images`, or every edge on an
        // image-N handle would silently resolve to variation 0 after a reload.
        if (genImages && genImages.length > 1) {
          const items = genImages.map((variation) => {
            const parsed = parseDataUrl(variation.preview);
            return {
              base64: parsed?.base64,
              mimeType: parsed?.mimeType ?? 'image/png',
              url: variation.url ?? (isHttpUrl(variation.preview) ? variation.preview : undefined),
              storagePath: variation.storagePath,
              storageBucket: variation.storageBucket,
              assetId: variation.assetId,
              assetVersionId: variation.assetVersionId,
            };
          });
          if (items.some((item) => item.base64 || item.url)) {
            resolvedOutputs.set(node.id, { type: 'images', items });
          }
        } else if (genImage) {
          const parsed = parseDataUrl(genImage);
          if (parsed?.base64) {
            resolvedOutputs.set(node.id, {
              type: 'image',
              base64: parsed.base64,
              mimeType: parsed.mimeType,
              url: genImageUrl,
            });
          } else if (durableImageUrl) {
            resolvedOutputs.set(node.id, {
              type: 'image',
              base64: '',
              mimeType: 'image/png',
              url: durableImageUrl,
              storagePath: (node.data as any).generatedImageStoragePath,
              storageBucket: (node.data as any).generatedImageBucket,
            });
          }
        } else if (durableImageUrl) {
          resolvedOutputs.set(node.id, {
            type: 'image',
            base64: '',
            mimeType: 'image/png',
            url: durableImageUrl,
            storagePath: (node.data as any).generatedImageStoragePath,
            storageBucket: (node.data as any).generatedImageBucket,
          });
        }
      } else if (
        isVideoGeneratorNodeType(node.type) ||
        node.type === 'omniGen' ||
        node.type === 'extendVideo' ||
        node.type === 'hyperframesAgent' ||
        node.type === 'timelineEditor'
      ) {
        const genVideo =
          ((node.data as any).generatedVideo as string | undefined) ??
          ((node.data as any).generatedVideoUrl as string | undefined);
        if (genVideo) {
          resolvedOutputs.set(node.id, {
            type: 'video',
            url: genVideo,
            storagePath: (node.data as any).generatedVideoStoragePath,
            storageBucket: (node.data as any).generatedVideoBucket,
            assetId: (node.data as any).renderOutputAssetId,
            assetVersionId: (node.data as any).renderOutputAssetVersionId,
          });
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

  const updateNodeStatus = (
    nodeId: string,
    status: 'running' | 'awaiting' | 'completed' | 'failed',
    error?: string,
    errorCode?: string,
  ) => {
    const current = useStudioStore.getState().nodes.find((node) => node.id === nodeId)?.data as
      | Record<string, unknown>
      | undefined;
    if (
      status === 'completed' &&
      current?.isComplete === true &&
      current?.isExecuting === false &&
      !error
    ) {
      return;
    }
    useStudioStore.getState().updateNodeData(nodeId, {
      isExecuting: status === 'running',
      isComplete: status === 'completed',
      // Surfaced by the Video Editor node as a "paused — needs editing" badge.
      awaitingInput: status === 'awaiting',
      error: error,
      errorCode: errorCode,
    });
    if (status !== 'running') {
      useStudioStore.getState().triggerSave();
    }
  };

  // Auto-register a durable canvas creation into the media library (source=
  // "canvas") with provenance. Fire-and-forget: never blocks or throws into the
  // generation flow. Skips base64-only / in-memory results and anonymous brands.
  const registrationPromises = new Map<string, Promise<RegisterCanvasAssetResponse | null>>();

  const registerCanvasIfDurable = (
    nodeId: string,
    asset: {
      kind: 'image' | 'video';
      bucket?: string;
      storagePath?: string;
      url?: string;
      mimeType: string;
      sizeBytes?: number;
    },
    variationIndex?: number,
  ): Promise<RegisterCanvasAssetResponse | null> => {
    const brandProfileId = workflowBrandId;
    if (!brandProfileId) return Promise.resolve(null);
    if (!asset.url || asset.url.startsWith('data:') || !asset.bucket || !asset.storagePath) {
      return Promise.resolve(null);
    }
    const node = nodeById.get(nodeId);
    const data = (node?.data ?? {}) as { prompt?: unknown; model?: unknown };
    const fileName = asset.storagePath.split('/').pop() || `canvas-${asset.kind}`;
    const pending = registerCanvasOutput(
      {
        brandProfileId,
        kind: asset.kind,
        bucket: asset.bucket,
        storagePath: asset.storagePath,
        fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        originRef: {
          kind: 'canvas',
          roomId: options.roomId ?? null,
          nodeId,
          prompt: typeof data.prompt === 'string' ? data.prompt : null,
          model: typeof data.model === 'string' ? data.model : null,
          generator: node?.type ?? null,
        },
      },
      asset.kind === 'video' ? { videoSource: asset.url } : undefined,
    ).then((registered) => {
      if (!registered?.assetId) return registered;
      const state = useStudioStore.getState();
      const current = state.getNodeById(nodeId)?.data as Record<string, unknown> | undefined;
      const generatedImages = Array.isArray(current?.generatedImages)
        ? ([...current.generatedImages] as GeneratedImageVariation[])
        : [];
      if (variationIndex !== undefined && generatedImages[variationIndex]) {
        generatedImages[variationIndex] = {
          ...generatedImages[variationIndex],
          assetId: registered.assetId,
          assetVersionId: registered.assetVersionId ?? undefined,
        };
      }
      state.updateNodeData(nodeId, {
        ...(variationIndex === undefined || variationIndex === 0
          ? {
              renderOutputAssetId: registered.assetId,
              renderOutputAssetVersionId: registered.assetVersionId ?? undefined,
            }
          : {}),
        ...(variationIndex === undefined ? {} : { generatedImages }),
      });
      useStudioStore.getState().triggerSave();
      return registered;
    });
    registrationPromises.set(nodeId, pending);
    return pending;
  };

  // Stamp the signature of the inputs that produced this output so a later run
  // can tell whether the node was edited since (see generationSignature.ts).
  // Read fresh store state: the node's input fields are stable during its own
  // generation, and upstream text-source values must be current.
  const generationSignatureFor = (nodeId: string): string | undefined => {
    const state = useStudioStore.getState();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node || !isSignatureTracked(node.type)) return undefined;
    const lookup = new Map(state.nodes.map((n) => [n.id, n]));
    return computeGenerationSignature(node, state.edges, lookup);
  };

  // One variation's durable coordinates plus the preview the node renders. Shared
  // by the single-image and multi-variation paths so a variation is persisted with
  // the same fields — nothing here may become preview-only.
  const toVariation = (item: ImageOutputItem): GeneratedImageVariation | undefined => {
    const rawBase64 = item.base64 ?? '';
    const parsed = rawBase64.startsWith('data:') ? parseDataUrl(rawBase64) : null;
    const mimeType = parsed?.mimeType ?? item.mimeType;
    const base64 = (parsed?.base64 ?? rawBase64).replace(/\s+/g, '');
    const persistentUrl = item.url && !item.url.startsWith('data:') ? item.url : undefined;
    const preview = persistentUrl ?? (base64 ? buildDataUrl(mimeType, base64) : undefined);
    if (!preview) return undefined;
    return {
      preview,
      url: persistentUrl,
      storagePath: item.storagePath,
      storageBucket: item.storageBucket,
      assetId: item.assetId,
      assetVersionId: item.assetVersionId,
    };
  };

  const setNodeOutput = (nodeId: string, output: NodeOutput) => {
    resolvedOutputs.set(nodeId, output);
    if (output.type === 'images') {
      const variations = output.items
        .map(toVariation)
        .filter((variation): variation is GeneratedImageVariation => variation !== undefined);
      if (variations.length === 0) return;

      const primary = variations[0];
      useStudioStore.getState().updateNodeData(nodeId, {
        generatedImages: variations,
        // The primary also fills the single-image fields so download, re-sign, and
        // every existing consumer keep working without knowing about variations.
        generatedImage: primary.preview,
        generatedImageUrl: primary.url,
        generatedImageStoragePath: primary.storagePath,
        generatedImageBucket: primary.storageBucket,
        renderOutputAssetId: primary.assetId,
        renderOutputAssetVersionId: primary.assetVersionId,
        generationSignature: generationSignatureFor(nodeId),
        isComplete: true,
        isExecuting: false,
      });
      useStudioStore.getState().triggerSave();
      output.items.forEach((item, index) => {
        if (item.assetId || !variations[index]) return;
        registerCanvasIfDurable(
          nodeId,
          {
            kind: 'image',
            bucket: item.storageBucket,
            storagePath: item.storagePath,
            url: variations[index].url,
            mimeType: item.mimeType,
            sizeBytes: item.sizeBytes,
          },
          index,
        );
      });
    } else if (output.type === 'image') {
      const rawBase64 = output.base64 ?? '';
      const parsed = rawBase64.startsWith('data:') ? parseDataUrl(rawBase64) : null;
      const mimeType = parsed?.mimeType ?? output.mimeType;
      const base64 = (parsed?.base64 ?? rawBase64).replace(/\s+/g, '');
      const persistentUrl = output.url && !output.url.startsWith('data:') ? output.url : undefined;
      // URL-first: the signed URL is the source of truth. Only build a base64
      // data-URL preview when the generation fell back to inline bytes.
      const previewImage = persistentUrl ?? (base64 ? buildDataUrl(mimeType, base64) : undefined);
      console.info('[studio] setting generatedImage', {
        nodeId,
        mimeType,
        base64Length: base64.length,
        hasUrl: Boolean(persistentUrl),
      });
      useStudioStore.getState().updateNodeData(nodeId, {
        generatedImage: previewImage,
        // A re-run at variationCount 1 must clear a previous 4-up, or the node keeps
        // rendering a stale grid and stale image-N handles.
        generatedImages: undefined,
        generatedImageUrl: persistentUrl,
        generatedImageStoragePath: output.storagePath,
        generatedImageBucket: output.storageBucket,
        renderOutputAssetId: output.assetId,
        renderOutputAssetVersionId: output.assetVersionId,
        generationSignature: generationSignatureFor(nodeId),
        isComplete: true,
        isExecuting: false,
      });
      useStudioStore.getState().triggerSave();
      const updatedNode = useStudioStore.getState().nodes.find((node) => node.id === nodeId);
      console.info('[studio] generatedImage set', {
        nodeId,
        hasGeneratedImage: Boolean((updatedNode?.data as any)?.generatedImage),
        hasGeneratedImageUrl: Boolean((updatedNode?.data as any)?.generatedImageUrl),
        previewPrefix:
          typeof (updatedNode?.data as any)?.generatedImage === 'string'
            ? (updatedNode?.data as any).generatedImage.slice(0, 48)
            : undefined,
      });
      if (!output.assetId) {
        registerCanvasIfDurable(nodeId, {
          kind: 'image',
          bucket: output.storageBucket,
          storagePath: output.storagePath,
          url: persistentUrl,
          mimeType,
          sizeBytes: output.sizeBytes,
        });
      }
    } else if (output.type === 'video') {
      const persistentUrl = output.url && !output.url.startsWith('data:') ? output.url : undefined;
      useStudioStore.getState().updateNodeData(nodeId, {
        generatedVideo: output.url,
        generatedVideoUrl: persistentUrl,
        generatedVideoStoragePath: output.storagePath,
        generatedVideoBucket: output.storageBucket,
        renderOutputAssetId: output.assetId,
        renderOutputAssetVersionId: output.assetVersionId,
        generationSignature: generationSignatureFor(nodeId),
        isComplete: true,
        isExecuting: false,
      });
      useStudioStore.getState().triggerSave();
      registerCanvasIfDurable(nodeId, {
        kind: 'video',
        bucket: output.storageBucket,
        storagePath: output.storagePath,
        url: persistentUrl,
        mimeType: 'video/mp4',
        sizeBytes: output.sizeBytes,
      });
    } else if (output.type === 'text') {
      useStudioStore.getState().updateNodeData(nodeId, {
        value: output.value,
        isComplete: true,
        isExecuting: false,
      });
      useStudioStore.getState().triggerSave();
    } else if (output.type === 'collection') {
      // Only the count and a cover are persisted. The items themselves live in
      // `resolvedOutputs` for the duration of the run: a hundred base64 stills written
      // into the canvas row would be stripped by the serializer on the way out anyway.
      const cover = output.items.find((item) => item.type === 'image');
      useStudioStore.getState().updateNodeData(nodeId, {
        collectionCount: output.items.length,
        collectionItemType: output.itemType,
        ...(cover && cover.type === 'image' && cover.base64
          ? { generatedImage: buildDataUrl(cover.mimeType, cover.base64) }
          : {}),
        isComplete: true,
        isExecuting: false,
      });
      useStudioStore.getState().triggerSave();
    }
  };

  async function executeNode(nodeId: string): Promise<boolean> {
    const node = nodeById.get(nodeId);
    if (!node) return false;

    updateNodeStatus(nodeId, 'running');

    try {
      const brandId = workflowBrandId;
      if (!brandId) {
        updateNodeStatus(nodeId, 'failed', 'No brand selected — reload AI Studio');
        return false;
      }
      if (node.type === 'string') {
        // A run scoped to THIS node is the node's own "Enrich Prompt" button, the
        // one explicit request to enrich; a whole-graph run merely passes through.
        const isExplicitEnrich = options.targetNodeId === nodeId;
        const payload = await buildEnrichPayload(node, resolvedOutputs, nodes, edges, brandId, {
          ignoreLiteralMode: isExplicitEnrich,
        });

        console.info('[studio] executeNode string', {
          nodeId,
          promptLength: payload?.prompt?.length,
        });

        if (typeof executeEnrichment !== 'function') {
          updateNodeStatus(nodeId, 'failed', 'Enrichment execution unavailable');
          return false;
        }

        let hasReceivedPartialUpdate = false;

        const onPartialUpdate = (data: { delta: string }) => {
          if (!data.delta) return;
          const currentNodes = useStudioStore.getState().nodes;
          const node = currentNodes.find((n) => n.id === nodeId);
          const currentVal = (node?.data as any).value || '';
          const nextValue = hasReceivedPartialUpdate ? `${currentVal}${data.delta}` : data.delta;
          hasReceivedPartialUpdate = true;
          useStudioStore.getState().updateNodeData(nodeId, { value: nextValue });
        };

        // All text-box enrichment runs through the Backend PromptEnrichmentService
        // so it is brand + skill aware (services/studio-grounding.ts). The grounding
        // data piece rides in the payload, inherited from the downstream gen node.
        if (!payload) {
          // Only a pass-through run reaches here (an explicit enrich always gets a
          // payload). Reporting success on a request the user made explicitly is
          // how Enrich Prompt read as "reloads and nothing happens".
          if (isExplicitEnrich) {
            updateNodeStatus(nodeId, 'failed', 'Nothing to enrich — this prompt box is empty');
            return false;
          }
          setNodeOutput(nodeId, { type: 'text', value: (node.data as any).value || '' });
          return true;
        }

        const result = await executeEnrichment(nodeId, payload, onPartialUpdate);

        if (result && !result.success) {
          console.error('Enrichment error', result.error);
          updateNodeStatus(nodeId, 'failed', result.error || 'Enrichment failed');
          return false;
        }

        if (result?.output?.type === 'text') {
          setNodeOutput(nodeId, result.output);
          updateNodeStatus(nodeId, 'completed');
          console.info('[studio] standard enrichment complete', { nodeId });
          return true;
        }

        if (result?.success) {
          updateNodeStatus(nodeId, 'completed');
          return true;
        }

        // Truthy-but-empty, or no result at all: the enrichment produced no text.
        // Falling through here left the node spinning with no error to read.
        updateNodeStatus(nodeId, 'failed', 'Enrichment returned no text');
        return false;
      }

      if (node.type === 'omniGen') {
        const incoming = getIncomingEdges(edges, nodeId);
        const promptResult = getPromptValue(node, incoming, resolvedOutputs, nodeById, edges);
        const prompt = promptResult.value?.trim();
        if (!prompt) {
          updateNodeStatus(nodeId, 'failed', 'Missing required prompt');
          return false;
        }
        if (typeof controls.executeOmniTurn !== 'function') {
          updateNodeStatus(nodeId, 'failed', 'Omni execution unavailable');
          return false;
        }

        const data = node.data as Record<string, unknown>;
        const aspectRatio = (data.aspectRatio === '9:16' ? '9:16' : '16:9') as '16:9' | '9:16';
        const resolution = (data.resolution ?? '720p') as OmniGenRequest['resolution'];

        const refImageEdges = incoming.filter((edge) =>
          ['ref-image', 'ref-images'].includes(edge.targetHandle ?? ''),
        );

        // Optional reference images: only inline-base64 refs are sent; URL-only
        // references are skipped in v1 (the backend route takes base64 input).
        const references = refImageEdges
          .map((edge) => resolveImageInput(edge, resolvedOutputs, nodeById))
          .filter((ref): ref is { base64: string; mimeType: string } => Boolean(ref?.base64))
          .map((ref) => ({ data: ref.base64, mimeType: ref.mimeType }));

        // A clip wired into ref-video turns the run into an edit or an extend of
        // THAT clip. A signed URL is passed through as a uri — the Backend inlines
        // it, rather than the browser shipping megabytes of base64 upstream.
        const videoEdge = incoming.find(
          (edge) => edge.targetHandle === VIDEO_REFERENCE_VIDEO_HANDLE,
        );
        const videoInput = videoEdge
          ? resolveVideoInput(videoEdge, resolvedOutputs, nodeById, { allowUri: true })
          : undefined;
        const sourceVideo: OmniGenRequest['sourceVideo'] = !videoInput
          ? undefined
          : 'base64' in videoInput
            ? { data: videoInput.base64, mimeType: videoInput.mimeType }
            : { uri: videoInput.uri, mimeType: 'video/mp4' };
        const turn: OmniGenRequest['turn'] = sourceVideo
          ? data.videoTask === 'extend'
            ? 'extend'
            : 'edit'
          : 'generate';

        // Grounding the node collected but the payload used to drop on the floor:
        // the design-system toggle on the chip wrote here and never reached the
        // Backend, so the switch looked live and did nothing.
        const referenceAssetIds = collectReferenceAssetIds(refImageEdges, nodes);

        const result = await controls.executeOmniTurn(nodeId, {
          brandId,
          turn,
          prompt,
          aspectRatio,
          resolution,
          references: references.length > 0 ? references : undefined,
          sourceVideo,
          skillIds: Array.isArray(data.skillIds) ? (data.skillIds as string[]) : undefined,
          brandBookPieces: Array.isArray(data.brandBookPieces)
            ? (data.brandBookPieces as string[])
            : undefined,
          designSystemSections: Array.isArray(data.designSystemSections)
            ? (data.designSystemSections as string[])
            : undefined,
          referenceAssetIds: referenceAssetIds.length > 0 ? referenceAssetIds : undefined,
        });

        if (!result.success || !result.output) {
          updateNodeStatus(nodeId, 'failed', result.error || 'Omni generation failed');
          return false;
        }

        // Feed downstream consumers. The backend route already registered the
        // media asset (source 'ai_generated', like the other video generators), so
        // we persist the durable fields + seed the variation library directly
        // rather than via setNodeOutput (whose canvas re-registration is redundant).
        resolvedOutputs.set(nodeId, result.output);
        const variationId = crypto.randomUUID?.() ?? `omni-${Date.now()}`;
        useStudioStore.getState().updateNodeData(nodeId, {
          generatedVideo: result.output.url,
          generatedVideoUrl: result.output.url,
          generatedVideoStoragePath: result.output.storagePath,
          generatedVideoBucket: result.output.storageBucket,
          variations: [
            {
              id: variationId,
              label: 'Original',
              videoUrl: result.output.url,
              storagePath: result.output.storagePath,
              bucket: result.output.storageBucket,
              interactionId: result.interactionId,
              status: 'done',
              createdAt: Date.now(),
            },
          ],
          activeVariationId: variationId,
          previousInteractionId: result.interactionId,
        });
        useStudioStore.getState().triggerSave();
        registerCanvasIfDurable(nodeId, {
          kind: 'video',
          bucket: result.output.storageBucket,
          storagePath: result.output.storagePath,
          url: result.output.url,
          mimeType: 'video/mp4',
        });
        updateNodeStatus(nodeId, 'completed');
        return true;
      }

      if (node.type === 'frameExtract') {
        const incoming = getIncomingEdges(edges, nodeId);
        const videoEdge = incoming.find((edge) => edge.targetHandle === 'video');
        const sourceOutput = videoEdge ? resolvedOutputs.get(videoEdge.source) : undefined;
        const sourceNode = videoEdge ? nodeById.get(videoEdge.source) : undefined;
        const sourceData = (sourceNode?.data ?? {}) as Record<string, unknown>;
        const source =
          sourceOutput?.type === 'video'
            ? sourceOutput.url
            : sourceNode?.type === 'video'
              ? ((sourceData.video ?? sourceData.sourceUrl) as string | Blob | undefined)
              : ((sourceData.generatedVideo ?? sourceData.generatedVideoUrl) as
                  | string
                  | Blob
                  | undefined);
        if (!videoEdge || !source) {
          updateNodeStatus(nodeId, 'failed', 'Missing connected video input');
          return false;
        }

        const data = node.data as FrameExtractNodeData;
        const selector =
          data.selector === 'first' || data.selector === 'timestamp' ? data.selector : 'last';
        const frame = await extractVideoFrame({
          source,
          selector,
          timestampSec: data.timestampSec,
          outputWidth: data.outputWidth,
          quality: data.quality,
        });
        if (!frame) {
          updateNodeStatus(nodeId, 'failed', 'This browser could not decode the selected frame');
          return false;
        }

        const registration = await registrationPromises.get(videoEdge.source);
        const sourceAssetId =
          registration?.assetId ??
          (sourceOutput?.type === 'video' ? sourceOutput.assetId : undefined) ??
          (typeof sourceData.renderOutputAssetId === 'string'
            ? sourceData.renderOutputAssetId
            : undefined);
        const sourceAssetVersionId =
          registration?.assetVersionId ??
          (sourceOutput?.type === 'video' ? sourceOutput.assetVersionId : undefined) ??
          (typeof sourceData.renderOutputAssetVersionId === 'string'
            ? sourceData.renderOutputAssetVersionId
            : undefined);
        const sourceTimestampMs = Math.round(frame.timestampSec * 1000);

        const parsedFrame = parseDataUrl(frame.dataUrl);
        setNodeOutput(nodeId, {
          type: 'image',
          base64: parsedFrame?.base64 ?? frame.dataUrl,
          mimeType: frame.mimeType,
        });
        useStudioStore.getState().updateNodeData(nodeId, {
          sourceTimestampMs,
          sourceAssetId,
          sourceAssetVersionId,
        });

        if (selector !== 'timestamp' && workflowBrandId && sourceAssetId && sourceAssetVersionId) {
          try {
            await persistAssetRendition({
              client: createSupabaseBrowserClient(),
              brandId: workflowBrandId,
              assetId: sourceAssetId,
              assetVersionId: sourceAssetVersionId,
              role: selector === 'first' ? 'first_frame' : 'last_frame',
              blob: frame.blob,
              mimeType: frame.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/webp',
              width: frame.width,
              height: frame.height,
              renderer: 'mediabunny-canvas-frame-extract',
              sourceTimestampMs,
            });
          } catch (error) {
            // The extracted frame still feeds the next shot. Persistence is a
            // durability enhancement and must not invalidate the local workflow.
            console.warn('[studio] continuity frame persistence failed', error);
          }
        }

        updateNodeStatus(nodeId, 'completed');
        return true;
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
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          updateNodeStatus(nodeId, 'failed', 'Authentication session required for video decode');
          return false;
        }

        const requestBody: Record<string, unknown> = {};
        if (workflowBrandId) {
          requestBody.brandId = workflowBrandId;
        }
        if ('base64' in resolvedVideo) {
          requestBody.videoBase64 = resolvedVideo.base64;
          requestBody.mimeType = resolvedVideo.mimeType;
        } else {
          requestBody.videoUrl = resolvedVideo.uri;
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/video-decoder`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              apikey:
                process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                '',
              Accept: 'text/event-stream',
            },
            body: JSON.stringify(requestBody),
          },
        );

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
                streamError =
                  parsed.message || parsed.error || payloadText || 'Video decode failed';
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

        if (
          !('executeVideoExtension' in controls) ||
          typeof controls.executeVideoExtension !== 'function'
        ) {
          updateNodeStatus(nodeId, 'failed', 'Video extension execution unavailable');
          return false;
        }
        const backendPayload = toBackendExtendVideoPayload(payload);
        const result = await controls.executeVideoExtension(nodeId, backendPayload);
        console.info('[studio] executeVideoExtension result', {
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
        const committedUrl =
          data.generatedVideoUrl ??
          (typeof data.generatedVideo === 'string' ? data.generatedVideo : undefined);
        if (data.committed && committedUrl) {
          setNodeOutput(nodeId, {
            type: 'video',
            url: committedUrl,
            storagePath: data.generatedVideoStoragePath,
            storageBucket: data.generatedVideoBucket,
            assetId: data.renderOutputAssetId,
            assetVersionId: data.renderOutputAssetVersionId,
          });
          updateNodeStatus(nodeId, 'completed');
          return true;
        }
        updateNodeStatus(nodeId, 'awaiting');
        return false;
      }

      if (node.type === 'hyperframesAgent') {
        const data = node.data as HyperframesAgentNodeData;
        if (data.generatedVideoUrl) {
          setNodeOutput(nodeId, {
            type: 'video',
            url: data.generatedVideoUrl,
            storagePath: data.generatedVideoStoragePath,
            storageBucket: data.generatedVideoStorageBucket,
            assetId: data.generatedVideoAssetId,
          });
          updateNodeStatus(nodeId, 'completed');
          return true;
        }
        if (!brandId || !options.roomId) {
          updateNodeStatus(nodeId, 'failed', 'AI Studio workspace is unavailable');
          return false;
        }
        await startHyperframesAgentNode({
          nodeId,
          roomId: options.roomId,
          brandId,
        });
        updateNodeStatus(nodeId, 'awaiting');
        return false;
      }

      // ── Canvas V3 runtime ───────────────────────────────────────────────────
      // All four sit ABOVE the generator fallthrough below; anything that reaches it
      // without a payload dies on "Missing required inputs or prompt".

      if (node.type === 'router') {
        // The whole transparency mechanism, and it is this small: resolve the one
        // input and republish it as the router's OWN output. Downstream consumers
        // then read `resolvedOutputs.get(routerId)` exactly as they read any producer,
        // so an expensive upstream node runs ONCE and feeds every edge leaving the
        // router. Nothing about the payload changes on the way through.
        const incoming = getIncomingEdges(edges, nodeId)[0];
        const upstream = incoming ? resolvedOutputs.get(incoming.source) : undefined;
        if (!upstream) {
          updateNodeStatus(nodeId, 'failed', 'Nothing is connected to this router');
          return false;
        }
        setNodeOutput(nodeId, upstream);
        // Pin the modality on first pass so contracts can reject a later reconnection
        // that would silently change what everything downstream receives.
        if (!(node.data as Record<string, unknown>).lockedType) {
          const locked = routerLockedType(node, edges, nodes);
          if (locked) useStudioStore.getState().updateNodeData(nodeId, { lockedType: locked });
        }
        updateNodeStatus(nodeId, 'completed');
        return true;
      }

      if (node.type === 'export') {
        // The whole node: read the resolved inputs, encode, hand the user a file.
        // Reading `resolvedOutputs` (not node data) is what makes a run reuse ONE
        // upstream execution across every export hanging off it — and it is the only
        // path that can see a `batch` collection, whose items are never persisted.
        const upstream = getIncomingEdges(edges, nodeId)
          .map((edge) => resolvedOutputs.get(edge.source))
          .filter((output): output is NodeOutput => output !== undefined);
        const sources = exportSourcesFromOutputs(upstream);
        const format = resolveExportFormat(
          (node.data as Record<string, unknown>).format,
          exportKindForSources(sources),
        );
        if (!format) {
          updateNodeStatus(nodeId, 'failed', 'Nothing is connected to export');
          return false;
        }
        try {
          await runExport({ sources, format });
        } catch (error) {
          updateNodeStatus(
            nodeId,
            'failed',
            error instanceof Error ? error.message : 'Export failed',
          );
          return false;
        }
        updateNodeStatus(nodeId, 'completed');
        return true;
      }

      if (node.type === 'batch') {
        const collection = materializeBatch(node, edges, nodeById);
        if (!collection) {
          updateNodeStatus(nodeId, 'failed', 'This batch has no items to run');
          return false;
        }
        if (collection.truncated) {
          controls.show?.({
            title: 'Batch truncated',
            description: `Only the first ${MAX_BATCH_ITEMS} items will run.`,
            variant: 'info',
          });
        }
        setNodeOutput(nodeId, collection.output);
        updateNodeStatus(nodeId, 'completed');
        return true;
      }

      if (node.type === 'action') {
        const data = node.data as Record<string, unknown>;
        if (!isActionId(data.actionId)) {
          updateNodeStatus(nodeId, 'failed', 'Pick an operation for this action');
          return false;
        }
        const actionId = data.actionId;
        const def = ACTION_DEFS[actionId];
        const config = (data.config ?? {}) as Record<string, unknown>;

        // Only the op that reads the BRAND pays for the round trips. `loadBrandTypeInputs` is
        // the SAME reader the burn-in's config panel previews through, so a panel that promises
        // a face cannot be looking at a different brand than the render uses. Fetched per run
        // rather than cached: a brand re-ingested mid-session must not set type in the face it
        // had this morning.
        const brand = actionId === 'image.text' ? await loadBrandTypeInputs(workflowBrandId) : null;

        // Cancel reaches a long re-encode the same way it reaches a generation.
        const controller = controls.registerController(nodeId);

        let output: NodeOutput;
        try {
          const collectionPort = collectionInputFor(def, nodeId, edges, resolvedOutputs);
          if (collectionPort) {
            // Fan out: run the op once per item, then emit a collection of the op's
            // OWN output modality. `ACTION_DEFS[...].output`, never the node type's
            // `producesMedia` flag — that flag says `true` for every action because
            // most emit media, and keying off it would file a find-and-replace as a
            // media producer.
            //
            // The op's other ports resolve ONCE and are shared across every item: a
            // watermark fanned over 40 clips should not re-fetch the logo 40 times.
            const { items, handle } = collectionPort;
            const shared = await resolveActionInputsFor(
              { ...def, inputs: def.inputs.filter((port) => port.handle !== handle) },
              nodeId,
              edges,
              resolvedOutputs,
              nodeById,
            );
            const fan = await fanOut(items, async (item) =>
              runAction({
                actionId,
                inputs: [
                  ...shared,
                  await actionInputFromItem(item, handle, collectionPort.modality),
                ],
                config,
                brand,
                signal: controller.signal,
              }),
            );
            if (fan.failures > 0) {
              controls.show?.({
                title: `${fan.failures} of ${items.length} items failed`,
                description: `${def.label} finished the rest.`,
                variant: 'info',
              });
            }
            const produced = fan.results.filter((result): result is NodeOutput => result !== null);
            if (produced.length === 0) {
              updateNodeStatus(nodeId, 'failed', `${def.label} produced nothing for any item`);
              return false;
            }
            output = { type: 'collection', itemType: def.output, items: produced };
          } else {
            output = await runAction({
              actionId,
              inputs: await resolveActionInputsFor(def, nodeId, edges, resolvedOutputs, nodeById),
              config,
              brand,
              signal: controller.signal,
            });
          }
        } catch (error) {
          updateNodeStatus(
            nodeId,
            'failed',
            error instanceof Error ? error.message : String(error),
          );
          return false;
        } finally {
          controls.releaseController(nodeId, controller);
        }

        setNodeOutput(nodeId, output);
        updateNodeStatus(nodeId, 'completed');
        return true;
      }

      if (node.type === 'layerEditor') {
        const data = node.data as LayerEditorNodeData;
        const composed = data.generatedImageUrl ?? data.generatedImage;
        if (composed) {
          setNodeOutput(nodeId, {
            type: 'image',
            base64: '',
            mimeType: 'image/png',
            url: composed,
            storagePath: data.generatedImageStoragePath,
            storageBucket: data.generatedImageBucket,
            assetId: data.renderOutputAssetId,
            assetVersionId: data.renderOutputAssetVersionId,
          });
          updateNodeStatus(nodeId, 'completed');
          return true;
        }
        updateNodeStatus(nodeId, 'awaiting');
        return false;
      }

      const unimplemented = UNIMPLEMENTED_RUNNABLE_TYPES[node.type as StudioNodeType];
      if (unimplemented) {
        // A named refusal, not a silent skip. Neither type is reachable from the
        // palette, but the MCP agent write path can create one, and a run that quietly
        // ignored it would report success for work that never happened.
        updateNodeStatus(nodeId, 'failed', unimplemented);
        return false;
      }

      // ── Batch fan-out, for GENERATORS ───────────────────────────────────────
      // Wave 2 wrapped fan-out around the ACTION branch only. A generator never looked
      // at a collection, and `imageRefFromOutput` matches only `image`/`images` — so a
      // batch wired into `nanoGen` resolved to no reference image at all and generated
      // the same picture N times. One run per item, pooled 3, and this node emits a
      // collection of its own so the loop keeps propagating downstream.
      //
      // Sits ABOVE the payload fallthrough for the same reason the four V3 branches do:
      // anything that reaches it without a payload dies on "Missing required inputs".
      const batchSources = collectionSourcesFor(nodeId, edges, resolvedOutputs, nodeById);
      const isVideoGenerator = isVideoGeneratorNodeType(node.type);
      if (batchSources && (node.type === 'nanoGen' || isVideoGenerator)) {
        const plan = batchGenerationPlan(batchSources);
        if (!plan) {
          updateNodeStatus(nodeId, 'failed', 'This batch has no items to run');
          return false;
        }
        if (plan.truncated) {
          controls.show?.({
            title: 'Batch truncated',
            description: `Only the first ${MAX_BATCH_ITEMS} items will run.`,
            variant: 'info',
          });
        }

        const fanned = await runGenerationFanOut(node, plan, resolvedOutputs, {
          // The GENERATOR's modality, never the batch's `itemType`: a batch of text
          // prompts fanned through nanoGen produces images.
          outputItemType: isVideoGenerator ? 'video' : 'image',
          buildPayload: (target, perItem) => {
            const built = isVideoGenerator
              ? buildVeoPayload(target, perItem, nodes, edges, brandId)
              : buildNanoGenPayload(target, perItem, nodes, edges, brandId);
            return built ? toBackendPayload(built) : null;
          },
          executeGeneration: (executionId, itemPayload) =>
            executeGeneration(executionId, itemPayload),
          // Progress is written as it lands so the matrix fills in during the run and
          // survives a reload — the axis headers and result urls only, never base64.
          onProgress: (record) => {
            // `updateNodeData` alone only moves the store — every other write site in
            // this file pairs it with `triggerSave`, and without it a finished batch
            // exists in the tab and nowhere else.
            useStudioStore.getState().updateNodeData(nodeId, { batchRun: record });
            useStudioStore.getState().triggerSave();
          },
        });

        if (!fanned) {
          updateNodeStatus(nodeId, 'failed', 'This batch produced nothing for any item');
          return false;
        }
        if (fanned.record.failed > 0) {
          controls.show?.({
            title: `${fanned.record.failed} of ${plan.pairs.length} items failed`,
            description: 'The rest of the batch finished.',
            variant: 'info',
          });
        }
        setNodeOutput(nodeId, fanned.output);
        updateNodeStatus(nodeId, 'completed');
        useStudioStore.getState().triggerSave();
        return true;
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
      const result = await executeGeneration(nodeId, backendPayload, (preview) => {
        if (preview.type !== 'image') return;
        const rawBase64 = preview.base64 ?? '';
        const parsed = rawBase64.startsWith('data:') ? parseDataUrl(rawBase64) : null;
        const base64 = (parsed?.base64 ?? rawBase64).replace(/\s+/g, '');
        const previewUrl =
          preview.url && !preview.url.startsWith('data:')
            ? preview.url
            : base64
              ? buildDataUrl(parsed?.mimeType ?? preview.mimeType, base64)
              : undefined;
        if (!previewUrl) return;
        useStudioStore.getState().updateNodeData(nodeId, {
          generatedImage: previewUrl,
          generatedImageUrl:
            preview.url && !preview.url.startsWith('data:') ? preview.url : undefined,
          isExecuting: true,
          isComplete: false,
        });
      });
      console.info('[studio] executeGeneration result', {
        nodeId,
        success: result.success,
        hasOutput: Boolean(result.output),
        error: result.error,
      });

      if (!result.success) {
        updateNodeStatus(nodeId, 'failed', result.error || 'Generation failed', result.errorCode);
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
    executableNodeIds.filter((id) => {
      if (options.targetNodeId === id) {
        console.info('[studio] forcing target node into pending', id);
        return true;
      }
      return !resolvedOutputs.has(id);
    }),
  );
  console.info('[studio] pendingNodes initialized', Array.from(pendingNodes));
  const runningNodes = new Map<string, Promise<{ id: string; success: boolean }>>();

  while (pendingNodes.size > 0 || runningNodes.size > 0) {
    const readyNodes = Array.from(pendingNodes).filter((nodeId) => {
      const node = nodeById.get(nodeId);
      if (!node) return false;
      const readiness = getNodeReadiness(
        node,
        edges,
        resolvedOutputs,
        nodeById,
        failedNodes,
        awaitingNodes,
      );
      console.info('[studio] checking readiness', {
        nodeId,
        type: node.type,
        ready: readiness.ready,
        reason: readiness.reason,
      });
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
          const readiness = getNodeReadiness(
            node,
            edges,
            resolvedOutputs,
            nodeById,
            failedNodes,
            awaitingNodes,
          );
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
        const readiness = getNodeReadiness(
          node,
          edges,
          resolvedOutputs,
          nodeById,
          failedNodes,
          awaitingNodes,
        );
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

  console.log('Workflow execution finished');
}
