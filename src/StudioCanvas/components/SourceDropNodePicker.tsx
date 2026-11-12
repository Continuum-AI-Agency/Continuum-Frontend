'use client';

import { useTranslations as useUiTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NodeType, SourceDropCandidate } from '../hooks/useEdgeDropNode';
import { useStudioMetadata } from '../hooks/useStudioMetadata';

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
  const translateUi = useUiTranslations('studio');
  const registryText = useStudioMetadata();

  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      {/* The marker is a positioning anchor, not a control: the menu is opened by the
          drop, never by a click. `nativeButton={false}` is what tells Base UI the render
          element is deliberately not a <button> — left at its default it warns on every
          drop. */}
      <DropdownMenuTrigger
        nativeButton={false}
        render={
          <div
            className="pointer-events-none fixed h-0 w-0"
            style={{ left: screenPosition.x, top: screenPosition.y }}
          />
        }
      />
      <DropdownMenuContent align="start">
        {/* Base UI's GroupLabel reads its group's context and THROWS outside one — this
            picker rendered nothing at all until the group was here. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{translateUi('connect_to_a86fff7b')}</DropdownMenuLabel>
          {candidates.map((candidate) => (
            <DropdownMenuItem
              key={candidate.nodeType}
              onSelect={() => onSelect(candidate.nodeType)}
            >
              {registryText(candidate.label)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
