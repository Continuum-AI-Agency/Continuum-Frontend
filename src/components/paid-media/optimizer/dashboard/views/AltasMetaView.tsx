// Altas de Meta: sign-ups matched to a Meta ad, by sign-up month, their cost against the
// goal, the last month by fortnight and the share on an annual plan (docs/05 §2).

import type { EasyfitChipThresholds, EasyfitDashboardPayload } from '@continuum/contracts';
import { axisMonthLabels, formatMxn, formatNumber, formatPct } from '../dashboardFormat';
import { useDashboardCopy } from '../i18n/useDashboardLocale';
import { ColumnChart } from '../parts/ColumnChart';
import { CostChip } from '../parts/CostChip';
import { DataTable } from '../parts/DataTable';
import { Block, ViewGrid, ViewLead } from '../parts/layout';
import { SERIES_COLOR } from '../parts/palette';

export function AltasMetaView({
  payload,
  thresholds,
}: {
  payload: EasyfitDashboardPayload;
  thresholds: EasyfitChipThresholds;
}) {
  const { locale, t } = useDashboardCopy();
  const { piloto, historico, mes_en_curso: current } = payload;
  const count = (value: number | null) => formatNumber(value, locale);
  const money = (value: number | null) => formatMxn(value, locale);

  const withMeta = historico.filter(
    (row) => row.altas_meta != null && !piloto.meses.includes(row.mes),
  );
  const months = [...withMeta.map((row) => row.mes), ...piloto.meses];
  const labels = axisMonthLabels(months, locale);
  const pilotValue = (month: string, values: readonly number[]) => {
    const index = piloto.meses.indexOf(month);
    return index >= 0 ? (values[index] ?? null) : null;
  };
  const historyRow = (month: string) => withMeta.find((row) => row.mes === month);
  const annual = payload.anual_meta_mes;

  return (
    <ViewGrid>
      <ViewLead title={t.meta.lead}>{t.meta.leadBody}</ViewLead>
      <Block span="wide" subtitle={t.meta.chartSub} title={t.meta.chartTitle}>
        <ColumnChart
          categories={labels}
          categoryNote={(index) => {
            const row = historyRow(months[index] ?? '');
            return row ? t.meta.shareOfTotal(formatPct(row.pct_meta, locale)) : null;
          }}
          formatValue={(value) => count(value)}
          series={[
            {
              kind: 'bar',
              label: t.meta.seriesMeta,
              color: SERIES_COLOR.blue,
              values: months.map((month) =>
                month === current.mes
                  ? current.altas_meta
                  : (historyRow(month)?.altas_meta ?? null),
              ),
            },
            {
              kind: 'bar',
              label: t.piloto.seriesGoal,
              color: SERIES_COLOR.aqua,
              style: 'outline',
              values: months.map((month) => pilotValue(month, piloto.meta_obj)),
            },
          ]}
          title={t.meta.chartTitle}
        />
      </Block>
      <Block span="narrow" subtitle={t.meta.costSub} title={t.meta.costTitle}>
        <ColumnChart
          categories={labels}
          formatValue={(value) => money(value)}
          series={[
            {
              kind: 'line',
              label: t.piloto.seriesActual,
              color: SERIES_COLOR.orange,
              values: months.map((month) => historyRow(month)?.cpa_meta ?? null),
            },
            {
              kind: 'line',
              label: t.piloto.seriesGoal,
              color: SERIES_COLOR.aqua,
              dashed: true,
              values: months.map((month) => pilotValue(month, piloto.meta_cpa_obj)),
            },
          ]}
          title={t.meta.costTitle}
        />
      </Block>
      <Block span="half" subtitle={t.meta.fortnightSub} title={t.meta.fortnightTitle}>
        <DataTable
          caption={t.meta.fortnightTitle}
          columns={[
            {
              header: t.meta.colFortnight,
              cell: (row) => <span className="font-medium">{row.q}</span>,
            },
            { header: t.meta.colSpend, numeric: true, cell: (row) => money(row.inv_meta) },
            { header: t.meta.colSignups, numeric: true, cell: (row) => count(row.altas) },
            { header: t.meta.colMeta, numeric: true, cell: (row) => count(row.altas_meta) },
            { header: t.meta.colCost, numeric: true, cell: (row) => money(row.cpa_total) },
            {
              header: t.meta.colMetaCost,
              numeric: true,
              cell: (row) => (
                <CostChip
                  emptyLabel={t.states.noSignups}
                  threshold={thresholds.costo_alta_meta_quincena}
                  value={row.cpa_meta}
                />
              ),
            },
          ]}
          emptyMessage={t.states.noRows}
          rowKey={(row) => row.q}
          rows={payload.quincenas_mes_anterior}
        />
      </Block>
      <Block span="half" subtitle={t.meta.annualSub} title={t.meta.annualTitle}>
        <ColumnChart
          categories={axisMonthLabels(
            annual.map((row) => row.mes),
            locale,
          )}
          categoryNote={(index) => t.meta.annualOf(count(annual[index]?.n ?? null))}
          formatValue={(value) => formatPct(value, locale, 0)}
          height={200}
          maxValue={100}
          series={[
            {
              kind: 'bar',
              label: t.meta.annualSeries,
              color: SERIES_COLOR.aqua,
              values: annual.map((row) => row.pct),
            },
          ]}
          title={t.meta.annualTitle}
        />
      </Block>
    </ViewGrid>
  );
}
