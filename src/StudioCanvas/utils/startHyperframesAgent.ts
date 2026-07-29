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
import { useStudioStore } from '../stores/useStudioStore';
import type { HyperframesAgentNodeData, StudioNode } from '../types';

const assetIdFromNode = (node: StudioNode): string | null => {
  const data = node.data as Record<string, unknown>;
  for (const key of [
    'assetId',
    'renderOutputAssetId',
    'generatedVideoAssetId',
    'generatedAssetId',
  ]) {
    if (typeof data[key] === 'string' && data[key]) return data[key];
  }
  return null;
};

const promptFromEdges = (nodeId: string, nodes: StudioNode[], edges: Edge[]): string | null => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (edge.target !== nodeId || edge.targetHandle !== HYPERFRAMES_PROMPT_INPUT_HANDLE) {
      continue;
    }
    const source = nodeById.get(edge.source);
    if (source?.type !== 'string') continue;
    const value = (source.data as { value?: unknown }).value;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

export const collectHyperframesAssets = (
  nodeId: string,
  nodes: StudioNode[],
  edges: Edge[],
): HyperframesAgentAssetRef[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const kindByHandle = new Map([
    [HYPERFRAMES_IMAGE_INPUT_HANDLE, 'image'],
    [HYPERFRAMES_VIDEO_INPUT_HANDLE, 'video'],
    [HYPERFRAMES_AUDIO_INPUT_HANDLE, 'audio'],
  ] as const);
  const seen = new Set<string>();
  const assets: HyperframesAgentAssetRef[] = [];
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
    if (!source) continue;
    const assetId = assetIdFromNode(source);
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    assets.push({ assetId, kind });
  }
  return assets;
};

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
  const prompt = promptFromEdges(params.nodeId, nodes, studio.edges) ?? data.prompt.trim();
  if (!prompt) throw new Error('Add a prompt or connect a Text node.');
  const assets = collectHyperframesAssets(params.nodeId, nodes, studio.edges);

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
    assets,
    skillIds: data.skillIds ?? [],
    brandBookPieces: data.brandBookPieces ?? [],
    aspectRatio: data.aspectRatio,
    durationSeconds: data.durationSeconds,
    resolution: data.resolution,
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
  studio.updateNodeData(params.nodeId, {
    sessionId: response.sessionId,
    activeRunId: response.runId,
    status: response.status === 'queued' ? 'queued' : 'drafting',
    isExecuting: true,
    error: undefined,
  });
  studio.triggerSave();
  return run;
}
