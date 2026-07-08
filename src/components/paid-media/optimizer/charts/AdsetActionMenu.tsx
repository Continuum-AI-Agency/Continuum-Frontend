'use client';

// Right-click action menu for a portfolio / ad-set row or a timeline marker — the
// optimizer actions an operator reaches for without leaving the chart: run a cycle,
// tag creative angles, hold (freeze) budget, archive. Purely presentational: it
// takes callbacks and only renders the items whose handler is provided, so the same
// menu serves a portfolio card and an ad-set row with different verbs.

import type { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

type AdsetActionMenuProps = {
  label?: string;
  disabled?: boolean;
  onRun?: () => void;
  onAnalyzeAngles?: () => void;
  onHold?: () => void;
  onArchive?: () => void;
  children: ReactNode;
};

export function AdsetActionMenu({
  label,
  disabled,
  onRun,
  onAnalyzeAngles,
  onHold,
  onArchive,
  children,
}: AdsetActionMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={disabled}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {label ? (
          <>
            <ContextMenuLabel className="truncate">{label}</ContextMenuLabel>
            <ContextMenuSeparator />
          </>
        ) : null}
        {onRun ? <ContextMenuItem onSelect={onRun}>Run cycle now</ContextMenuItem> : null}
        {onAnalyzeAngles ? (
          <ContextMenuItem onSelect={onAnalyzeAngles}>Analyze creative angles</ContextMenuItem>
        ) : null}
        {onHold ? <ContextMenuItem onSelect={onHold}>Hold — freeze budget</ContextMenuItem> : null}
        {onArchive ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={onArchive}
            >
              Archive portfolio
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
