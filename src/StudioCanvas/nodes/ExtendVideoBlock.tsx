import React, { useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ExtendVideoNodeData } from '../types';
import { useNodeSelection } from '../contexts/PresenceContext';

export function ExtendVideoBlock({ id, selected }: NodeProps<Node<ExtendVideoNodeData>>) {
  const [isHovered, setIsHovered] = useState(false);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);

  return (
    <TooltipProvider>
      <div
        className={cn(
          "relative group h-full w-full min-w-[260px] min-h-[160px] rounded-xl transition-shadow",
          isSelectedByOther && "selected-by-other"
        )}
        style={{ 
          ['--other-user-color' as any]: selectingUser?.color 
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
      <Card className="h-full border border-subtle shadow-md bg-surface flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1 border-b border-subtle text-[10px] font-semibold uppercase tracking-widest text-secondary bg-default/70">
          <span>Extend Video</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-secondary text-xs">
          Placeholder block for future video extension workflows.
        </div>
      </Card>

      <div className="absolute -left-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 pointer-events-none">
        <div
          className="relative flex flex-col items-center group/handle"
          style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
        >
          <Handle
            type="target"
            position={Position.Left}
            id="video"
            className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125 pointer-events-auto"
          />
          <span className={cn(
            "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
            (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
          )}>
            Video Input
          </span>
        </div>

        <div
          className="relative flex flex-col items-center group/handle"
          style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-text)' }}
        >
          <Handle
            type="target"
            position={Position.Left}
            id="prompt"
            className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125 pointer-events-auto"
          />
          <span className={cn(
            "studio-handle-pill absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium shadow-md transition-opacity whitespace-nowrap z-50 pointer-events-none",
            (selected || isHovered) ? "opacity-100" : "opacity-0 group-hover/handle:opacity-100"
          )}>
            Prompt (Optional)
          </span>
        </div>
      </div>

      <div
        className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col items-center group/handle pointer-events-none"
        style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Handle
              type="source"
              position={Position.Right}
              id="video"
              className="studio-handle !w-4 !h-4 !border-2 shadow-sm transition-transform hover:scale-125 pointer-events-auto"
            />
          </TooltipTrigger>
          <TooltipContent>
            <p>Extended Video Output</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
    </TooltipProvider>
  );
}
