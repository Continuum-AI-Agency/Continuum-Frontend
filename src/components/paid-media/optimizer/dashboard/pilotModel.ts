// Reads of the payload the Piloto view needs: each pilot month's actuals against its targets,
// and the last complete month the KPIs report on. Pure, so the month cards and KPIs are
// tested without rendering.

import type { EasyfitDashboardPayload } from '@continuum/contracts';
import { type MonthState, monthState, percentChange } from './dashboardModel';

type HistoryRow = EasyfitDashboardPayload['historico'][number];

export type PilotMonth = {
  month: string;
  label: string;
  state: MonthState;
  isCurrent: boolean;
  /** The engine's month-end projection; only the month in course has one, and only when the
   *  payload carries it. */
  projectedSignups: number | null;
  signups: number;
  metaSignups: number;
  spend: number;
  floor: number;
  goal: number;
  metaGoal: number;
  budget: number;
  costGoal: number;
  costCeiling: number;
  metaCostGoal: number;
};

/** The pilot's months, each with the actuals the payload has for it (zero before it starts). */
export function pilotMonths(payload: EasyfitDashboardPayload, asOfDate: string): PilotMonth[] {
  const { piloto, historico, mes_en_curso: current, proyeccion } = payload;
  return piloto.meses.map((month, index) => {
    const history = historico.find((row) => row.mes === month);
    const isCurrent = current.mes === month;
    return {
      month,
      label: piloto.etiquetas[index] ?? month,
      state: monthState(month, asOfDate),
      isCurrent,
      projectedSignups: isCurrent ? (proyeccion?.altas ?? null) : null,
      signups: isCurrent ? current.altas : (history?.altas ?? 0),
      metaSignups: isCurrent ? current.altas_meta : (history?.altas_meta ?? 0),
      spend: isCurrent ? current.inv_total : (history?.inv_total ?? 0),
      floor: piloto.piso[index] ?? 0,
      goal: piloto.objetivo[index] ?? 0,
      metaGoal: piloto.meta_obj[index] ?? 0,
      budget: piloto.presupuesto[index] ?? 0,
      costGoal: piloto.cpa_obj[index] ?? 0,
      costCeiling: piloto.cpa_techo[index] ?? 0,
      metaCostGoal: piloto.meta_cpa_obj[index] ?? 0,
    };
  });
}

export function pilotTotals(payload: EasyfitDashboardPayload): { signups: number; budget: number } {
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  return { signups: sum(payload.piloto.objetivo), budget: sum(payload.piloto.presupuesto) };
}

export type LastMonthKpis = {
  month: string;
  costTotal: number | null;
  costMetaOnly: number | null;
  metaSignups: number | null;
  metaShare: number | null;
  costMeta: number | null;
  costMetaChange: number | null;
  returnMeta: number | null;
  returnTotal: number | null;
};

/** The KPIs read the last complete month before the one in course, and the month before it. */
export function lastMonthKpis(payload: EasyfitDashboardPayload): LastMonthKpis | null {
  const complete = payload.historico.filter((row) => row.mes < payload.meta.mes_en_curso);
  const last: HistoryRow | undefined = complete[complete.length - 1];
  if (!last) return null;
  const previous: HistoryRow | undefined = complete[complete.length - 2];
  const ltv = payload.piloto.ltv;
  return {
    month: last.mes,
    costTotal: last.cpa_total,
    costMetaOnly: last.inv_meta != null && last.altas > 0 ? last.inv_meta / last.altas : null,
    metaSignups: last.altas_meta,
    metaShare: last.pct_meta,
    costMeta: last.cpa_meta,
    costMetaChange: percentChange(last.cpa_meta, previous?.cpa_meta ?? null),
    returnMeta: last.cpa_meta ? ltv / last.cpa_meta : null,
    returnTotal: last.cpa_total ? ltv / last.cpa_total : null,
  };
}

/** The latest click cohort's cost per contact, the simulator's starting point. */
export function latestCostPerContact(payload: EasyfitDashboardPayload): number | null {
  const cohort = payload.cohortes[payload.cohortes.length - 1];
  if (!cohort || cohort.contactos === 0) return null;
  return Math.round(cohort.inversion / cohort.contactos);
}
