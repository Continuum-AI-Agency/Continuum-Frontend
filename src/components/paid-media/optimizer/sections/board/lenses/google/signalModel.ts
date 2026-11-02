// G10 Signal, the figures: what Google counts as a conversion against what counts. Three of the
// Optimizer's account findings say it, each in its own figures: V1 (inflated_primary_conversion)
// splits what Google reports into attention events and real results, with both costs; E3
// (conversion_value_map) lists the conversion actions, which are primary and what each is worth;
// P5 (lead_to_sale_funnel) follows the clicks to leads and the leads to sales.
//
// Every figure is the producer's. The bars carry the counts and are read by their flags and their
// order, never their words; what only a fact states is read under its label in either language
// the engine writes (@continuum/contracts signalFindingLabels), so a card reads the same before
// and after the engine's Spanish rewrite deploys.

import {
  type PlatformCard,
  signalActionsSentence,
  signalActionWords,
  signalFindingLabels,
  signalFunnelSentence,
  signalSplitSentence,
} from '@continuum/contracts';
import { formatCurrency } from '../../../../format';
import {
  countLabel,
  type FindingCard,
  factOf,
  findingsOf,
  leadingNumber,
  shareLabel,
} from './mixAuctionSignalModel';

export type SignalSplit = {
  /** What Google reports, every primary action together; null when the finding does not say. */
  reported: number | null;
  /** The flagged bar: visits and attention events. */
  attention: number;
  /** The other bar: leads and sales. */
  real: number;
  /** 0–1 of what is drawn: the attention events against the real results. */
  attentionShare: number;
  /** Null when the finding prices none (no real result, or no spend read). */
  reportedCost: number | null;
  realCost: number | null;
};

export type SignalAction = {
  label: string;
  count: number;
  /** 0–1 of every conversion the actions recorded. */
  share: number;
  /** The finding's verdict: an attention event, or a lead that is not primary. */
  flagged: boolean;
  role: 'primary' | 'secondary' | null;
  /** The value the action carries; `unset` when Google holds none; null when unstated. */
  value: number | 'unset' | null;
};

export type SignalActions = {
  rows: SignalAction[];
  /** The primary actions, as the finding names them. */
  primaries: string[];
  /** The one value every action carries, when the finding says they all carry the same. */
  sameValue: number | null;
};

/** P5's steps by role: it always ends on leads then sales, and leads with the clicks only when
 *  the producer read the campaigns. */
export type SignalStepRole = 'clicks' | 'leads' | 'sales';

export type SignalStep = { role: SignalStepRole; value: number; flagged: boolean };

export type SignalFunnel = {
  steps: SignalStep[];
  salesValue: number | null;
  roas: number | null;
  /** The core keywords and their Quality Score ("iso 27000", "QS 1"). */
  keywords: { keyword: string; score: string }[];
  /** What the finding cannot measure yet, in its own words. */
  blocked: string | null;
};

export type SignalModel = {
  split: SignalSplit | null;
  actions: SignalActions | null;
  funnel: SignalFunnel | null;
  currency: string | null;
  windowDays: number | null;
};

function splitOf(card: FindingCard): SignalSplit | null {
  const bars = card.bars ?? [];
  const attention = bars.find((bar) => bar.flagged);
  const real = bars.find((bar) => !bar.flagged);
  if (!attention || !real) return null;
  const drawn = attention.value + real.value;
  return {
    reported: leadingNumber(factOf(card, signalFindingLabels.reported)),
    attention: attention.value,
    real: real.value,
    attentionShare: attention.share ?? (drawn > 0 ? attention.value / drawn : 0),
    reportedCost: leadingNumber(factOf(card, signalFindingLabels.reportedCost)),
    realCost: leadingNumber(factOf(card, signalFindingLabels.realCost)),
  };
}

const among = (words: readonly string[], text: string | undefined): boolean =>
  text != null && words.includes(text);

/** "3470 · secondary · value 1" (or "3470 · secundaria · valor 1") → the role and the value E3
 *  states for one action. */
function actionWords(text: string | null): Pick<SignalAction, 'role' | 'value'> {
  const [, role, value] = text?.split(' · ') ?? [];
  const prefix = signalActionWords.valuePrefix.find((word) => value?.startsWith(word));
  const stated = prefix && value ? value.slice(prefix.length) : null;
  return {
    role: among(signalActionWords.primary, role)
      ? 'primary'
      : among(signalActionWords.secondary, role)
        ? 'secondary'
        : null,
    value:
      stated == null
        ? null
        : among(signalActionWords.unset, stated)
          ? 'unset'
          : (leadingNumber(stated) ?? null),
  };
}

