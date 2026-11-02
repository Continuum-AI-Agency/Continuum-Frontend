// Piloto (home): the first screen answers "do we reach this month's sign-ups, and at what
// cost?" — month cards, six KPIs, the two history charts, the simulator, then the findings.

import type {
  EasyfitDashboardPayload,
  EasyfitOfertasConfig,
  EasyfitPilotConfig,
} from '@continuum/contracts';
import {
  axisMonthLabels,
  formatMonth,
  formatMultiple,
  formatMxn,
  formatNumber,
  formatPct,
} from '../dashboardFormat';
import type { ChipTone, SimulatorRates } from '../dashboardModel';
import { useDashboardCopy } from '../i18n/useDashboardLocale';
import { ColumnChart } from '../parts/ColumnChart';
import {
  Block,
  FindingCard,
  FindingGrid,
  KpiRow,
  KpiTile,
  ViewGrid,
  ViewLead,
} from '../parts/layout';
import { SERIES_COLOR } from '../parts/palette';
import { lastMonthKpis, latestCostPerContact, pilotMonths, pilotTotals } from '../pilotModel';
import { PilotMonthCards } from './PilotMonthCards';
import { PilotSimulator } from './PilotSimulator';

type Severity = EasyfitDashboardPayload['hallazgos'][number]['severidad'];

const SEVERITY_TONE: Record<Severity, ChipTone> = {
  critica: 'bad',
  advertencia: 'warn',
  oportunidad: 'good',
  dato: 'neutral',
};

/** The simulator's three offer classes, from the pilot's offer config (docs/05 §1). */
function simulatorRates(offers: EasyfitOfertasConfig | null): SimulatorRates | null {
  const rates = offers?.tasas_historicas;
  const dayPass = rates?.daypass_dias_gratis?.altas_x100;
  const annual = rates?.anualidad?.altas_x100;
  const cheap = rates?.primer_mes_barato?.altas_x100;
  if (dayPass == null || annual == null || cheap == null) return null;
  return { dayPass, annual, cheapFirstMonth: cheap };
}

