'use client';

// One applied Technique, folded to a single card.
//
// It draws a handle for EVERY port the fold derived, not just the labelled ones: a
// re-anchored boundary edge whose handle is missing is an edge React Flow silently
// drops, which is the one thing this feature must never do. `collapsedModulePorts`
// guarantees the port exists; this component guarantees the handle does.
//
// The card owns no persisted state. Its position is the module's top-left, its
// selection is derived from the members, and expanding restores their exact original
// positions because folding never moved them.

import type { CanvasTechniquePort } from '@continuum/contracts';
import { Handle, type NodeProps, Position, type Node as ReactFlowNode } from '@xyflow/react';
import { Blocks, Maximize2 } from 'lucide-react';
import type React from 'react';

import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { useModuleFoldStore } from '../stores/useModuleFoldStore';
import { COLLAPSED_NODE_TYPE, type CollapsedModuleData } from '../utils/moduleFold';
import { EDGE_COLOR_BY_MODALITY } from './modalityPreview';
import { NodeTitleBar } from './NodeChrome';

const PORT_ROW_HEIGHT = 22;
const FIRST_PORT_TOP = 52;

const portColor = (port: CanvasTechniquePort): string => {
  if (port.dataType === 'image') return EDGE_COLOR_BY_MODALITY.image;
  if (port.dataType === 'video') return EDGE_COLOR_BY_MODALITY.video;
  return EDGE_COLOR_BY_MODALITY.text;
};

const handleStyle = (port: CanvasTechniquePort, index: number): React.CSSProperties => ({
  ['--edge-color' as keyof React.CSSProperties]: portColor(port),
  top: FIRST_PORT_TOP + index * PORT_ROW_HEIGHT,
});

function PortColumn({ ports, side }: { ports: CanvasTechniquePort[]; side: 'input' | 'output' }) {
  const isInput = side === 'input';
  return (
    <>
      {ports.map((port, index) => (
        <div
          key={port.id}
          className={`pointer-events-none absolute flex items-center gap-1 text-[10px] text-muted-foreground ${
            isInput ? 'left-2' : 'right-2 flex-row-reverse'
          }`}
          style={{ top: FIRST_PORT_TOP + index * PORT_ROW_HEIGHT - 7 }}
        >
          <span className="max-w-[92px] truncate">{port.label ?? port.handleId}</span>
        </div>
      ))}
      {ports.map((port, index) => (
        <Handle
          key={`handle-${port.id}`}
          type={isInput ? 'target' : 'source'}
          position={isInput ? Position.Left : Position.Right}
          id={port.id}
          className="studio-handle !size-3"
          style={handleStyle(port, index)}
        />
      ))}
    </>
  );
}

export function TechniqueNode({ data, selected }: NodeProps<ReactFlowNode<CollapsedModuleData>>) {
  const expandModule = useModuleFoldStore((state) => state.expandModule);
  const rows = Math.max(data.inputPorts.length, data.outputPorts.length);

  return (
    <div
      className="relative w-[240px]"
      style={{ height: 48 + rows * PORT_ROW_HEIGHT }}
      data-testid="technique-node"
      data-module-id={data.moduleId}
    >
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="size-full overflow-hidden border-border/60 bg-background"
      >
        <NodeTitleBar icon={Blocks} label={data.label} title={data.label}>
          <button
            type="button"
            aria-label={`Expand ${data.label}`}
            data-testid="technique-node-expand"
            className="nodrag shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => expandModule(data.moduleId)}
          >
            <Maximize2 className="size-3" aria-hidden />
          </button>
        </NodeTitleBar>
        <NodeContent className="px-1.5 py-1">
          <p className="text-[10px] text-muted-foreground">
            {data.memberCount} {data.memberCount === 1 ? 'node' : 'nodes'} folded
          </p>
        </NodeContent>
      </CanvasNode>
      <PortColumn ports={data.inputPorts} side="input" />
      <PortColumn ports={data.outputPorts} side="output" />
    </div>
  );
}

/**
 * Composed into the canvas node map at the shell, NOT added to `canvasNodeTypes`:
 * `techniqueCollapsed` is a view type with no contracts registry entry, and that file's
 * drift guard rightly refuses anything that is not a `StudioNodeType`.
 */
export const FOLD_NODE_TYPES = { [COLLAPSED_NODE_TYPE]: TechniqueNode };
