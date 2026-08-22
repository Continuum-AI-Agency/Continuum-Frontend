import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from './workflow-builder';
import {
  getVideoGeneratorReferenceModes,
  isVideoGeneratorNodeType,
  resolveVideoGeneratorModel,
  resolveVideoGeneratorReferenceMode,
  TIMELINE_MEDIA_INPUT_HANDLE,
  VIDEO_FRAME_HANDLES,
  VIDEO_IMAGE_REFERENCE_HANDLES,
  type VideoGeneratorReferenceMode,
} from './workflow-graph';

export interface WorkflowMigrationResult {
  graph: WorkflowGraph;
  migrated: boolean;
}

type LegacyClipSlot = {
  id?: unknown;
  order?: unknown;
  trimStartSec?: unknown;
  trimEndSec?: unknown;
  muteAudio?: unknown;
};

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const legacySlots = (node: WorkflowNode): LegacyClipSlot[] => {
  const value = node.data.clipSlots;
  if (!Array.isArray(value)) return [];
  return [...value].sort(
    (left, right) =>
      (finiteNumber((left as LegacyClipSlot).order) ?? 0) -
      (finiteNumber((right as LegacyClipSlot).order) ?? 0),
  ) as LegacyClipSlot[];
};

function migrateSplicer(
  node: WorkflowNode,
  edges: WorkflowEdge[],
): { node: WorkflowNode; incoming: WorkflowEdge[] } {
  const placements = legacySlots(node).flatMap((slot, order) => {
    const slotId = typeof slot.id === 'string' ? slot.id : '';
    if (!slotId) return [];
    const edge = edges.find(
      (candidate) => candidate.target === node.id && candidate.targetHandle === `clip-${slotId}`,
    );
    if (!edge) return [];
    return [
      {
        id: `migrated-splicer:${node.id}:${slotId}`,
        order,
        sourceNodeId: edge.source,
        kind: 'video' as const,
        ...(finiteNumber(slot.trimStartSec) !== undefined
          ? { trimStartSec: finiteNumber(slot.trimStartSec) }
          : {}),
        ...(finiteNumber(slot.trimEndSec) !== undefined
          ? { trimEndSec: finiteNumber(slot.trimEndSec) }
          : {}),
        ...(typeof slot.muteAudio === 'boolean' ? { muteAudio: slot.muteAudio } : {}),
      },
    ];
  });

  const connectedSources = [...new Set(placements.map((placement) => placement.sourceNodeId))];
  const incoming = connectedSources.map((source) => {
    const prior = edges.find((edge) => edge.target === node.id && edge.source === source);
    return {
      ...(prior ?? { id: `migrated-splicer-edge:${source}:${node.id}`, source, target: node.id }),
      sourceHandle: prior?.sourceHandle ?? 'video',
      targetHandle: TIMELINE_MEDIA_INPUT_HANDLE,
    } satisfies WorkflowEdge;
  });

  const { clipSlots: _clipSlots, ...data } = node.data;
  return {
    node: {
      ...node,
      type: 'timelineEditor',
      data: {
        ...data,
        items: placements,
        committed: Boolean(data.generatedVideoStoragePath),
      },
      style: { width: 320, height: 260 },
    },
    incoming,
  };
}

function migratePlannerPublisher(node: WorkflowNode): WorkflowNode {
  const { draftId, ...data } = node.data;
  return {
    ...node,
    type: 'plannerDraft',
    data: {
      ...data,
      format: 'video',
      ...(typeof draftId === 'string' && draftId ? { targetDraftId: draftId } : {}),
      assetSlots: [],
    },
    style: { width: 320, height: 300 },
  };
}

/**
 * `referenceMode` became user-selectable, and 'images' became legal for veo-3.1-fast.
 * A canvas saved with a mode that disagrees with how it is actually wired would have
 * its live edges pruned on the next load, so the WIRING is treated as the source of
 * truth and the stored mode is reconciled to it. A node with no reference wiring is
 * left alone — `migrated` gates a rewrite, and a false positive churns every canvas.
 */
function reconcileVideoReferenceMode(
  node: WorkflowNode,
  edges: readonly WorkflowEdge[],
): WorkflowNode | undefined {
  if (!isVideoGeneratorNodeType(node.type)) return undefined;

  const incoming = edges.filter((edge) => edge.target === node.id);
  const handleIn = (handles: readonly string[]) =>
    incoming.some((edge) => handles.includes(edge.targetHandle ?? ''));

  const wired: VideoGeneratorReferenceMode | undefined = handleIn(VIDEO_FRAME_HANDLES)
    ? 'frames'
    : handleIn(VIDEO_IMAGE_REFERENCE_HANDLES)
      ? 'images'
      : undefined;
  if (!wired) return undefined;

  if (!getVideoGeneratorReferenceModes(resolveVideoGeneratorModel(node)).includes(wired)) {
    return undefined;
  }
  if (resolveVideoGeneratorReferenceMode(node) === wired) return undefined;

  return { ...node, data: { ...node.data, referenceMode: wired } };
}

export function migrateStudioWorkflowGraph(input: {
  nodes?: readonly WorkflowNode[] | null;
  edges?: readonly WorkflowEdge[] | null;
  metadata?: Record<string, unknown>;
}): WorkflowMigrationResult {
  const originalNodes = [...(input.nodes ?? [])];
  const originalEdges = [...(input.edges ?? [])];
  const splicerIds = new Set(
    originalNodes.filter((node) => node.type === 'videoEditor').map((node) => node.id),
  );
  let migrated = splicerIds.size > 0;
  const replacementIncoming: WorkflowEdge[] = [];

  const nodes = originalNodes.map((node) => {
    if (node.type === 'videoEditor') {
      const replacement = migrateSplicer(node, originalEdges);
      replacementIncoming.push(...replacement.incoming);
      return replacement.node;
    }
    if (node.type === 'publishToPlanner') {
      migrated = true;
      return migratePlannerPublisher(node);
    }
    // `organicPublisher` was one node that found a draft AND was the publish sink. It is
    // now `plannerDraft` (find/create/edit) with publishing split out into its own node,
    // so a stored graph re-points on load. Data carries over unchanged — the node kept
    // every field it had.
    if (node.type === 'organicPublisher') {
      migrated = true;
      return { ...node, type: 'plannerDraft' };
    }
    const reconciled = reconcileVideoReferenceMode(node, originalEdges);
    if (reconciled) {
      migrated = true;
      return reconciled;
    }
    return node;
  });

  const edges = originalEdges.filter((edge) => !splicerIds.has(edge.target));
  edges.push(...replacementIncoming);

  return {
    graph: { nodes, edges, ...(input.metadata ? { metadata: input.metadata } : {}) },
    migrated,
  };
}
