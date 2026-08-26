// A pass-through that pins one modality and hands it to everyone downstream.
//
// It draws exactly ONE source handle. The fan-out is MANY EDGES leaving that handle,
// not many handles — which is the entire point of the node: one upstream result, wired
// once, reused by every consumer without re-running the thing that produced it. A node
// with N output ports would be a splitter, and would need N of everything.

import {
  ROUTER_INPUT_HANDLE,
  ROUTER_OUTPUT_HANDLE,
  type StudioEmittedModality,
} from '@continuum/contracts';
import { Handle, type NodeProps, Position, type Node as ReactFlowNode } from '@xyflow/react';
import { Share2 } from 'lucide-react';
import type React from 'react';

import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import type { RouterNodeData } from '../types';
import { EDGE_COLOR_BY_MODALITY, ModalityPreview } from './modalityPreview';
import { NodeBadge, NodeTitleBar } from './NodeChrome';

const MODALITY_LABEL: Readonly<Record<StudioEmittedModality, string>> = {
  image: 'Image',
  video: 'Video',
  text: 'Text',
};

const handleStyle = (locked: StudioEmittedModality | null): React.CSSProperties => ({
  ['--edge-color' as keyof React.CSSProperties]: locked
    ? EDGE_COLOR_BY_MODALITY[locked]
    : 'var(--edge-text)',
});

export function RouterNode({ data, selected }: NodeProps<ReactFlowNode<RouterNodeData>>) {
  const locked = data.lockedType;

  return (
    <div className="relative h-[110px] w-[180px]">
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="size-full overflow-hidden border-border/60 bg-background"
      >
        <NodeTitleBar icon={Share2} label="Router">
          <NodeBadge>{locked ? MODALITY_LABEL[locked] : 'Unset'}</NodeBadge>
        </NodeTitleBar>
        <NodeContent className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/30 p-0">
          <ModalityPreview
            modality={locked}
            data={data}
            emptyLabel={locked ? 'Nothing through yet' : 'Connect a source'}
          />
        </NodeContent>
      </CanvasNode>
      <Handle
        type="target"
        position={Position.Left}
        id={ROUTER_INPUT_HANDLE}
        className="studio-handle !size-3"
        style={handleStyle(locked)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={ROUTER_OUTPUT_HANDLE}
        className="studio-handle !size-3"
        style={handleStyle(locked)}
      />
    </div>
  );
}
