'use client';

import {
  type AgentRunDto,
  HYPERFRAMES_AUDIO_INPUT_HANDLE,
  HYPERFRAMES_IMAGE_INPUT_HANDLE,
  HYPERFRAMES_PROMPT_INPUT_HANDLE,
  HYPERFRAMES_VIDEO_INPUT_HANDLE,
  type HyperframesAgentAssetRef,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { startHyperframesTurn } from '@/lib/api/hyperframesAgent.client';
import { probeClientRenderCapabilities } from '@/lib/client-render/capabilities';
import { markRenderStartedHere } from '@/lib/client-render/ownedRuns';
import { useStudioStore } from '../stores/useStudioStore';
import type { HyperframesAgentNodeData, StudioNode } from '../types';
import { effectiveBrandBookPieces } from './brandEnforcement';
import { readNodeAssetRef } from './nodeAssetRef';

export type HyperframesInputIssue = {
  sourceNodeId: string;
  kind: 'image' | 'video' | 'audio';
  message: string;
};

export type HyperframesInputMedia = {
  sourceNodeId: string;
  kind: 'image' | 'video' | 'audio';
  label: string;
  status: 'ready' | 'blocked';
  assetId?: string;
  assetVersionId?: string;
};

const promptFromEdges = (
  nodeId: string,
  nodes: StudioNode[],
  edges: Edge[],
): { sourceNodeId: string; value: string } | null => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (edge.target !== nodeId || edge.targetHandle !== HYPERFRAMES_PROMPT_INPUT_HANDLE) {
      continue;
    }
    const source = nodeById.get(edge.source);
    if (source?.type !== 'string') continue;
    const value = (source.data as { value?: unknown }).value;
    if (typeof value === 'string' && value.trim()) {
      return { sourceNodeId: source.id, value: value.trim() };
    }
  }
  return null;
};

const mediaLabel = (node: StudioNode, kind: HyperframesInputMedia['kind']): string => {
  const data = node.data as Record<string, unknown>;
  for (const key of ['fileName', 'title', 'label', 'name']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return `${kind[0]?.toUpperCase()}${kind.slice(1)} input`;
};

export const inspectHyperframesInputs = (
  nodeId: string,
  nodes: StudioNode[],
  edges: Edge[],
): {
  prompt: { sourceNodeId: string; value: string } | null;
  assets: HyperframesAgentAssetRef[];
  media: HyperframesInputMedia[];
  issues: HyperframesInputIssue[];
} => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const kindByHandle = new Map([
    [HYPERFRAMES_IMAGE_INPUT_HANDLE, 'image'],
    [HYPERFRAMES_VIDEO_INPUT_HANDLE, 'video'],
    [HYPERFRAMES_AUDIO_INPUT_HANDLE, 'audio'],
  ] as const);
  const seen = new Set<string>();
  const assets: HyperframesAgentAssetRef[] = [];
  const media: HyperframesInputMedia[] = [];
  const issues: HyperframesInputIssue[] = [];
  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const kind = kindByHandle.get(
      edge.targetHandle as
        | typeof HYPERFRAMES_IMAGE_INPUT_HANDLE
        | typeof HYPERFRAMES_VIDEO_INPUT_HANDLE
        | typeof HYPERFRAMES_AUDIO_INPUT_HANDLE,
    );
    if (!kind) continue;
    const source = nodeById.get(edge.source);
    if (!source) {
      issues.push({
        sourceNodeId: edge.source,
        kind,
        message: `The connected ${kind} is no longer available. Reconnect it before running.`,
      });
      continue;
    }
    const label = mediaLabel(source, kind);
    const ref = readNodeAssetRef(source.data);
    if (!ref) {
      media.push({ sourceNodeId: source.id, kind, label, status: 'blocked' });
      issues.push({
        sourceNodeId: source.id,
        kind,
        message: `${label} must be saved to Library before HyperFrames can use it.`,
      });
      continue;
    }
    media.push({
      sourceNodeId: source.id,
      kind,
      label,
      status: 'ready',
      assetId: ref.assetId,
      assetVersionId: ref.versionId,
    });
    if (seen.has(ref.assetId)) continue;
    seen.add(ref.assetId);
    assets.push({
      assetId: ref.assetId,
      ...(ref.versionId ? { assetVersionId: ref.versionId } : {}),
      kind,
    });
  }
  return { prompt: promptFromEdges(nodeId, nodes, edges), assets, media, issues };
};

