'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NodeType, SourceDropCandidate } from '../hooks/useEdgeDropNode';

interface SourceDropNodePickerProps {
  candidates: SourceDropCandidate[];
  screenPosition: { x: number; y: number };
  onSelect: (nodeType: NodeType) => void;
  onDismiss: () => void;
}

// Appears where the user releases a drag off an output/source handle onto
// empty canvas, when more than one node type could plausibly consume that
// output. Anchored to a zero-size fixed-position marker at the drop's screen
// coordinates (not flow coordinates) so it tracks the cursor, not the canvas
// pan/zoom. DropdownMenu's own focus/Escape/click-outside handling covers
// dismissal — no bespoke listener needed.
export function SourceDropNodePicker({
  candidates,
  screenPosition,
  onSelect,
  onDismiss,
}: SourceDropNodePickerProps) {
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DropdownMenuTrigger
        render={
          <div
            className="pointer-events-none fixed h-0 w-0"
            style={{ left: screenPosition.x, top: screenPosition.y }}
          />
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Connect to…</DropdownMenuLabel>
        {candidates.map((candidate) => (
          <DropdownMenuItem key={candidate.nodeType} onSelect={() => onSelect(candidate.nodeType)}>
            {candidate.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
