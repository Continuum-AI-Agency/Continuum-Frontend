// The title: entity + figure + comparison, and the action beside it — never inside it.
//
// A recommendation used to lead with a READING ("The auction moved, not the ad", "Spending
// on nothing") or with the action ("Stop 48.8 MXN/day going to ITESO // AGOSTO - RTG"). Both
// hide the one thing a person checks first: which entity, what figure, against what. The
// title is that sentence and nothing else — "ITESO // AGOSTO - RTG: 101 MXN por lead, 2.9×
// la referencia de 35 MXN" — and the verb moves to a typed `action` the button renders.
//
// Every field here is composed from figures the producer already holds (`evidence.value`,
// `threshold`, the reference it compared against), never from the prose `reason`; the prose
// stays for one release so nothing that reads it goes blank. Spanish, ISO currency codes
// after the figure, and never a "$": the money rule for a sentence a client reads is
// `formatMoneyCode` below, which is `formatMoney`'s digit rule with the symbol removed.
//
// On the wire both ride INSIDE `evidence` (`evidence.title`, `evidence.action`):
// `optimizer_record_cycle` copies `r->'evidence'` whole into a jsonb column and the row
// schema reads it back `.loose()`, so the vocabulary reaches the queue with no migration —
// the same path `evidence.headline` (the lead FIGURE descriptor) and `evidence.winner`
// already take. `headline` keeps its name and its shape: the queue and the account cards
// parse it today, and the title is a sentence-level structure beside it, not a replacement.

import { z } from 'zod';
import { normalizeCurrencyCode } from './money';

/** The window the title's figure was measured over. */
export const titleWindowSchema = z.enum(['d3', 'd7', 'd14']);
export type TitleWindow = z.infer<typeof titleWindowSchema>;

export const recommendationTitleSchema = z.object({
  /** Named first: the ad set, the ad, or the portfolio. Never "this ad set". */
  entity: z.string().min(1).max(200),
  /** Already in display units and already rounded — a renderer prints it and does no arithmetic. */
  figure: z.number().finite(),
  /**
   * The words after the figure: "MXN por lead", "MXN", "%", "veces por persona". A money unit
   * is the ISO code, never a symbol, and bare ("") when the account records no currency —
   * an unknown currency is not dollars.
   */
  unit: z.string().max(64),
  /**
   * The comparison, in figures the producer held: "2.9× la referencia de 35 MXN",
   * "en 14 días y 0 leads", "+24% frente a los 7 días previos". Carries direction in words,
   * never a bare minus sign.
   */
  comparator: z.string().min(1).max(200),
  window: titleWindowSchema,
});
export type RecommendationTitle = z.infer<typeof recommendationTitleSchema>;

/**
 * What the button says. The engine's recommendation kinds, plus the three moves only the
 * account read proposes. Typed so a surface maps a verb to a control, never to a string
 * it has to parse.
 */
export const actionVerbSchema = z.enum([
  'pause',
  'pause_ad',
  'creative_refresh',
  'audience_expand',
  'variate_creative',
  'seed_experiment',
  'restore_delivery',
  'settings',
  'reallocate',
  'consolidate',
  'review',
]);
export type ActionVerb = z.infer<typeof actionVerbSchema>;

/** The verb as the button prints it. */
export const ACTION_VERB_LABEL: Record<ActionVerb, string> = {
  pause: 'Pausar',
  pause_ad: 'Pausar el anuncio',
  creative_refresh: 'Renovar el creativo',
  audience_expand: 'Ampliar la audiencia',
  variate_creative: 'Hacer variantes',
  seed_experiment: 'Crear la comparación',
  restore_delivery: 'Restaurar la entrega',
  settings: 'Ajustar la configuración',
  reallocate: 'Mover presupuesto',
  consolidate: 'Consolidar',
  review: 'Revisar',
};

/**
 * How big the action is, in the producer's own figures.
 *
 * `perDay` is the daily money the action stops or frees — the saving that used to live in
 * the title. `from → to` is a setting's proposed change. Null when the action prices
 * nothing: making variants puts no measured money on the table, and saying so beats
 * inventing it.
 */
export const actionSizingSchema = z.object({
  perDay: z.number().finite().nullable().default(null),
  from: z.number().finite().nullable().default(null),
  to: z.number().finite().nullable().default(null),
  /** ISO code the figures are in; null prints them bare. */
  currency: z.string().nullable().default(null),
});
export type ActionSizing = z.infer<typeof actionSizingSchema>;

