// Embudo a altas: click cohorts from spend to sign-up, the tour lever, the two Peaking tour
// readings next to Meta's Purchase, and the click→sign-up / click→tour lags (docs/05 §3).

import type { EasyfitChipThresholds, EasyfitDashboardPayload } from '@continuum/contracts';
import {
  axisMonthLabels,
  formatMonth,
  formatMxn,
  formatNumber,
  formatPct,
} from '../dashboardFormat';
import { useDashboardCopy } from '../i18n/useDashboardLocale';
import { ColumnChart } from '../parts/ColumnChart';
import { CostChip } from '../parts/CostChip';
import { DataTable } from '../parts/DataTable';
import { Block, ViewGrid, ViewLead } from '../parts/layout';
import { SERIES_COLOR } from '../parts/palette';
import { StatusChip } from '../parts/StatusChip';

export function EmbudoView({
  payload,
  thresholds,
}: {
  payload: EasyfitDashboardPayload;
  thresholds: EasyfitChipThresholds;
}) {
  const { locale, t } = useDashboardCopy();
  const count = (value: number | null) => formatNumber(value, locale);
  const money = (value: number | null) => formatMxn(value, locale);
  const ratio = (part: number, whole: number) => (whole > 0 ? (100 * part) / whole : null);
  const { tiempos, tours_lecturas: readings, tour_palanca: lever } = payload;

  return (
    <ViewGrid>
      <ViewLead title={t.embudo.lead}>{t.embudo.leadBody}</ViewLead>
      <Block subtitle={t.embudo.cohortSub} title={t.embudo.cohortTitle}>
        <DataTable
          caption={t.embudo.cohortTitle}
          columns={[
            {
              header: t.embudo.colClickMonth,
              cell: (row) => (
                <span className="inline-flex flex-wrap items-center gap-1.5 font-medium">
                  {formatMonth(row.mes, locale, { withYear: true })}
                  {row.madura ? null : (
                    <StatusChip tone="warn">{t.month.maturingCohort}</StatusChip>
                  )}
                </span>
              ),
            },
            { header: t.embudo.colSpend, numeric: true, cell: (row) => money(row.inversion) },
            {
              header: t.embudo.colConversations,
              numeric: true,
              cell: (row) => count(row.conversaciones),
            },
            { header: t.embudo.colContacts, numeric: true, cell: (row) => count(row.contactos) },
            { header: t.embudo.colTours, numeric: true, cell: (row) => count(row.tours) },
            {
              header: t.embudo.colTourRate,
              numeric: true,
              cell: (row) => formatPct(ratio(row.tours, row.contactos), locale),
            },
            { header: t.embudo.colSignups, numeric: true, cell: (row) => count(row.altas) },
            {
              header: t.embudo.colPer100,
              numeric: true,
              cell: (row) => formatNumber(ratio(row.altas, row.contactos), locale, 1),
            },
            {
              header: t.embudo.colCost,
              numeric: true,
              cell: (row) =>
                row.madura ? (
                  <CostChip
                    emptyLabel={t.states.noSignups}
                    threshold={thresholds.costo_alta_cohorte}
                    value={row.cpa}
                  />
                ) : (
                  <span className="text-muted-foreground">{t.month.open}</span>
                ),
            },
          ]}
          emptyMessage={t.states.noRows}
          rowKey={(row) => row.mes}
          rows={payload.cohortes}
        />
      </Block>
      <Block span="narrow" subtitle={t.embudo.tourSub} title={t.embudo.tourTitle}>
        <div className="grid grid-cols-2 gap-3">
          {[
            { caption: t.embudo.withTour, value: lever.alta_si },
            { caption: t.embudo.withoutTour, value: lever.alta_no },
          ].map(({ caption, value }) => (
            <div className="rounded-lg bg-muted p-3" key={caption}>
              <div className="text-xs text-muted-foreground">{caption}</div>
              <div className="font-mono text-[32px] font-semibold tabular-nums leading-[1.2]">
                {formatPct(value, locale)}
              </div>
              <div className="text-xs text-muted-foreground">{t.embudo.signsUp}</div>
            </div>
          ))}
        </div>
      </Block>
      <Block span="wide" subtitle={t.embudo.readingsSub} title={t.embudo.readingsTitle}>
        <ColumnChart
          categories={axisMonthLabels(
            readings.map((row) => row.mes),
            locale,
          )}
          formatValue={(value) => count(value)}
          layout="grouped"
          series={[
            {
              kind: 'bar',
              label: t.embudo.seriesTag,
              color: SERIES_COLOR.blue,
              values: readings.map((row) => row.day_pass),
            },
            {
              kind: 'bar',
              label: t.embudo.seriesVariable,
              color: SERIES_COLOR.aqua,
              values: readings.map((row) => row.tour_agendado),
            },
            {
              kind: 'bar',
              label: t.embudo.seriesPurchase,
              color: SERIES_COLOR.orange,
              values: readings.map((row) => row.purchase_meta),
            },
          ]}
          title={t.embudo.readingsTitle}
        />
      </Block>
      <Block
        span="half"
        subtitle={t.embudo.lagSignupSub(count(tiempos.clic_a_alta.mediana_dias))}
        title={t.embudo.lagSignupTitle}
      >
        <ColumnChart
          categories={tiempos.clic_a_alta.labels}
          formatValue={(value) => count(value)}
          height={200}
          series={[
            {
              kind: 'bar',
              label: t.embudo.seriesSignups,
              color: SERIES_COLOR.aqua,
              values: tiempos.clic_a_alta.valores,
            },
          ]}
          title={t.embudo.lagSignupTitle}
        />
      </Block>
      <Block span="half" subtitle={t.embudo.lagTourSub} title={t.embudo.lagTourTitle}>
        <ColumnChart
          categories={tiempos.clic_a_tour.labels}
          formatValue={(value) => count(value)}
          height={200}
          series={[
            {
              kind: 'bar',
              label: t.embudo.seriesTours,
              color: SERIES_COLOR.blue,
              values: tiempos.clic_a_tour.valores,
            },
          ]}
          title={t.embudo.lagTourTitle}
        />
      </Block>
    </ViewGrid>
  );
}
