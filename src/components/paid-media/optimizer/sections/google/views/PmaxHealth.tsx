'use client';

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

const GROUP_COLUMNS: InsightColumn<AssetGroupRow>[] = [
  {
    id: 'group',
    header: 'Asset group',
    cell: (row) => (
      <span className="block min-w-40">
        <span className="font-medium">{row.name}</span>
        {row.missingItems.length > 0 ? (
          <span className="block text-muted-foreground text-xs">
            Google asks: {row.missingItems.join(' · ')}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    id: 'strength',
    header: 'Ad strength',
    cell: (row) => (
      <span className={row.poor ? 'font-medium text-destructive' : undefined}>
        <CellText cell={row.strength} />
      </span>
    ),
  },
  { id: 'status', header: 'Status', cell: (row) => <CellText cell={row.status} /> },
  { id: 'assets', header: 'Assets', cell: (row) => <CellText cell={row.assets} /> },
];

function networkColumns(currency: string | null): InsightColumn<NetworkSlice>[] {
  return [
    { id: 'network', header: 'Network', cell: (row) => row.network },
    {
      id: 'spend',
      header: `Spend${currencyColumnSuffix(currency)}`,
      align: 'right',
      cell: (row) => formatCurrencyInColumn(row.spend, currency),
    },
    { id: 'share', header: 'Share', align: 'right', cell: (row) => formatShare(row.share) },
    {
      id: 'conversions',
      header: 'Conv.',
      align: 'right',
      cell: (row) => <CellText cell={row.conversions} />,
    },
    {
      id: 'cost',
      header: 'Cost / conv.',
      align: 'right',
      cell: (row) => <CellText cell={row.costPerConversion} />,
    },
  ];
}

export function PmaxNetworkSplitView({
  name,
  read,
  currency,
}: {
  name: string;
  read: ViewRead<GoogleBreakdownRead>;
  currency: string | null;
}) {
  return (
    <section aria-label={`Spend by network: ${name}`} className="space-y-2">
      <h4 className="font-medium text-sm">Spend by network · {name}</h4>
      <ReadGate read={read}>
        {(data) => {
          const slices = networkSplit(data, data.currency ?? currency);
          if (slices.length === 0) {
            return <ChartEmpty message="This campaign spent nothing in the window." />;
          }
          return (
            <div className="space-y-2">
              <ScopeLine>
                {windowRangeLabel(data.range.since, data.range.until)} · conversion value isn't in
                this read, so there is no ROAS by network
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
  return (
    <ReadGate read={read}>
      {(data) => {
        const model = buildPmaxHealth(data);
        if (model.kind === 'unread') {
          return (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm" data-testid="pmax-unread">
                — {model.reason}
              </p>
              <p className="text-muted-foreground text-xs">{PMAX_NOT_READ}</p>
            </div>
          );
        }
        if (model.groups.length === 0) {
          return <ChartEmpty message="No Performance Max campaign in this account." />;
        }
        const window = data.signals?.window;
        return (
          <div className="space-y-4">
            {window ? (
              <ScopeLine>
                {windowRangeLabel(window.since, window.until)} · Google's last 30 complete days ·{' '}
                {model.groups.length} asset {model.groups.length === 1 ? 'group' : 'groups'}
              </ScopeLine>
            ) : null}
            <p className="text-sm" data-testid="pmax-poor">
              {model.poor.length > 0 ? (
                <>
                  <span className="font-semibold">
                    {model.poor.length} of {model.groups.length}
                  </span>{' '}
                  asset {model.groups.length === 1 ? 'group rates' : 'groups rate'} Poor:{' '}
                  {model.poor.map((group) => group.name).join(', ')}.
                </>
              ) : (
                <>No asset group rates Poor.</>
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
              {PMAX_NOT_READ}
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
