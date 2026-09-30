'use client';

import { Handle, NodeResizer, Position, useUpdateNodeInternals } from '@xyflow/react';
import { type LucideIcon, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { Node, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import { NodeTitleBar } from './NodeChrome';

export function ImplementationNode({
  id,
  selected,
  title,
  icon,
  summary,
  status,
  error,
  inputs = [],
  outputs = [],
  children,
}: {
  id: string;
  selected?: boolean;
  title: string;
  icon: LucideIcon;
  summary: string;
  status: string;
  error?: string;
  inputs?: { id: string; label: string }[];
  outputs?: { id: string; label: string }[];
  children?: ReactNode;
}) {
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const updateInternals = useUpdateNodeInternals();
  const minimumHeight = Math.max(220, Math.max(inputs.length, outputs.length) * 20 + 110);
  const ports = [...inputs, ...outputs].map((port) => port.id).join('|');
  useEffect(() => {
    updateInternals(id);
  }, [id, ports, updateInternals]);
  const configure = () => {
    const store = useStudioStore.getState();
    store.setNodes(store.nodes.map((node) => ({ ...node, selected: node.id === id })));
  };
  return (
    <div className="relative h-full min-w-[280px]" style={{ minHeight: minimumHeight }}>
      <NodeResizer minWidth={280} minHeight={minimumHeight} isVisible={selected} />
      <Node
        selected={selected || isSelectedByOther}
        style={isSelectedByOther ? { borderColor: selectingUser?.color } : undefined}
        handles={{ target: false, source: false }}
        className="h-full w-full overflow-hidden p-0"
      >
        <NodeTitleBar icon={icon} label={title} />
        <NodeContent className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <p className="truncate text-sm font-medium" title={summary}>
            {summary}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {inputs.slice(0, 4).map((port) => (
              <span key={port.id}>{port.label}</span>
            ))}
            {inputs.length > 4 ? <span>+{inputs.length - 4} inputs</span> : null}
          </div>
          <p role="status" className="text-xs leading-relaxed text-muted-foreground">
            {status}
          </p>
          {error ? (
            <p role="alert" className="text-xs leading-relaxed text-destructive">
              {error}
            </p>
          ) : null}
          <div className="nodrag mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" aria-label={`Configure ${title}`} onClick={configure}>
              <SlidersHorizontal className="size-3.5" aria-hidden /> Configure
            </Button>
            {children}
          </div>
        </NodeContent>
      </Node>
      {(
        [
          ['target', Position.Left, inputs],
          ['source', Position.Right, outputs],
        ] as const
      ).map(([type, position, items]) =>
        items.map((port, index) => (
          <Handle
            key={`${type}:${port.id}`}
            type={type}
            position={position}
            id={port.id}
            title={port.label}
            aria-label={port.label}
            className="studio-handle !size-3 !border-2"
            style={{ top: `${38 + (index * 48) / Math.max(1, items.length)}%` }}
          />
        )),
      )}
    </div>
  );
}
