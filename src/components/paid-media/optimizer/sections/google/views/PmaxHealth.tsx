'use client';

import { useLocale, useTranslations } from 'next-intl';
import { googleCopy } from '../googlePresentation';

// Performance Max health (P6 view 6): Poor asset groups first as their own finding, each group's
// Ad Strength, status and assets, then each PMax campaign's spend by network. Says plainly what
// no read returns (search categories, audience signals). Read-only; a group's fix is the Optimizer's
// asset-group card or Google Ads itself.

import type { GoogleBreakdownRead, GoogleSignalsRead } from '@continuum/contracts';
import type { ReactNode } from 'react';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { ChartEmpty } from '../../../charts/ChartStates';
import { currencyColumnSuffix, formatCurrencyInColumn } from '../../../format';
import { formatShare } from '../../detail/byPlatformModel';
import { windowRangeLabel } from '../../platforms/googleAdsOverviewModel';
import {
  type GoogleReadTarget,
  type GoogleReadWindow,
  useGoogleBreakdown,
  useGoogleCampaigns,
  useGoogleSignals,
} from '../googleReads';
import { reasonsOf } from './cell';
import {
  type AssetGroupRow,
  buildPmaxHealth,
  type NetworkSlice,
  networkSplit,
  PMAX_NOT_READ,
} from './pmaxHealthModel';
import { CellText, ReadGate, ReasonNotes, ScopeLine, type ViewRead, viewRead } from './viewParts';