export async function assertHyperframesRenderCapability(
  probe = probeClientRenderCapabilities,
): Promise<void> {
  const capabilities = await probe();
  if (!capabilities.webCodecs || !capabilities.avc) {
    throw new Error('This browser cannot render HyperFrames video. Use desktop Chrome or Edge.');
  }
}

export const resolveHyperframesPrompt = (
  data: Pick<HyperframesAgentNodeData, 'prompt' | 'revisionTarget'>,
  connectedPrompt?: string,
): string => (data.revisionTarget ? data.prompt : (connectedPrompt ?? data.prompt)).trim();

export async function startHyperframesAgentNode(params: {
  nodeId: string;
  roomId: string;
  brandId: string;
}): Promise<AgentRunDto> {
  const studio = useStudioStore.getState();
  const nodes = studio.nodes as StudioNode[];
  const node = nodes.find((candidate) => candidate.id === params.nodeId);
  if (!node || node.type !== 'hyperframesAgent') {
    throw new Error('HyperFrames Agent node is unavailable.');
  }
  const data = node.data as HyperframesAgentNodeData;
  const inputs = inspectHyperframesInputs(params.nodeId, nodes, studio.edges);
  const prompt = resolveHyperframesPrompt(data, inputs.prompt?.value);
  if (!prompt) throw new Error('Add a prompt or connect a Text node.');
  if (inputs.issues[0]) throw new Error(inputs.issues[0].message);
  await assertHyperframesRenderCapability();

  studio.updateNodeData(params.nodeId, {
    status: 'queued',
    isExecuting: true,
    isComplete: false,
    error: undefined,
    progress: 0,
  });
  studio.triggerSave();
  const response = await startHyperframesTurn(params.brandId, {
    sessionId: data.sessionId,
    canvasId: params.roomId,
    nodeId: params.nodeId,
    prompt,
    assets: inputs.assets,
    skillIds: data.skillIds ?? [],
    // `?? []` here meant "brand enforcement off" — the node stores the selection as
    // optional so an untouched canvas never writes into a saved graph, and every
    // other generator resolves that absence through effectiveBrandBookPieces.
    brandBookPieces: effectiveBrandBookPieces(data.brandBookPieces),
    energy: data.energy,
    aspectRatio: data.aspectRatio,
    durationSeconds: data.durationSeconds,
    resolution: data.resolution,
    shaderStack: data.shaderStack,
    revisionTarget: data.revisionTarget,
    idempotencyKey: `${params.nodeId}:${crypto.randomUUID()}`,
  });
  const run: AgentRunDto = {
    runId: response.runId,
    agent: 'hyperframes',
    sessionId: response.sessionId,
    brandId: params.brandId,
    status: response.status,
    createdAt: new Date().toISOString(),
    title: 'HyperFrames Agent',
    origin: { surface: 'ai-studio', roomId: params.roomId, nodeId: params.nodeId },
  };
  useAgentRunStore.getState().upsertRun(run);
  // The render job the backend enqueues for this run may be picked up by this tab
  // without an inbox click — the node's own copy already promises that it will be.
  markRenderStartedHere(response.runId);
  studio.updateNodeData(params.nodeId, {
    sessionId: response.sessionId,
    activeRunId: response.runId,
    status: response.status === 'queued' ? 'queued' : 'drafting',
    isExecuting: true,
    error: undefined,
    revisionTarget: undefined,
  });
  studio.triggerSave();
  return run;
}