export const recommendationActionSchema = z.object({
  verb: actionVerbSchema,
  sizing: actionSizingSchema.nullable().default(null),
});
export type RecommendationAction = z.infer<typeof recommendationActionSchema>;

/**
 * Money for a title: the figure, then the ISO code — "25.54 MXN", "324 USD" — and the bare
 * figure when the currency is unknown. `formatMoney`'s digit rule (two decimals under 100,
 * none at or above, en-US grouping) so a title and the card beside it spell one number the
 * same way; without its "$", because a title a client reads never carries a symbol.
 */
export function formatMoneyCode(
  value: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const code = normalizeCurrencyCode(currency);
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  const body = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value));
  const sign = value < 0 ? '-' : '';
  return code ? `${sign}${body} ${code}` : `${sign}${body}`;
}

const ISO_CODE_UNIT = /^[A-Z]{3}(\s|$)/;

/** The figure with its unit: "101 MXN por lead", "12% de CTR", "3.2 veces por persona", "298". */
export function titleFigure(title: Pick<RecommendationTitle, 'figure' | 'unit'>): string {
  const { figure, unit } = title;
  // A percentage glues to its figure — "12%", "12% de CTR" — the way a person writes one.
  if (unit.startsWith('%')) return `${figure}${unit}`;
  if (ISO_CODE_UNIT.test(unit)) {
    const code = unit.slice(0, 3);
    const rest = unit.slice(3).trim();
    const money = formatMoneyCode(figure, code);
    return rest ? `${money} ${rest}` : money;
  }
  return unit ? `${figure} ${unit}` : String(figure);
}

/**
 * The title as one line: "ITESO // AGOSTO - RTG: 101 MXN por lead, 2.9× la referencia de
 * 35 MXN". One renderer, so a card, a row and a Slack line cannot say the same finding
 * three ways.
 */
export function titleText(title: RecommendationTitle): string {
  return `${title.entity}: ${titleFigure(title)}, ${title.comparator}`;
}

/** The button: "Pausar · 48.80 MXN/día", "Ajustar la configuración · 400 → 360 MXN", or the verb alone. */
export function actionLabel(action: RecommendationAction): string {
  const verb = ACTION_VERB_LABEL[action.verb];
  const sizing = action.sizing;
  if (!sizing) return verb;
  if (sizing.from != null && sizing.to != null) {
    return `${verb} · ${formatMoneyCode(sizing.from, null)} → ${formatMoneyCode(sizing.to, sizing.currency)}`;
  }
  if (sizing.perDay != null && sizing.perDay > 0) {
    return `${verb} · ${formatMoneyCode(sizing.perDay, sizing.currency)}/día`;
  }
  return verb;
}

/**
 * The title an evidence object carries, or null.
 *
 * Parsed at the read, exactly as `recommendationWinnerOf`: evidence is `.loose()` so the
 * key reaches the queue with no migration, and a malformed title must read as "no title",
 * never fail the whole report's parse.
 */
export function recommendationTitleOf(evidence: unknown): RecommendationTitle | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const raw = (evidence as { title?: unknown }).title;
  if (raw == null) return null;
  const parsed = recommendationTitleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The action an evidence object carries, or null — same contract as `recommendationTitleOf`. */
export function recommendationActionOf(evidence: unknown): RecommendationAction | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const raw = (evidence as { action?: unknown }).action;
  if (raw == null) return null;
  const parsed = recommendationActionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The words a title may not open with or contain as an instruction. A title states; the
 * button acts. Pinned by the producers' tests so a verb cannot creep back into the sentence.
 */
export const TITLE_FORBIDDEN_VERBS =
  /\b(pausa|pausar|renovar|renueva|ampliar|amplía|hacer|haz|crear|crea|restaurar|restaura|ajustar|ajusta|mover|mueve|consolidar|consolida|revisar|revisa|detener|detén|stop|pause|refresh|expand|make|create|restore|adjust|move|consolidate|review|add|widen|rotate|retire|resume)\b/i;

/** True when the sentence carries an action verb — the thing a title must not do. */
export function titleCarriesVerb(text: string): boolean {
  return TITLE_FORBIDDEN_VERBS.test(text);
}