export function PmaxNetworkSplitView({
  name,
  read,
  currency,
}: {
  name: string;
  read: ViewRead<GoogleBreakdownRead>;
  currency: string | null;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  function networkColumns(currency: string | null): InsightColumn<NetworkSlice>[] {
    return [
      { id: 'network', header: uiText('network_1744b96'), cell: (row) => row.network },
      {
        id: 'spend',
        header: uiText('helper_ffca96014e32', { v0: currencyColumnSuffix(currency) }),
        align: 'right',
        cell: (row) => formatCurrencyInColumn(row.spend, currency, uiLocale),
      },
      {
        id: 'share',
        header: uiText('share_29887a5'),
        align: 'right',
        cell: (row) => formatShare(row.share, uiLocale),
      },
      {
        id: 'conversions',
        header: uiText('conv_d3875d6'),
        align: 'right',
        cell: (row) => <CellText cell={row.conversions} />,
      },
      {
        id: 'cost',
        header: uiText('cost_conv_c39a57f'),
        align: 'right',
        cell: (row) => <CellText cell={row.costPerConversion} />,
      },
    ];
  }

  return (
    <section aria-label={uiText('template_39ae8be6096d', { v0: name })} className="space-y-2">
      <h4 className="font-medium text-sm">{uiText.rich('sentence_0e02ca348ece', { v0: name })}</h4>
      <ReadGate read={read}>
        {(data) => {
          const slices = networkSplit(data, data.currency ?? currency, uiLocale, uiText);
          if (slices.length === 0) {
            return (
              <ChartEmpty message={uiText('this_campaign_spent_nothing_in_the_window_7d68548')} />
            );
          }
          return (
            <div className="space-y-2">
              <ScopeLine>
                {uiText.rich('sentence_be83e2aaab46', {
                  v0: windowRangeLabel(data.range.since, data.range.until, uiLocale),
                })}
              </ScopeLine>
              <InsightDataTable
                columns={networkColumns(data.currency ?? currency)}
                getRowId={(row) => row.network}
                rows={slices}
              />
              <ReasonNotes
                reasons={reasonsOf(
                  slices.flatMap((row) => [row.conversions, row.costPerConversion]),
                )}
              />
            </div>
          );
        }}
      </ReadGate>
    </section>
  );
}

export function PmaxHealthView({
  read,
  campaignName,
  network,
}: {
  read: ViewRead<GoogleSignalsRead>;
  /** The campaign's name when the campaigns read has it. */
  campaignName: (campaignId: string) => string;
  /** One campaign's spend by network: its own read. */
  network: (campaignId: string, name: string) => ReactNode;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const GROUP_COLUMNS: InsightColumn<AssetGroupRow>[] = [
    {
      id: 'group',
      header: uiText('asset_group_0cdcb5b'),
      cell: (row) => (
        <span className="block min-w-40">
          <span className="font-medium">{row.name}</span>
          {row.missingItems.length > 0 ? (
            <span className="block text-muted-foreground text-xs">
              {uiText('pmax_missing_assets', { items: row.missingItems.join(' · ') })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'strength',
      header: uiText('ad_strength_7927af2'),
      cell: (row) => (
        <span className={row.poor ? 'font-medium text-destructive' : undefined}>
          <CellText cell={row.strength} />
        </span>
      ),
    },
    {
      id: 'status',
      header: uiText('status_920e413'),
      cell: (row) => <CellText cell={row.status} />,
    },
    {
      id: 'assets',
      header: uiText('assets_bd12731'),
      cell: (row) => <CellText cell={row.assets} />,
    },
  ];

  return (
    <ReadGate read={read}>
      {(data) => {
        const model = buildPmaxHealth(data, uiText, uiLocale);
        if (model.kind === 'unread') {
          return (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm" data-testid="pmax-unread">
                — {model.reason}
              </p>
              <p className="text-muted-foreground text-xs">{googleCopy(PMAX_NOT_READ, uiText)}</p>
            </div>
          );
        }
        if (model.groups.length === 0) {
          return (
            <ChartEmpty message={uiText('no_performance_max_campaign_in_this_account_41c0dc9')} />
          );
        }
        const window = data.signals?.window;
        return (
          <div className="space-y-4">
            {window ? (
              <ScopeLine>
                {uiText.rich('sentence_a965a33b22eb', {
                  range: windowRangeLabel(window.since, window.until, uiLocale),
                  count: model.groups.length,
                })}
              </ScopeLine>
            ) : null}
            <p className="text-sm" data-testid="pmax-poor">
              {model.poor.length > 0 ? (
                <>
                  {uiText.rich('sentence_884ad14d6b07', {
                    ratio: () => (
                      <span className="font-semibold">
                        {uiText.rich('sentence_e900eefa5ce5', {
                          v0: model.poor.length,
                          v1: model.groups.length,
                        })}
                      </span>
                    ),
                    groups: model.groups.length,
                    names: model.poor.map((group) => group.name).join(', '),
                  })}
                </>
              ) : (
                <>{uiText('no_asset_group_rates_poor_e0845a7')}</>
              )}
            </p>
            <InsightDataTable
              columns={GROUP_COLUMNS}
              getRowId={(row) => row.id}
              rows={model.groups}
            />
            <ReasonNotes
              reasons={reasonsOf(
                model.groups.flatMap((row) => [row.strength, row.status, row.assets]),
              )}
            />
            {model.campaignIds.map((id) => (
              <div key={id}>{network(id, campaignName(id))}</div>
            ))}
            <p className="text-muted-foreground text-xs" data-testid="pmax-not-read">
              {googleCopy(PMAX_NOT_READ, uiText)}
            </p>
          </div>
        );
      }}
    </ReadGate>
  );
}

const PMAX_BLOCKS = ['asset_groups', 'pmax_assets'] as const;
const NETWORK = ['network'] as const;

function PmaxNetworkSplit({
  campaignId,
  name,
  currency,
  window,
  ...target
}: GoogleReadTarget & {
  campaignId: string;
  name: string;
  currency: string | null;
  window: GoogleReadWindow;
}) {
  const query = useGoogleBreakdown({ ...target, window, dimensions: NETWORK, campaignId });
  return <PmaxNetworkSplitView currency={currency} name={name} read={viewRead(query)} />;
}

export function PmaxHealth({
  currency,
  window,
  ...target
}: GoogleReadTarget & { currency: string | null; window: GoogleReadWindow }) {
  const signals = useGoogleSignals({ ...target, blocks: PMAX_BLOCKS });
  const campaigns = useGoogleCampaigns({ ...target, window });
  const names = new Map((campaigns.data?.rows ?? []).map((row) => [row.id, row.name]));
  return (
    <PmaxHealthView
      campaignName={(id) => names.get(id) ?? `Campaign ${id}`}
      network={(campaignId, name) => (
        <PmaxNetworkSplit
          {...target}
          campaignId={campaignId}
          currency={currency}
          name={name}
          window={window}
        />
      )}
      read={viewRead(signals)}
    />
  );
}
