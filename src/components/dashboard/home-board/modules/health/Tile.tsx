'use client';

// H13 Account doctor: how many of the brand's readable checks pass, and the ones to fix first,
// each with the place it is fixed. No 0–100 score (there are no agreed weights). The expanded
// module lists every check, with the ones Continuum cannot read yet set apart.
//
// Headline: `data-value` = passing checks, `data-total` = readable checks (passing + failing);
// the reads behind each check are in doctorModel.ts's header (the bench anchor).

import { type HomeAccountHygieneData, homeAccountHygieneReadSchema } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { useHomeRead } from '../../useHomeRead';
import { CheckIcon, FixLink } from './DoctorParts';
import { doctorView, failingChecks } from './doctorModel';
import { useDoctorReads } from './useDoctorReads';

const Module = lazy(() => import('./Module'));

const FAILING_SHOWN: Record<HomeTileProps['tile']['size'], number> = { s: 1, m: 2, l: 4 };

export default function HealthTile({ ctx, tile }: HomeTileProps) {
  const uiText = useTranslations('dashboard');
  const reads = useDoctorReads(ctx.brandId, ctx.adAccounts);
  const hygiene = useHomeRead<HomeAccountHygieneData>({
    name: 'accountHygiene',
    brandId: ctx.brandId,
    schema: homeAccountHygieneReadSchema,
  });
  const view = doctorView({
    issues: ctx.reading.issues,
    portfolios: reads.portfolios,
    adAccounts: ctx.adAccounts,
    accountReads: reads.accountReads,
    googleCards: reads.googleCards,
    setup: ctx.setup,
    hygiene,
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
          <p className="text-muted-foreground text-xs">
            {uiText('the_account_checks_could_not_be_read_c57b5bc')}
          </p>
          <Button onClick={reads.retry} size="sm" type="button" variant="outline">
            {uiText('retry_942087c')}
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
      badge={
        view.failing === 0
          ? uiText('nothing_to_fix_b4f3c1e')
          : uiText('count_to_fix_a7a9915', { count: view.failing })
      }
      expanded={<Module view={view} />}
      expandedDescription={uiText('every_check_continuum_can_read_for_this_brand_f63fe9c')}
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
          {uiText.rich('passing_of_total_muted_checks_pass_muted_c95638c', {
            passing: view.passing,
            total: view.total,
            muted: (chunks) => (
              <span className="font-normal text-muted-foreground text-xs">{chunks}</span>
            ),
          })}
        </p>
        <div
          aria-label={uiText('passing_of_total_checks_pass_9db0c64', {
            passing: view.passing,
            total: view.total,
          })}
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
          <p className="text-muted-foreground text-xs">
            {uiText('every_check_that_can_be_read_passes_970bf11')}
          </p>
        )}
      </div>
    </HomeTileFrame>
  );
}
