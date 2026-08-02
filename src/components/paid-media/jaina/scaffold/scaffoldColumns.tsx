'use client';

import type { InsightColumn } from '@/components/dashboard/datatable/InsightDataTable';
import { type ScaffoldAdSetRow, scaffoldStatusRank } from '@/lib/paid-media/scaffoldTree';
import { DerivedEmpty, DerivedValue } from './DerivedValue';
import { ScaffoldStatusPill } from './ScaffoldStatusPill';

/**
 * The ad-set columns.
 *
 * THERE ARE NO FORM CONTROLS HERE, and that is the point. "Renders both, edits
 * neither" is enforced by the absence of Input/Select/contentEditable rather than by
 * a disabled prop someone can flip. Genuine choices render in the foreground colour;
 * everything the server derives goes through <DerivedValue>.
 *
 * `daily_budget` has no column at all: the migration's `scaffold_node_carries_no_budget`
 * CHECK makes a budget key structurally impossible in `payload`, so a column would
 * always be empty and would imply a control that must not exist.
 */

const NAME_REASON =
  'Composed from your brand ad-naming schema and asserted to round-trip. Editing it by hand would break the link back to the components in analytics.';

const placementLabel = (placement: string[] | undefined) => {
  if (!placement || placement.length === 0) return null;
  const shown = placement.slice(0, 2).join(', ');
  return placement.length > 2 ? `${shown} +${placement.length - 2}` : shown;
};

const targetingSummary = (targeting: unknown): string | null => {
  if (!targeting || typeof targeting !== 'object') return null;
  const record = targeting as Record<string, unknown>;
  const parts: string[] = [];
  const included = record.custom_audiences;
  const excluded = record.excluded_custom_audiences;
  if (Array.isArray(included) && included.length > 0) parts.push(`${included.length} included`);
  if (Array.isArray(excluded) && excluded.length > 0) parts.push(`${excluded.length} excluded`);
  const countries = (record.geo_locations as Record<string, unknown> | undefined)?.countries;
  if (Array.isArray(countries) && countries.length > 0) parts.push(countries.join('/'));
  return parts.length > 0 ? parts.join(' · ') : null;
};

export const buildScaffoldAdSetColumns = (): InsightColumn<ScaffoldAdSetRow>[] => [
  {
    id: 'status',
    header: 'Status',
    sortValue: (row) => scaffoldStatusRank(row.status),
    cell: (row) => <ScaffoldStatusPill status={row.status} />,
  },
  {
    id: 'name',
    header: 'Ad set',
    sortValue: (row) => row.name,
    cellClassName: 'max-w-[22rem]',
    cell: (row) => (
      <div className="flex flex-col gap-0.5">
        <DerivedValue reason={NAME_REASON} className="truncate font-medium">
          {row.name}
        </DerivedValue>
        {row.errorMessage ? (
          <span className="truncate text-destructive text-xs" title={row.errorMessage}>
            {row.errorMessage}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    id: 'product',
    header: 'Product',
    sortValue: (row) => row.productKey ?? '',
    cell: (row) => row.productKey ?? <DerivedEmpty />,
  },
  {
    id: 'angle',
    header: 'Angle',
    sortValue: (row) => row.angleKey ?? '',
    cell: (row) => row.angleKey ?? <DerivedEmpty />,
  },
  {
    id: 'funnel',
    header: 'Funnel',
    sortValue: (row) => row.choices.funnelStage ?? '',
    cell: (row) => row.choices.funnelStage ?? <DerivedEmpty />,
  },
  {
    id: 'optimization',
    header: 'Optimization',
    sortValue: (row) => row.choices.optimizationGoal ?? '',
    cell: (row) => row.choices.optimizationGoal ?? <DerivedEmpty />,
  },
  {
    id: 'placement',
    header: 'Placement',
    cell: (row) => placementLabel(row.choices.placement) ?? <DerivedEmpty />,
  },
  {
    id: 'billing',
    header: 'Billing',
    cell: (row) =>
      row.derived.billingEvent ? (
        <DerivedValue reason="A pure function of the optimization goal — it is not chosen separately.">
          {row.derived.billingEvent}
        </DerivedValue>
      ) : (
        <DerivedEmpty reason="Derived from the optimization goal once one is set." />
      ),
  },
  {
    id: 'targeting',
    header: 'Targeting',
    cell: (row) => {
      const summary = targetingSummary(row.derived.targeting);
      return summary ? (
        <DerivedValue reason="Compiled from the audience group this ad set points at.">
          {summary}
        </DerivedValue>
      ) : (
        <DerivedEmpty reason="Compiled from an audience group at build time." />
      );
    },
  },
  {
    id: 'ads',
    header: 'Ads',
    align: 'right',
    sortValue: (row) => row.ads.length,
    cell: (row) => {
      const created = row.ads.filter(
        (ad) => ad.status === 'created' || ad.status === 'active',
      ).length;
      return (
        <span className="tabular-nums">
          {created}/{row.ads.length}
        </span>
      );
    },
  },
];

/**
 * Searching an ad's name or concept surfaces its PARENT ad set, because ads live
 * inside the expansion. Matching an ad and hiding its parent would orphan the hit.
 */
export const scaffoldAdSetSearchValue = (row: ScaffoldAdSetRow): string =>
  [
    row.name,
    row.pathKey,
    row.productKey,
    row.angleKey,
    row.metaObjectId,
    row.choices.funnelStage,
    row.choices.optimizationGoal,
    ...(row.choices.placement ?? []),
    ...row.ads.map((ad) => ad.name),
    ...row.ads.map((ad) => ad.conceptKey),
  ]
    .filter(Boolean)
    .join(' ');
