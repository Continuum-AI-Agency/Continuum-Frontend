'use client';
import { useTranslations } from 'next-intl';

// Right-click action menu for a portfolio / ad-set row or a timeline marker — the
// optimizer actions an operator reaches for without leaving the chart: run a cycle,
// tag creative angles, hold (freeze) budget, archive. Purely presentational: it
// takes callbacks and only renders the items whose handler is provided, so the same
// menu serves a portfolio card and an ad-set row with different verbs.

import type { ReactElement, ReactNode } from 'react';
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
  /** Single element: it becomes the context-menu trigger via Base UI `render`. */
  children: ReactElement;
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
  const uiText = useTranslations('scale');
  // Base UI's ContextMenuTrigger has no `disabled`; leaving the menu off entirely is the same
  // observable behaviour (right-click does nothing) without a dead trigger in the tree.
  if (disabled) return children;

  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-56">
        {label ? (
          <>
            <ContextMenuLabel className="truncate">{label}</ContextMenuLabel>
            <ContextMenuSeparator />
          </>
        ) : null}
        {onRun ? (
          <ContextMenuItem onSelect={onRun}>{uiText('run_cycle_now_ca7d02c')}</ContextMenuItem>
        ) : null}
        {onAnalyzeAngles ? (
          <ContextMenuItem onSelect={onAnalyzeAngles}>
            {uiText('analyze_creative_angles_86f20db')}
          </ContextMenuItem>
        ) : null}
        {onHold ? (
          <ContextMenuItem onSelect={onHold}>
            {uiText('hold_freeze_budget_24dc701')}
          </ContextMenuItem>
        ) : null}
        {onArchive ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={onArchive}
            >
              {uiText('archive_portfolio_827acab')}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
