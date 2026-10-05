// One leg of a cross-platform move, as both the queue row and the Activity decision print it:
// platform chip, the entity (its name, its id small beside it), before → after to the minor
// unit, and the side's percentage. Shared so the two surfaces cannot disagree about a leg.

import { ArrowRightIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { PlatformChip } from '../platforms/PlatformChip';
import type { AdPlatform } from '../platforms/platformTabsModel';
import { formatMinorExact, formatSidePct } from './queuedMoveModel';

export function MoveLegLine({
  platform,
  direction,
  entityName,
  entityId,
  beforeMinor,
  afterMinor,
  pct,
  currency,
  children,
  testId,
}: {
  platform: AdPlatform;
  direction: 'decrease' | 'increase' | null;
  entityName: string | null;
  entityId: string | null;
  beforeMinor: number | null;
  afterMinor: number | null;
  pct: number | null;
  currency: string | null;
  children?: React.ReactNode;
  testId: string;
}) {
  const money = (minor: number | null) => (minor == null ? '—' : formatMinorExact(minor, currency));
  return (
    <li
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
      data-direction={direction ?? undefined}
      data-platform={platform}
      data-testid={testId}
    >
      <PlatformChip platform={platform} />
      {direction ? (
        <span className="text-muted-foreground text-xs">
          {direction === 'decrease' ? 'Decrease' : 'Increase'}
        </span>
      ) : null}
      <span className="min-w-0 truncate font-medium">{entityName ?? entityId ?? 'Unnamed'}</span>
      {entityName && entityId ? (
        <span className="truncate font-mono text-muted-foreground text-xs">{entityId}</span>
      ) : null}
      <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums">
        <span className="text-muted-foreground">{money(beforeMinor)}</span>
        <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
        <span className="font-semibold">{money(afterMinor)}</span>
        <span className="text-muted-foreground">/day</span>
      </span>
      {pct != null ? (
        <span
          className={cn(
            'font-semibold text-xs tabular-nums',
            pct < 0 ? 'text-destructive' : 'text-success',
          )}
          data-testid="move-leg-pct"
        >
          {formatSidePct(pct)}
        </span>
      ) : null}
      {children}
    </li>
  );
}
