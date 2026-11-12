'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { InsightDataTable } from '@/components/dashboard/datatable/InsightDataTable';
import { useUiErrorMessage } from '@/i18n/errors';
import type { ScaffoldTree } from '@/lib/paid-media/scaffoldTree';
import { ScaffoldAdList } from './ScaffoldAdList';
import { buildScaffoldAdSetColumns, scaffoldAdSetSearchValue } from './scaffoldColumns';

/**
 * The ad sets of one scaffold, searchable and sortable, with the ads inside each row.
 *
 * NOT VIRTUALIZED AND NOT PAGINATED, on purpose. Ads live in the expansion, so the
 * mounted DOM is ~50 rows plus at most one expansion — an order of magnitude below
 * where virtualization pays for itself. (CampaignAdsetPicker virtualizes because it
 * renders every ad set on an entire ACCOUNT, which is a different problem.) If a
 * scaffold ever exceeds a couple of hundred ad sets, fork this component onto
 * @tanstack/react-virtual rather than virtualizing InsightDataTable, which has
 * eleven other importers depending on its sticky header and colSpan expansion.
 *
 * `maxHeight` is what keeps a 50-row table from swallowing the transcript.
 */
export function ScaffoldAdSetTable({
  tree,
  isLoading,
  currency = null,
}: {
  tree: ScaffoldTree | null;
  isLoading: boolean;
  currency?: string | null;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const uiError = useUiErrorMessage();
  const columns = React.useMemo(
    () => buildScaffoldAdSetColumns(currency, uiText, uiLocale, uiError),
    [currency, uiText, uiLocale, uiError],
  );
  const rows = tree?.adSets ?? [];
  const counts = tree?.counts;

  return (
    <InsightDataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.pathKey}
      title={uiText('ad_sets_f59ed42')}
      metricLabel={
        counts
          ? uiText('scaffoldProgressCounts', {
              created: counts.created,
              pending: counts.pending,
              failed: counts.failed,
            })
          : undefined
      }
      defaultSort={{ columnId: 'name', direction: 'asc' }}
      searchable
      searchPlaceholder={uiText('search_ad_sets_angles_ads_3ab72f6')}
      searchValue={scaffoldAdSetSearchValue}
      expandedContent={(row) => <ScaffoldAdList adSet={row} />}
      isLoading={isLoading}
      maxHeight={420}
      emptyState={uiText('scaffoldNoAdSets')}
    />
  );
}
