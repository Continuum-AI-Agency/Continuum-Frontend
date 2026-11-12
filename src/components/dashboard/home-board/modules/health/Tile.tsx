'use client';
import {
  useTranslations as useBetaTranslations,
  useTranslations as useExtraTranslations,
  useLocale,
} from 'next-intl';

// H13 Account doctor: how many of the brand's readable checks pass, and the ones to fix first,
// each with the place it is fixed. No 0–100 score (there are no agreed weights). The expanded
// module lists every check, with the ones Continuum cannot read yet set apart.
//
// Headline: `data-value` = passing checks, `data-total` = readable checks (passing + failing);
// the reads behind each check are in doctorModel.ts's header (the bench anchor).

import { type HomeAccountHygieneData, homeAccountHygieneReadSchema } from '@continuum/contracts';
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

const FAILING_SHOWN: Record<HomeTileProps['tile']['size'], number> = {
  s: 1,
  m: 2,
  l: 4,
};

export default function HealthTile({ ctx, tile }: HomeTileProps) {
  const extraUiText = useExtraTranslations('dashboard');

  const betaUiText = useBetaTranslations('dashboard');
  const scaleCopy = useBetaTranslations('scale');
  const uiLocale = useLocale();

  const reads = useDoctorReads(ctx.brandId, ctx.adAccounts);
  const hygiene = useHomeRead<HomeAccountHygieneData>({
    name: 'accountHygiene',
    brandId: ctx.brandId,
    schema: homeAccountHygieneReadSchema,
  });
  const view = doctorView(
    {
      issues: ctx.reading.issues,
      portfolios: reads.portfolios,
      adAccounts: ctx.adAccounts,
      accountReads: reads.accountReads,
      googleCards: reads.googleCards,
      setup: ctx.setup,
      hygiene,
    },
    betaUiText,
    scaleCopy,
    uiLocale,
  );

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
          <p className="text-muted-foreground text-xs">{betaUiText('beta_c57b5bcdbf81')}</p>
          <Button onClick={reads.retry} size="sm" type="button" variant="outline">
            {betaUiText('beta_942087cc2d41')}
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
          ? betaUiText('beta_b4f3c1ee72c3')
          : betaUiText('beta_aad8d67f307a', { value0: String(view.failing) })
      }
      expanded={<Module view={view} />}
      expandedDescription={extraUiText('home_f63fe9c5475f')}
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
          {view.passing} {betaUiText('beta_28391d3bc64e')} {view.total}{' '}
          <span className="font-normal text-muted-foreground text-xs">
            {betaUiText('beta_c392feddc4f4')}
          </span>
        </p>
        <div
          aria-label={betaUiText('beta_2920655323c4', {
            value0: String(view.passing),
            value1: String(view.total),
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
          <p className="text-muted-foreground text-xs">{betaUiText('beta_970bf116958d')}</p>
        )}
      </div>
    </HomeTileFrame>
  );
}
