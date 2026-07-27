import type { StudioNodeType } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import { getTargetHandleCandidatesForNodeType } from './handleResolution';
import { isValidConnection } from './isValidConnection';

export interface SidebarDropTarget {
  nodeId: string;
  handleId: string;
}

export type AssetNodeType = 'image' | 'video' | 'audio' | 'document';

const SYNTHETIC_SOURCE_ID = '__sidebar-drop__';

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
  getElementsAtPoint: (x: number, y: number) => Element[] = (x, y) =>
    document.elementsFromPoint(x, y),
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
