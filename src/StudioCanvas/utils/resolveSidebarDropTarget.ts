import type { StudioNodeType } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import { getTargetHandleCandidatesForNodeType, resolveEdgeDataType } from './handleResolution';
import { getAllowedSourceHandles, isValidConnection } from './isValidConnection';

export interface SidebarDropTarget {
  nodeId: string;
  handleId: string;
}

export type AssetNodeType = 'image' | 'video' | 'audio' | 'document';

const SYNTHETIC_SOURCE_ID = '__sidebar-drop__';

/** The hit-test both resolvers default to. `elementsFromPoint` is absent outside a real
 *  browser (SSR, happy-dom), and an empty hit list is the correct answer there — the
 *  same answer a drop over the bare pane gives. */
const defaultElementsAtPoint = (x: number, y: number): Element[] =>
  typeof document !== 'undefined' && typeof document.elementsFromPoint === 'function'
    ? document.elementsFromPoint(x, y)
    : [];

// Where a Library sidebar asset drag should attach, hit-tested against the
// real rendered DOM rather than hand-maintained per-node pixel offsets: every
// xyflow handle carries data-handleid/data-nodeid + class react-flow__handle,
// every node wrapper carries data-id + class react-flow__node. Falls back
// from an exact handle hit to the node body's highest-priority open handle,
// then to null (caller keeps today's unconnected-node behavior) if neither
// is a compatible, non-full target — isValidConnection is the single source
// of truth for "compatible" (type match + connection limits + single-text
// -input rules), so no validation logic is duplicated here.
export function resolveSidebarDropTarget(
  clientX: number,
  clientY: number,
  assetNodeType: AssetNodeType,
  nodes: StudioNode[],
  edges: Edge[],
  getElementsAtPoint: (x: number, y: number) => Element[] = defaultElementsAtPoint,
): SidebarDropTarget | null {
  const hits = getElementsAtPoint(clientX, clientY);
  const syntheticSource = { id: SYNTHETIC_SOURCE_ID, type: assetNodeType, data: {} };
  const nodesWithSynthetic = [...nodes, syntheticSource];

  const isValidTarget = (nodeId: string, handleId: string): boolean =>
    isValidConnection(
      {
        source: SYNTHETIC_SOURCE_ID,
        sourceHandle: assetNodeType,
        target: nodeId,
        targetHandle: handleId,
      },
      edges,
      nodesWithSynthetic,
    );

  const handleElement = hits.find((el) => el.classList.contains('react-flow__handle'));
  if (handleElement instanceof HTMLElement) {
    const { nodeid: nodeId, handleid: handleId } = handleElement.dataset;
    if (nodeId && handleId) {
      return isValidTarget(nodeId, handleId) ? { nodeId, handleId } : null;
    }
  }

  const nodeElement = hits.find((el) => el.classList.contains('react-flow__node'));
  if (nodeElement instanceof HTMLElement) {
    const nodeId = nodeElement.dataset.id;
    const node = nodes.find((n) => n.id === nodeId);
    if (nodeId && node?.type) {
      // Walk the ranked candidates, not just the head: on a frames-mode video node
      // a second image must fall through a full first-frame onto last-frame instead
      // of dropping the connection entirely.
      const candidates = getTargetHandleCandidatesForNodeType(
        node.type as StudioNodeType,
        assetNodeType,
        node.data,
      );
      const handleId = candidates.find((candidate) => isValidTarget(nodeId, candidate));
      if (handleId) {
        return { nodeId, handleId };
      }
    }
  }

  return null;
}

/** A drop that no handle accepted, but which the canvas can still offer to wire. */
export interface BurnInDropOffer {
  /** The node whose video output the image would be burned into. */
  videoNodeId: string;
  /** The handle that video comes out of — the burn-in's base input edge starts here. */
  videoHandleId: string;
}

/**
 * An IMAGE dropped on the body of a node that emits VIDEO.
 *
 * No video-producing node has an image input, so `resolveSidebarDropTarget` correctly
 * returns null for this and the asset lands unconnected next to the clip — the drop the
 * user most obviously meant is the one that does nothing. This names it instead: the
 * caller offers "Burn in as overlay" and, if taken, builds the wired action node.
 *
 * Deliberately a SECOND function rather than a third outcome on the first one: the
 * connect path is a hit-test for a compatible handle, this is a hit-test for the
 * absence of one, and widening the shared return type would have every existing caller
 * branching on a case it does not handle.
 *
 * "Emits video" is asked of `getAllowedSourceHandles` + `resolveEdgeDataType`, the same
 * pair the connection validator uses — so an action node set to a video op counts, and a
 * node whose output modality changes with its config cannot get stale here.
 */
export function resolveBurnInDropTarget(
  clientX: number,
  clientY: number,
  assetNodeType: AssetNodeType,
  nodes: StudioNode[],
  getElementsAtPoint: (x: number, y: number) => Element[] = defaultElementsAtPoint,
): BurnInDropOffer | null {
  if (assetNodeType !== 'image') return null;

  const hits = getElementsAtPoint(clientX, clientY);
  const nodeElement = hits.find((el) => el.classList.contains('react-flow__node'));
  if (!(nodeElement instanceof HTMLElement)) return null;

  const nodeId = nodeElement.dataset.id;
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!nodeId || !node?.type) return null;

  const graphNode = { id: nodeId, type: node.type, data: node.data as Record<string, unknown> };
  const videoHandleId = getAllowedSourceHandles(graphNode).find(
    (handle) => resolveEdgeDataType(handle, graphNode) === 'video',
  );
  return videoHandleId ? { videoNodeId: nodeId, videoHandleId } : null;
}