function actionsOf(card: FindingCard): SignalActions | null {
  const bars = card.bars ?? [];
  if (bars.length === 0) return null;
  const total = bars.reduce((sum, bar) => sum + bar.value, 0);
  const rows = bars.map((bar) => ({
    label: bar.label,
    count: bar.value,
    share: total > 0 ? bar.value / total : 0,
    flagged: bar.flagged,
    // An action's figure is filed under the action's own name, which no language changes.
    ...actionWords(factOf(card, bar.label)),
  }));
  const values = new Set(rows.flatMap((row) => (typeof row.value === 'number' ? [row.value] : [])));
  const [only] = values;
  const everyStated = rows.every((row) => typeof row.value === 'number');
  const saidSame = card.checklist.some((item) =>
    among(signalActionWords.sameValue, item.detail ?? undefined),
  );
  const primaries = (factOf(card, signalFindingLabels.primaries) ?? '')
    .split(', ')
    .filter((name) => name !== '' && !among(signalActionWords.noPrimary, name));
  return {
    rows,
    primaries:
      primaries.length > 0
        ? primaries
        : rows.flatMap((row) => (row.role === 'primary' ? [row.label] : [])),
    sameValue: values.size === 1 && only != null && (everyStated || saidSame) ? only : null,
  };
}

function funnelOf(card: FindingCard): SignalFunnel | null {
  const bars = (card.bars ?? []).slice(-3);
  if (bars.length < 2) return null;
  // Told from the end: the last two steps are leads and sales; a third before them is the clicks.
  const roles: readonly SignalStepRole[] =
    bars.length === 3 ? ['clicks', 'leads', 'sales'] : ['leads', 'sales'];
  const steps = bars.map((bar, index) => ({
    role: roles[index] ?? 'sales',
    value: bar.value,
    flagged: bar.flagged,
  }));
  const [, value] = factOf(card, signalFindingLabels.sales)?.split(' · ') ?? [];
  return {
    steps,
    salesValue: leadingNumber(value),
    roas: leadingNumber(factOf(card, signalFindingLabels.roas)),
    keywords: card.facts
      .filter((fact) => fact.label.startsWith('"') && fact.label.endsWith('"'))
      .map((fact) => ({ keyword: fact.label.slice(1, -1), score: fact.value })),
    blocked: card.blocked,
  };
}

/** The steps by role; a role the finding did not count is null. */
export function funnelRoles(funnel: SignalFunnel): Record<SignalStepRole, SignalStep | null> {
  const of = (role: SignalStepRole) => funnel.steps.find((step) => step.role === role) ?? null;
  return { clicks: of('clicks'), leads: of('leads'), sales: of('sales') };
}

/** The conversion signal from the account's pending cards; every part is null without its
 *  finding. */
export function buildSignal(cards: readonly PlatformCard[]): SignalModel {
  const v1 = findingsOf(cards, 'inflated_primary_conversion')[0] ?? null;
  const e3 = findingsOf(cards, 'conversion_value_map')[0] ?? null;
  const p5 = findingsOf(cards, 'lead_to_sale_funnel')[0] ?? null;
  const first = v1 ?? p5 ?? e3;
  return {
    split: v1 ? splitOf(v1) : null,
    actions: e3 ? actionsOf(e3) : null,
    funnel: p5 ? funnelOf(p5) : null,
    currency: first?.currency ?? null,
    windowDays: first?.window_days ?? null,
  };
}

export function hasSignal(model: SignalModel): boolean {
  return model.split != null || model.actions != null || model.funnel != null;
}

/** A step's share of the step before it: "0.68%", "9.1%". */
export function stepRate(value: number, previous: number): string | null {
  if (previous <= 0) return null;
  const rate = (value / previous) * 100;
  return `${rate.toFixed(rate < 1 ? 2 : 1)}%`;
}

const counted = (value: number) => ({ count: value, text: countLabel(value) });

/** The sentence a larger lens closes with, in the account's language: V1 first, then P5, then E3. */
export function signalTakeaway(model: SignalModel): string | null {
  const money = (value: number | null) =>
    value == null ? null : formatCurrency(value, model.currency);
  if (model.split) {
    const split = model.split;
    return signalSplitSentence({
      reported: split.reported != null ? countLabel(split.reported) : null,
      attention: countLabel(split.attention),
      share: shareLabel(split.attentionShare),
      real: countLabel(split.real),
      realCost: money(split.realCost),
      reportedCost: money(split.reportedCost),
    });
  }
  if (model.funnel) {
    const { clicks, leads, sales } = funnelRoles(model.funnel);
    if (!leads || !sales) return null;
    return signalFunnelSentence({
      clicks: clicks ? counted(clicks.value) : null,
      leads: counted(leads.value),
      sales: counted(sales.value),
      salesValue: money(model.funnel.salesValue),
      roas: model.funnel.roas != null ? model.funnel.roas.toFixed(2) : null,
    });
  }
  if (model.actions) {
    const actions = model.actions;
    return signalActionsSentence({
      count: actions.rows.length,
      sameValue: actions.sameValue != null ? String(actions.sameValue) : null,
      primaries: actions.primaries,
      flagged: actions.rows.filter((row) => row.flagged).length,
    });
  }
  return null;
}