export function PilotoView({
  payload,
  asOfDate,
  config,
}: {
  payload: EasyfitDashboardPayload;
  asOfDate: string;
  /** The pilot config; the simulator and the Meta share goal wait for it. */
  config: EasyfitPilotConfig | null;
}) {
  const { locale, t } = useDashboardCopy();
  const months = pilotMonths(payload, asOfDate);
  const totals = pilotTotals(payload);
  const kpis = lastMonthKpis(payload);
  const rates = simulatorRates(config?.ofertas ?? null);
  const startingCostPerContact = latestCostPerContact(payload);
  const metaShareGoal = config?.piloto.piloto.pct_altas_meta_obj ?? null;
  const count = (value: number | null) => formatNumber(value, locale);
  const money = (value: number | null) => formatMxn(value, locale);

  const { piloto, historico, mes_en_curso: current } = payload;
  const historyMonths = historico.map((row) => row.mes).filter((m) => !piloto.meses.includes(m));
  const allMonths = [...historyMonths, ...piloto.meses];
  const labels = axisMonthLabels(allMonths, locale);
  const pilotIndex = (month: string) => piloto.meses.indexOf(month);
  const historyValue = (
    month: string,
    pick: (row: (typeof historico)[number]) => number | null,
  ) => {
    const row = historico.find((h) => h.mes === month);
    return row ? pick(row) : null;
  };
  const pilotValue = (month: string, values: readonly number[]) =>
    pilotIndex(month) >= 0 ? (values[pilotIndex(month)] ?? null) : null;
  const isOpen = (month: string) => month === current.mes;
  const kpiMonth = kpis ? formatMonth(kpis.month, locale) : '';

  return (
    <ViewGrid>
      <ViewLead title={t.piloto.lead(count(totals.signups), money(totals.budget))}>
        {t.piloto.leadBody}
      </ViewLead>
      <PilotMonthCards locale={locale} months={months} t={t} />
      {kpis ? (
        <KpiRow>
          <KpiTile
            detail={t.piloto.kpiCost12mDetail}
            title={t.piloto.kpiCost12m}
            value={money(piloto.cpa_12m)}
          />
          <KpiTile
            detail={t.piloto.kpiCostMonthDetail(money(kpis.costMetaOnly))}
            title={t.piloto.kpiCostMonth(kpiMonth)}
            value={money(kpis.costTotal)}
          />
          <KpiTile
            detail={t.piloto.kpiMetaSignupsDetail(
              formatPct(kpis.metaShare, locale),
              formatPct(metaShareGoal, locale, 0),
            )}
            title={t.piloto.kpiMetaSignups(kpiMonth)}
            value={count(kpis.metaSignups)}
          />
          <KpiTile
            detail={t.piloto.kpiMetaCostDetail(
              kpis.costMetaChange == null
                ? '—'
                : `${kpis.costMetaChange > 0 ? '+' : ''}${formatPct(kpis.costMetaChange, locale, 0)}`,
              money(piloto.meta_cpa_obj[0] ?? null),
            )}
            title={t.piloto.kpiMetaCost(kpiMonth)}
            value={money(kpis.costMeta)}
          />
          <KpiTile
            detail={t.piloto.kpiLtvDetail}
            title={t.piloto.kpiLtv}
            value={money(piloto.ltv)}
          />
          <KpiTile
            detail={t.piloto.kpiReturnDetail(formatMultiple(kpis.returnTotal, locale))}
            title={t.piloto.kpiReturn}
            value={formatMultiple(kpis.returnMeta, locale)}
          />
        </KpiRow>
      ) : null}
      <Block span="wide" subtitle={t.piloto.chartSignupsSub} title={t.piloto.chartSignupsTitle}>
        <ColumnChart
          categories={labels}
          formatValue={(value) => count(value)}
          series={[
            {
              kind: 'bar',
              label: t.piloto.seriesSignups,
              color: SERIES_COLOR.blue,
              values: allMonths.map((m) => (isOpen(m) ? null : historyValue(m, (r) => r.altas))),
            },
            {
              kind: 'bar',
              label: t.piloto.seriesInProgress,
              color: SERIES_COLOR.blue,
              style: 'faded',
              values: allMonths.map((m) => (isOpen(m) ? current.altas : null)),
            },
            {
              kind: 'bar',
              label: t.piloto.seriesGoal,
              color: SERIES_COLOR.aqua,
              style: 'outline',
              values: allMonths.map((m) => pilotValue(m, piloto.objetivo)),
            },
            {
              kind: 'line',
              label: t.piloto.seriesFloor,
              color: SERIES_COLOR.grey,
              dashed: true,
              values: allMonths.map((m) => pilotValue(m, piloto.piso)),
            },
          ]}
          title={t.piloto.chartSignupsTitle}
        />
      </Block>
      <Block span="narrow" subtitle={t.piloto.chartCostSub} title={t.piloto.chartCostTitle}>
        <ColumnChart
          categories={labels}
          formatValue={(value) => money(value)}
          series={[
            {
              kind: 'bar',
              label: t.piloto.seriesActual,
              color: SERIES_COLOR.orange,
              values: allMonths.map((m) =>
                isOpen(m) ? null : historyValue(m, (r) => r.cpa_total),
              ),
            },
            {
              kind: 'bar',
              label: t.piloto.seriesGoal,
              color: SERIES_COLOR.aqua,
              style: 'outline',
              values: allMonths.map((m) => pilotValue(m, piloto.cpa_obj)),
            },
            {
              kind: 'line',
              label: t.piloto.seriesCeiling,
              color: SERIES_COLOR.grey,
              dashed: true,
              values: allMonths.map((m) => pilotValue(m, piloto.cpa_techo)),
            },
          ]}
          title={t.piloto.chartCostTitle}
        />
      </Block>
      {rates && startingCostPerContact != null ? (
        <PilotSimulator
          locale={locale}
          months={months}
          rates={rates}
          startingCostPerContact={startingCostPerContact}
          t={t}
        />
      ) : null}
      {payload.hallazgos.length > 0 ? (
        <section aria-label={t.piloto.findingsTitle} className="space-y-2 lg:col-span-12">
          <h3 className="text-[15px] font-semibold">{t.piloto.findingsTitle}</h3>
          <FindingGrid>
            {payload.hallazgos.map((finding) => (
              <FindingCard
                key={finding.titulo}
                tag={`${t.severity[finding.severidad]} · ${finding.etiqueta}`}
                text={finding.texto}
                title={finding.titulo}
                tone={SEVERITY_TONE[finding.severidad]}
              />
            ))}
          </FindingGrid>
        </section>
      ) : null}
    </ViewGrid>
  );
}
