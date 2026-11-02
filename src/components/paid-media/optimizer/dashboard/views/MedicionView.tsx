// Medición: the pilot's measurement rules, the open measurement gaps, weekly contacts by ad
// account (stacked) and the quality of each account's contacts (docs/05 §8).

import type { EasyfitDashboardPayload } from '@continuum/contracts';
import { formatNumber, formatPct } from '../dashboardFormat';
import { useDashboardCopy } from '../i18n/useDashboardLocale';
import { type ChartSeries, ColumnChart } from '../parts/ColumnChart';
import { DataTable } from '../parts/DataTable';
import { Block, FindingCard, FindingGrid, ViewGrid, ViewLead } from '../parts/layout';
import { SERIES_COLOR } from '../parts/palette';

/** The account the payload names for the brand's own ads; every other one is "the other". */
const OWN_ACCOUNT = 'Easyfit';

export function MedicionView({ payload }: { payload: EasyfitDashboardPayload }) {
  const { locale, t } = useDashboardCopy();
  const count = (value: number | null) => formatNumber(value, locale);
  const weekly = payload.mix_semanal;
  const accountLabel = (account: string) =>
    account === OWN_ACCOUNT ? t.medicion.accountEasyfit : t.medicion.accountOther;
  const series: ChartSeries[] = Object.entries(weekly.series).map(([account, values], index) => ({
    kind: 'bar',
    label: accountLabel(account),
    color: index === 0 ? SERIES_COLOR.blue : SERIES_COLOR.orange,
    values,
  }));

  return (
    <ViewGrid>
      <ViewLead title={t.medicion.lead}>{t.medicion.leadBody}</ViewLead>
      <Block span="half" title={t.medicion.rulesTitle}>
        <FindingGrid single>
          {t.medicion.rules.map((rule) => (
            <FindingCard
              key={rule.title}
              tag={rule.tag}
              text={rule.text}
              title={rule.title}
              tone="neutral"
            />
          ))}
        </FindingGrid>
      </Block>
      <Block span="half" title={t.medicion.pendingTitle}>
        <FindingGrid single>
          {t.medicion.pending.map((gap, index) => (
            <FindingCard
              key={gap.title}
              tag={gap.tag}
              text={gap.text}
              title={gap.title}
              tone={index === 0 ? 'bad' : 'warn'}
            />
          ))}
        </FindingGrid>
      </Block>
      <Block span="half" subtitle={t.medicion.weeklySub} title={t.medicion.weeklyTitle}>
        <ColumnChart
          categories={weekly.semanas.map((week) => t.medicion.week(week))}
          formatValue={(value) => count(value)}
          layout="stacked"
          series={series}
          title={t.medicion.weeklyTitle}
        />
      </Block>
      <Block span="half" subtitle={t.medicion.qualitySub} title={t.medicion.qualityTitle}>
        <DataTable
          caption={t.medicion.qualityTitle}
          columns={[
            {
              header: t.medicion.colAccount,
              cell: (row) => (
                <span className="space-y-0.5">
                  <span className="block font-medium">{accountLabel(row.cuenta)}</span>
                  <span className="block text-muted-foreground">{row.titulares.join(' · ')}</span>
                </span>
              ),
            },
            { header: t.medicion.colContacts, numeric: true, cell: (row) => count(row.contactos) },
            {
              header: t.medicion.colTourRate,
              numeric: true,
              cell: (row) => formatPct(row.tasa_tour, locale),
            },
            {
              header: t.medicion.colPer100,
              numeric: true,
              cell: (row) => formatNumber(row.tasa_alta, locale, 2),
            },
          ]}
          emptyMessage={t.states.noRows}
          rowKey={(row) => row.cuenta}
          rows={payload.cuentas_calidad}
        />
      </Block>
    </ViewGrid>
  );
}
