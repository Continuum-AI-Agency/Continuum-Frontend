// ---------------------------------------------------------------------------
// The title every trigger writes beside its reason: entity + figure with unit + comparison.
//
// One vocabulary for the whole engine, so a P2 and a C1 spell "MXN por lead" the same way
// and no template reaches for a "$". The Spanish nouns for what an ad set buys live here
// once, keyed by the KPI field a snapshot declares — "cost per conversation narrated as a
// CPA" is the failure this engine exists to prevent, and a title that said "por resultado"
// for every objective would be its quieter cousin.
//
// Money is `formatMoney` from contracts (M1): the currency's symbol before the figure and its
// ISO code after it — "$35 MXN" — and the bare figure when the account records none. The
// title and the prose `reason` beside it spell money by the same rule.
// ---------------------------------------------------------------------------

import {
  type ActionSizing,
  formatMoney,
  normalizeCurrencyCode,
  type RecommendationAction,
  type RecommendationTitle,
} from '@continuum/contracts';
import type { EngineConfig } from './config';
import type { AdSetSnapshot, EvidenceWindow, RecommendationKind } from './types';
import { windowSpanDays } from './windows';

type KpiField = NonNullable<AdSetSnapshot['kpiField']>;

type Nouns = { one: string; many: string };

/** The word when the KPI field names nothing this table knows — never a bare "conversión". */
const RESULT_FALLBACK: Nouns = { one: 'resultado', many: 'resultados' };

/** One result and several, in the objective's own words. Partial because the snapshot's
 *  `kpiField` is any WindowMetrics key, and spend or reach is not a result anyone buys. */
const RESULT_NOUNS: Partial<Record<KpiField, Nouns>> = {
  purchases: { one: 'compra', many: 'compras' },
  leads: { one: 'lead', many: 'leads' },
  conversations: { one: 'conversación', many: 'conversaciones' },
  linkClicks: { one: 'clic', many: 'clics' },
  landingPageViews: { one: 'vista de página', many: 'vistas de página' },
  thruplays: { one: 'reproducción', many: 'reproducciones' },
  postEngagement: { one: 'interacción', many: 'interacciones' },
  appInstalls: { one: 'instalación', many: 'instalaciones' },
  signups: { one: 'registro', many: 'registros' },
  impressions: { one: 'impresión', many: 'impresiones' },
  clicks: { one: 'clic', many: 'clics' },
};

/** The upper-funnel event an objective profile names, in Spanish. Unknown labels pass through. */
const UPPER_FUNNEL_NOUNS: Record<string, { one: string; many: string }> = {
  'add-to-cart': { one: 'agregado al carrito', many: 'agregados al carrito' },
  click: { one: 'clic', many: 'clics' },
  'link click': { one: 'clic', many: 'clics' },
  'landing-page view': { one: 'vista de página', many: 'vistas de página' },
  impression: { one: 'impresión', many: 'impresiones' },
};

/** What the portfolio (or, when it declares one, the ad set) is buying, singular. */
export function resultNoun(
  cfg: Pick<EngineConfig, 'kpiField'>,
  s?: Pick<AdSetSnapshot, 'kpiField'>,
): string {
  return (RESULT_NOUNS[s?.kpiField ?? cfg.kpiField ?? 'purchases'] ?? RESULT_FALLBACK).one;
}

/** The same, plural — "0 leads", "5 conversaciones". */
export function resultNounPlural(
  cfg: Pick<EngineConfig, 'kpiField'>,
  s?: Pick<AdSetSnapshot, 'kpiField'>,
): string {
  return (RESULT_NOUNS[s?.kpiField ?? cfg.kpiField ?? 'purchases'] ?? RESULT_FALLBACK).many;
}

export function upperFunnelNoun(label: string | undefined, count: number): string {
  const noun = UPPER_FUNNEL_NOUNS[label ?? 'add-to-cart'];
  if (!noun) return label ?? 'add-to-cart';
  return count === 1 ? noun.one : noun.many;
}

/** The ISO code a title prints after a money figure; empty when the account records none. */
export const currencyCode = (cfg: Pick<EngineConfig, 'currency'>): string =>
  normalizeCurrencyCode(cfg.currency) ?? '';

/** "MXN por lead" — or "por lead" when the currency is unknown, never "$ por lead". */
export function moneyPerResultUnit(cfg: EngineConfig, s?: Pick<AdSetSnapshot, 'kpiField'>): string {
  return `${currencyCode(cfg)} por ${resultNoun(cfg, s)}`.trim();
}

/** Money for a comparator: "$35 MXN", or the bare "25.54" when the currency is unknown. */
export const titleMoney = (value: number, cfg: Pick<EngineConfig, 'currency'>): string =>
  formatMoney(value, cfg.currency);

/** "2.9×" — the multiple of one figure over another, one decimal, for a comparison. */
export const multiple = (value: number, reference: number): string =>
  `${(value / reference).toFixed(1)}×`;

/** Money in display units: two decimals, rounded once. */
export const round2 = (x: number): number => Math.round(x * 100) / 100;

/** "en 14 días" — the window as the words a comparator says. */
export const overDays = (window: EvidenceWindow): string => `en ${windowSpanDays(window)} días`;

/** The entity a title names first: the ad set by its name, its id when it has none. */
export const entityOf = (s: Pick<AdSetSnapshot, 'id' | 'name'>): string => s.name?.trim() || s.id;

/**
 * The action beside a title. `perDay` is the daily money the action stops or frees — the
 * saving that used to open the sentence — and null when the action prices nothing.
 */
export function action(
  // A platform_signal recommendation carries its own card (platform_card), never a title verb.
  verb: Exclude<RecommendationKind, 'platform_signal'>,
  cfg: Pick<EngineConfig, 'currency'>,
  sizing: Partial<Pick<ActionSizing, 'perDay' | 'from' | 'to'>> | null = null,
): RecommendationAction {
  if (!sizing) return { verb, sizing: null };
  return {
    verb,
    sizing: {
      perDay: sizing.perDay == null ? null : round2(sizing.perDay),
      from: sizing.from == null ? null : round2(sizing.from),
      to: sizing.to == null ? null : round2(sizing.to),
      currency: normalizeCurrencyCode(cfg.currency),
    },
  };
}

/** A title, with the figure rounded to display units once, here. */
export function title(fields: RecommendationTitle): RecommendationTitle {
  return { ...fields, figure: round2(fields.figure) };
}
