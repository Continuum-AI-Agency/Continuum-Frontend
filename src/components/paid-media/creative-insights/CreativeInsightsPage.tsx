'use client';

// Creative Insights, the reading half: it owns the queries and hands CreativeInsightsView
// plain data. It replaces the "What's working" view on the Scale bar.
//
// Reads, all existing:
//   - paid_media_get_adset_creative_winrates (angle_id), per window — the Optimizer's own hook,
//     so the cache is shared with a portfolio's "Angle to run next" panel.
//   - paid_media_get_ad_angles, brand-wide (useAccountAdAngles).
//   - the account's ad-set inventory — the only read that ties an ad set to THIS ad account;
//     neither creative RPC carries one.
//   - the materialized creative report (verdicts + synopsis) and the account's currency.

import type { FunnelTab } from '@continuum/contracts';
import { useMemo, useState } from 'react';
import { WhatsWorkingExplorerPopover } from '@/components/paid-media/dashboard/whats-working/WhatsWorkingExplorerPopover';
import { selectVerdictsByKind } from '@/components/paid-media/dashboard/whats-working/whatsWorkingModel';
import {
  useAdAccountCurrency,
  useOptimizerAdsetCreativeWinrates,
  useOptimizerAdsetInventory,
} from '@/components/paid-media/optimizer/useOptimizerData';
import { usePaidCreativeRecovery } from '@/hooks/usePaidCreativeRecovery';
import { usePaidCreativeReport } from '@/hooks/usePaidCreativeReport';
import { type CreativeInsightsAdsState, CreativeInsightsView } from './CreativeInsightsView';
import {
  angleIdByAd,
  angleLabel,
  buildAccountAngleRows,
  buildNextAngleRows,
  composeAngleRead,
  type InsightsWindow,
  neverTestedAngles,
  scopeVerdicts,
  scopeWinrateRows,
} from './creativeInsightsModel';
import { useAccountAdAngles } from './useAccountAdAngles';

export function CreativeInsightsPage({
  brandId,
  adAccountId,
}: {
  brandId: string;
  adAccountId: string | null;
}) {
  const [lookback, setLookback] = useState<InsightsWindow>('d7');
  const [funnel, setFunnel] = useState<FunnelTab>('all');

  const winrates = useOptimizerAdsetCreativeWinrates(brandId, lookback, 'angle_id');
  const inventory = useOptimizerAdsetInventory(brandId, adAccountId);
  const adAngles = useAccountAdAngles(brandId);
  const currency = useAdAccountCurrency(brandId, adAccountId);
  const { status, report, isLoading: reportLoading } = usePaidCreativeReport(brandId);
  const { freshUrlById, recover } = usePaidCreativeRecovery({ brandId, adAccountId });

  // The account's ad sets. While the inventory loads the page waits; if it fails or comes
  // back empty the rows fall back to brand-wide and the view says so.
  const scope = useMemo<ReadonlySet<string> | null>(
    () => (inventory.data.length > 0 ? new Set(inventory.data.map((adset) => adset.id)) : null),
    [inventory.data],
  );
  const nameById = useMemo(
    () =>
      new Map(
        inventory.data.flatMap((adset) => (adset.name ? [[adset.id, adset.name] as const] : [])),
      ),
    [inventory.data],
  );

  const model = useMemo(() => {
    const scopedRows = scopeWinrateRows(winrates.data, scope);
    const angleByAd = angleIdByAd(adAngles.data, scope);
    const verdicts = scopeVerdicts(report?.verdicts ?? [], scope);
    const nextRows = buildNextAngleRows(scopedRows, nameById);
    const angleRows = buildAccountAngleRows({
      scopedRows,
      standing: nextRows,
      angleByAd,
      verdicts,
    });
    const angleLabelByAd = new Map<string, string>();
    for (const [adId, angleId] of angleByAd) {
      const label = angleLabel(angleId);
      if (label) angleLabelByAd.set(adId, label);
    }
    return {
      angleRows,
      nextRows,
      neverTested: neverTestedAngles(angleByAd, scopedRows),
      read: composeAngleRead(angleRows),
      verdicts,
      angleLabelByAd,
    };
  }, [winrates.data, adAngles.data, report, scope, nameById]);

  const verdictsByKind = useMemo(
    () => selectVerdictsByKind(report ? { ...report, verdicts: model.verdicts } : null, funnel),
    [report, model.verdicts, funnel],
  );

  const ads: CreativeInsightsAdsState =
    status === 'assembling' && !report
      ? { status: reportLoading ? 'loading' : 'assembling' }
      : status === 'empty' || !report
        ? { status: 'empty' }
        : {
            status: 'ready',
            verdictsByKind,
            synopsis: report.synopsis,
            freshUrlById,
            onRecover: recover,
            angleLabelByAd: model.angleLabelByAd,
          };

  return (
    <CreativeInsightsView
      ads={ads}
      angleRows={model.angleRows}
      anglesError={winrates.isError}
      anglesLoading={winrates.isLoading || inventory.isLoading || adAngles.isLoading}
      currency={currency}
      explorer={<WhatsWorkingExplorerPopover brandId={brandId} />}
      funnel={funnel}
      nextRows={model.nextRows}
      neverTested={model.neverTested}
      onFunnelChange={setFunnel}
      onLookbackChange={setLookback}
      read={model.read}
      lookback={lookback}
      scope={scope ? 'account' : 'brand'}
    />
  );
}
