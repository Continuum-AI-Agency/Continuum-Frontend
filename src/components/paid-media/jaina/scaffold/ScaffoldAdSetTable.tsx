'use client';

import * as React from 'react';
import { InsightDataTable } from '@/components/dashboard/datatable/InsightDataTable';
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
}: {
  tree: ScaffoldTree | null;
  isLoading: boolean;
}) {
  const columns = React.useMemo(() => buildScaffoldAdSetColumns(), []);
  const rows = tree?.adSets ?? [];
  const counts = tree?.counts;

  return (
    <InsightDataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.pathKey}
      title="Ad sets"
      metricLabel={
        counts
          ? `${counts.created} created · ${counts.pending} not created${
              counts.failed > 0 ? ` · ${counts.failed} failed` : ''
            }`
          : undefined
      }
      defaultSort={{ columnId: 'name', direction: 'asc' }}
      searchable
      searchPlaceholder="Search ad sets, angles, ads…"
      searchValue={scaffoldAdSetSearchValue}
      expandedContent={(row) => <ScaffoldAdList adSet={row} />}
      isLoading={isLoading}
      maxHeight={420}
      emptyState="This scaffold has no ad sets."
    />
  );
}
