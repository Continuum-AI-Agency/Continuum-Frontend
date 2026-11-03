'use client';

// H13 Account doctor: how many of the brand's readable checks pass, and the ones to fix first,
// each with the place it is fixed. No 0–100 score (there are no agreed weights). The expanded
// module lists every check, with the ones Continuum cannot read yet set apart.
//
// Headline: `data-value` = passing checks, `data-total` = readable checks (passing + failing);
// the reads behind each check are in doctorModel.ts's header (the bench anchor).

import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { CheckIcon, FixLink } from './DoctorParts';
import { doctorView, failingChecks } from './doctorModel';
import { useDoctorReads } from './useDoctorReads';

const Module = lazy(() => import('./Module'));

const FAILING_SHOWN: Record<HomeTileProps['tile']['size'], number> = { s: 1, m: 2, l: 4 };

export default function HealthTile({ ctx, tile }: HomeTileProps) {
  const reads = useDoctorReads(ctx.brandId, ctx.adAccounts);
  const view = doctorView({
    issues: ctx.reading.issues,
    portfolios: reads.portfolios,
    adAccounts: ctx.adAccounts,
    accountReads: reads.accountReads,
    googleCards: reads.googleCards,
    setup: ctx.setup,
  });

  if (view.state === 'loading') {
    return (
      <HomeTileFrame state="loading" tile={tile}>
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </HomeTileFrame>
    );
  }
  if (view.state === 'error') {
    return (
      <HomeTileFrame state="error" tile={tile}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs">The account checks could not be read.</p>
          <Button onClick={reads.retry} size="sm" type="button" variant="outline">
            Retry
          </Button>
        </div>
      </HomeTileFrame>
    );
  }
  if (view.state === 'missing') {
    return (
      <HomeTileFrame state="missing" tile={tile}>
        <TileMissing>{view.reason}</TileMissing>
      </HomeTileFrame>
    );
  }

  const failing = failingChecks(view.checks);
  const shown = failing.slice(0, FAILING_SHOWN[tile.size]);
  const passShare = view.total > 0 ? (view.passing / view.total) * 100 : 0;
  return (
    <HomeTileFrame
      badge={view.failing === 0 ? 'Nothing to fix' : `${view.failing} to fix`}
      expanded={<Module view={view} />}
      expandedDescription="Every check Continuum can read for this brand, and where each one is fixed."
      state="ready"
      tile={tile}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <p
          className="font-semibold text-2xl tabular-nums tracking-tight"
          data-failing={view.failing}
          data-testid="home-tile-health-headline"
          data-total={view.total}
          data-value={view.passing}
        >
          {view.passing} of {view.total}{' '}
          <span className="font-normal text-muted-foreground text-xs">checks pass</span>
        </p>
        <div
          aria-label={`${view.passing} of ${view.total} checks pass`}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="img"
        >
          <div
            className={view.failing === 0 ? 'h-full bg-emerald-500' : 'h-full bg-amber-500'}
            style={{ width: `${passShare}%` }}
          />
        </div>
        {shown.length > 0 ? (
          <ul className="hit-area-column space-y-1.5" data-testid="home-health-failing">
            {shown.map((check) => (
              <li className="flex min-w-0 items-start gap-2" key={check.id}>
                <CheckIcon status={check.status} />
                <span className="min-w-0 flex-1 text-xs leading-snug">{check.label}</span>
                {check.fix ? <FixLink fix={check.fix} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">Every check that can be read passes.</p>
        )}
      </div>
    </HomeTileFrame>
  );
}
