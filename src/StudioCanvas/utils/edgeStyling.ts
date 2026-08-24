import type { Edge } from '@xyflow/react';
import type { CSSProperties } from 'react';

import type { StudioNode } from '../types';

// A generator is "ready" when it has a prompt — typed on the node or wired in from a
// text node. Readiness is what paints an edge solid instead of dotted, so the canvas
// shows at a glance which branches would actually produce something on Run.
export function computeReadyNodeIds(nodes: StudioNode[], edges: Edge[]): Set<string> {
  const isGeneratorReady = (node: StudioNode) => {
    if (node.type === 'nanoGen') {
      const hasPromptEdge = edges.some(
        (edge) => edge.target === node.id && edge.targetHandle === 'prompt',
      );
      const promptValue =
        typeof (node.data as { positivePrompt?: string }).positivePrompt === 'string'
          ? (node.data as { positivePrompt?: string }).positivePrompt?.trim()
          : '';
      return hasPromptEdge || !!promptValue;
    }

    if (node.type === 'videoGen' || node.type === 'veoDirector' || node.type === 'veoFast') {
      const hasPromptEdge = edges.some(
        (edge) => edge.target === node.id && edge.targetHandle === 'prompt-in',
      );
      const promptValue =
        typeof (node.data as { prompt?: string }).prompt === 'string'
          ? (node.data as { prompt?: string }).prompt?.trim()
          : '';
      return hasPromptEdge || !!promptValue;
    }

    return false;
  };

  return new Set(nodes.filter(isGeneratorReady).map((node) => node.id));
}

const resolveDataType = (edge: Edge) => {
  const dataType = (edge.data as { dataType?: string } | undefined)?.dataType;
  if (
    dataType === 'image' ||
    dataType === 'video' ||
    dataType === 'audio' ||
    dataType === 'document' ||
    dataType === 'text'
  ) {
    return dataType;
  }
  if (edge.sourceHandle === 'image') return 'image';
  if (edge.sourceHandle === 'video') return 'video';
  if (edge.sourceHandle === 'audio') return 'audio';
  if (edge.sourceHandle === 'document') return 'document';
  return 'text';
};

const resolvePathType = (edge: Edge) => {
  const dataPathType = (edge.data as { pathType?: string } | undefined)?.pathType;
  if (
    dataPathType === 'bezier' ||
    dataPathType === 'straight' ||
    dataPathType === 'step' ||
    dataPathType === 'smoothstep'
  ) {
    return dataPathType;
  }
  if (
    edge.type === 'bezier' ||
    edge.type === 'straight' ||
    edge.type === 'step' ||
    edge.type === 'smoothstep'
  ) {
    return edge.type;
  }
  return 'bezier';
};

// Every edge is rendered by the one `dataType` edge component; colour and dotted-ness
// ride on the class and the `--edge-color` custom property rather than on a per-edge
// component choice, so a stored edge from any era paints the same way.
export function computeStyledEdges(edges: Edge[], nodes: StudioNode[], readyNodeIds: Set<string>) {
  const nodeTypeById = new Map(nodes.map((node) => [node.id, node.type]));

  return edges.map((edge) => {
    const dataType = resolveDataType(edge);
    const targetType = nodeTypeById.get(edge.target);
    const isTargetGenerator =
      targetType === 'nanoGen' ||
      targetType === 'videoGen' ||
      targetType === 'veoDirector' ||
      targetType === 'veoFast';
    const isActive = isTargetGenerator && readyNodeIds.has(edge.target);
    const isDotted = isTargetGenerator && !readyNodeIds.has(edge.target);
    const pathType = resolvePathType(edge);
    const className = [
      edge.className,
      'studio-edge',
      isActive ? 'studio-edge--active' : '',
      isDotted ? 'studio-edge--inactive' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return {
      ...edge,
      type: 'dataType',
      animated: false,
      className,
      style: {
        ...edge.style,
        ['--edge-color' as keyof CSSProperties]: `var(--edge-${dataType})`,
      },
      data: {
        ...(edge.data as Record<string, unknown> | undefined),
        dataType,
        isActive,
        isDotted,
        pathType,
      },
    };
  });
}
