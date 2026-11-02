// Audiencias: cost per sign-up to date by audience type, and age — share of spend against
// share of Meta sign-ups (docs/05 §6).

import type { EasyfitChipThresholds, EasyfitDashboardPayload } from '@continuum/contracts';
import { formatMxn, formatNumber, formatPct } from '../dashboardFormat';
import { useDashboardCopy } from '../i18n/useDashboardLocale';
import { ColumnChart } from '../parts/ColumnChart';
import { CostChip } from '../parts/CostChip';
import { DataTable } from '../parts/DataTable';
import { Block, ViewGrid, ViewLead } from '../parts/layout';
import { SERIES_COLOR } from '../parts/palette';

export function AudienciasView({
  payload,
  thresholds,
}: {
  payload: EasyfitDashboardPayload;
  thresholds: EasyfitChipThresholds;
}) {
  const { locale, t } = useDashboardCopy();
  const count = (value: number | null) => formatNumber(value, locale);
  const ages = payload.edad_inversion_vs_altas;

  return (
    <ViewGrid>
      <ViewLead title={t.audiencias.lead}>{t.audiencias.leadBody}</ViewLead>
      <Block subtitle={t.audiencias.tableSub} title={t.audiencias.tableTitle}>
        <DataTable
          caption={t.audiencias.tableTitle}
          columns={[
            {
              header: t.audiencias.colAudience,
              cell: (row) => <span className="font-medium">{row.nombre}</span>,
            },
            {
              header: t.audiencias.colSpend,
              numeric: true,
              cell: (row) => formatMxn(row.inversion, locale),
            },
            {
              header: t.audiencias.colContacts,
              numeric: true,
              cell: (row) => count(row.contactos),
            },
            { header: t.audiencias.colTours, numeric: true, cell: (row) => count(row.tours) },
            { header: t.audiencias.colSignups, numeric: true, cell: (row) => count(row.altas) },
            {
              header: t.audiencias.colPer100,
              numeric: true,
              cell: (row) => formatNumber(row.altas_x100, locale, 1),
            },
            {
              header: t.audiencias.colCost,
              numeric: true,
              cell: (row) => (
                <CostChip
                  emptyLabel={t.states.noSignups}
                  threshold={thresholds.costo_alta_audiencia}
                  value={row.cpa}
                />
              ),
            },
          ]}
          emptyMessage={t.states.noRows}
          rowKey={(row) => row.nombre}
          rows={payload.audiencias}
        />
      </Block>
      <Block span="wide" subtitle={t.audiencias.ageSub} title={t.audiencias.ageTitle}>
        <ColumnChart
          categories={ages.map((row) => row.rango)}
          categoryNote={(index) => t.audiencias.ctr(formatPct(ages[index]?.ctr, locale, 2))}
          formatValue={(value) => formatPct(value, locale, 0)}
          layout="grouped"
          series={[
            {
              kind: 'bar',
              label: t.audiencias.seriesSpend,
              color: SERIES_COLOR.blue,
              values: ages.map((row) => row.pct_inversion),
            },
            {
              kind: 'bar',
              label: t.audiencias.seriesSignups,
              color: SERIES_COLOR.orange,
              values: ages.map((row) => row.pct_altas),
            },
          ]}
          title={t.audiencias.ageTitle}
        />
      </Block>
    </ViewGrid>
  );
}
