'use client';

// The board's header (O01): how Continuum works this account — the mode, as a badge, and the
// reading's sentence for it, in the account's language — and the result that counts, as a chip.
// The layout switch sits at its right. The mode's tone tints the band; the sentence stays in the
// foreground tokens.

import type { AdAccountMode, AdAccountReading } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  Bot,
  type IconComponent,
  ListChecks,
  Plus,
  Target,
  TriangleAlert,
  Users,
} from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../format';
import { formatResultCount } from './modules/resultHeroModel';

const MODE_ICON: Record<AdAccountMode, IconComponent> = {
  fix: TriangleAlert,
  operate: Bot,
  approve: Users,
  recommend: ListChecks,
  setup: Plus,
};

/** The band's tint and the badge, per mode: a fix reads as a problem, autopilot as running,
 *  approval as waiting on a person; recommend and setup stay neutral. */
const MODE_TONE: Record<AdAccountMode, { band: string; badge: string }> = {
  fix: {
    band: 'border-destructive/30 bg-destructive/5',
    badge: 'border-destructive/30 text-destructive-ink',
  },
  operate: { band: 'border-success/30 bg-success/5', badge: 'border-success/30 text-success-ink' },
  approve: { band: 'border-primary/30 bg-primary/5', badge: 'border-primary/30 text-primary-ink' },
  recommend: { band: 'bg-card', badge: 'border-border text-foreground' },
  setup: { band: 'bg-card', badge: 'border-border/60 text-muted-foreground' },
};

/** "leads reales · goal $99 MXN": what counts on this account, with its count and goal when the
 *  reading has them. The label is the reading's, in the account's language; `withGoal` words the
 *  goal in the UI's. */
export function resultChipText(
  result: AdAccountReading['result'],
  withGoal: (label: string, goal: string) => string,
): string {
  const label =
    result.count != null ? `${formatResultCount(result.count)} ${result.label}` : result.label;
  return result.goal != null
    ? withGoal(label, formatCurrency(result.goal, result.currency))
    : label;
}

export function BoardHeader({
  reading,
  toggle,
}: {
  reading: AdAccountReading;
  /** The layout switch, drawn at the header's right. */
  toggle?: ReactNode;
}) {
  const uiText = useTranslations('scale');
  const Icon = MODE_ICON[reading.mode];
  const tone = MODE_TONE[reading.mode];
  return (
    <header className="flex flex-wrap items-start gap-2" data-testid="board-header">
      <div
        className={cn(
          'flex min-w-0 flex-[1_1_18rem] flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-sm leading-snug',
          tone.band,
        )}
        data-mode={reading.mode}
        data-testid="board-mode"
      >
        <Badge
          className={cn('gap-1 bg-background', tone.badge)}
          data-testid="board-mode-label"
          variant="outline"
        >
          <Icon aria-hidden="true" />
          {reading.modeLabel}
        </Badge>
        <span className="min-w-0 text-foreground" data-testid="board-mode-reason">
          {reading.modeReason}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs"
          data-testid="board-result-chip"
          title={uiText('the_result_that_counts_on_this_account_99311da')}
        >
          <Target aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {resultChipText(reading.result, (label, goal) =>
              uiText('label_goal_goal_85aaad8', { label, goal }),
            )}
          </span>
        </span>
        {toggle}
      </div>
    </header>
  );
}
