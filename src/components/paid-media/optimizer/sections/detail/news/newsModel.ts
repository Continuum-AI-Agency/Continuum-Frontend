// The portfolio's news: the lead card and the insights beside it, composed from what the
// cycle already persisted, and handed back in ONE order — highest impact first — as `cards`.
// Pure — no React, no fetch — so every state below is pinned by a test.
//
// The order is the brief's own: `rankCandidates` (money per day, then module, then id), the
// same comparator that chose the maximum and decides whether the hero needs a justification.
// The lead is not always first. When Jaina picked a lower candidate, the maximum stands to
// its left and the lead's "chosen over the biggest number" line explains the pair; ranking
// the lead first anyway would put the card that says "not the biggest" in the biggest slot.
//
// Every card carries its own evidence, drawn in its band (./cardVisual): the kind's own
// figures from `recommendations[].evidence`, else the same ad set's cycle row, else a neutral
// strip of what the cycle knows. A figure is composed ONLY from numbers the report literally
// holds — the card never prints the engine's formula string in place of a picture.

import type { CycleItemRow, PortfolioBrief } from '@continuum/contracts';
import { rankCandidates } from '@continuum/contracts';
import type { HeroCta, HeroView } from '../heroModel';
import { ctaForCandidate } from '../heroModel';
import {
  type CardFigure,
  type CardTone,
  type CardVisual,
  figureForCard,
  toneForVisual,
  visualForCard,
} from './cardVisual';

const MODULE_LABEL: Record<string, string> = {
  budget: 'Budget',
  pause: 'Pause',
  creative: 'Creative',
  audience: 'Audience',
  none: 'Growth',
};

type BriefCandidate = PortfolioBrief['candidates'][number];

/** The colour a finding's tag reads in: scale green, pause red, creative amber, else muted. */
export type FindingTagTone = 'good' | 'bad' | 'warn' | 'muted';

/** The one-word tag a finding is listed under in "What the Optimizer found". */
export type FindingTag = {
  label: string;
  tone: FindingTagTone;
  /** What kind of finding it is, in the evidence's words: "sustained cost", "fatigue". */
  detail: string | null;
};

export type NewsCardModel = {
  id: string;
  /** The module and what kind of finding it is, above the card: "Pause · sustained cost". */
  eyebrow: string;
  /** The coloured tag the finding is listed under: "Scale", "Pause", "Creative". */
  tag: FindingTag;
  /** The ad set the card is about, when the claim does not already name it. */
  subject: string | null;
  /** One sentence. The claim, as written — never regenerated here. */
  claim: string;
  /** The quieter sentence under the band: the persisted reason. Null when there is none. */
  reason: string | null;
  /** The money the finding is worth per day — what the impact tier is read against. */
  impactPerDay: number | null;
  /**
   * Why THIS and not the biggest number on the list. The brief requires it whenever the hero
   * is not the highest-impact candidate; a card that drops it turns a choice into a mystery.
   */
  chosenOver: string | null;
  /** The card's own evidence, drawn in its band. Every card has one — see ./cardVisual. */
  visual: CardVisual;
  /** The figure on the band's top-left corner; null when the visual is the whole read. */
  figure: CardFigure | null;
  tone: CardTone;
  cta: HeroCta | null;
};

/** What kind of finding the evidence says this is: "sustained cost", "fatigue", "raise". */
function kindOf(module: string, visual: CardVisual, resultLabel: string): string | null {
  switch (visual.kind) {
    case 'cost_vs_reference':
      return 'sustained cost';
    case 'spend_blocks':
      return `zero ${resultLabel.toLowerCase()}`;
    case 'ctr_step':
      return 'fatigue';
    case 'budget_move':
      return module === 'budget' ? (visual.to > visual.from ? 'raise' : 'cut') : null;
    default:
      return null;
  }
}

/** The finding named by its evidence, so a reader knows the kind before reading a word. */
function eyebrowFor(module: string, visual: CardVisual, resultLabel: string): string {
  const base = MODULE_LABEL[module] ?? module;
  const kind = kindOf(module, visual, resultLabel);
  return kind ? `${base} · ${kind}` : base;
}

/**
 * The tag a finding is listed under. A budget move that raises an ad set is a scale; every
 * other module keeps its own name. Colour carries the direction only — scale green, pause red,
 * creative amber — so a list of findings reads as a list of verbs before a word of it.
 */
function tagFor(module: string, visual: CardVisual, resultLabel: string): FindingTag {
  const detail = kindOf(module, visual, resultLabel);
  switch (module) {
    case 'pause':
      return { label: MODULE_LABEL.pause, tone: 'bad', detail };
    case 'creative':
      return { label: MODULE_LABEL.creative, tone: 'warn', detail };
    case 'budget':
      return visual.kind === 'budget_move' && visual.to > visual.from
        ? { label: 'Scale', tone: 'good', detail: null }
        : { label: MODULE_LABEL.budget, tone: 'muted', detail };
    case 'none':
      return { label: 'Today', tone: 'muted', detail: 'nothing to change' };
    default:
      return { label: MODULE_LABEL[module] ?? module, tone: 'muted', detail };
  }
}

/** The ad set line, unless the claim already says it. */
function subjectFor(name: string | null, claim: string): string | null {
  if (!name) return null;
  return claim.includes(name) ? null : name;
}

/** A secondary candidate's sentence: its own persisted reason, else what it is and where. */
function claimFor(candidate: BriefCandidate): string {
  const where = candidate.adset_name ?? candidate.adset_id ?? 'the portfolio';
  const module = MODULE_LABEL[candidate.module] ?? candidate.module;
  return `${module} on ${where}`;
}

export type PortfolioNews = {
  lead: NewsCardModel;
  insights: NewsCardModel[];
  /**
   * Every card of the day — the lead and the insights — highest impact first, in the
   * brief's own ranking. This is the order the row shows them in; `lead` and `insights`
   * remain for what each card IS, `cards` is where each one SITS.
   */
  cards: NewsCardModel[];
};

/**
 * The cards in the brief's order. A lead with no candidate behind it (`module: 'none'`,
 * "nothing worth changing today") is the only card there is, so it simply leads.
 */
function rankCards(
  lead: NewsCardModel,
  insights: readonly NewsCardModel[],
  candidates: readonly BriefCandidate[],
): NewsCardModel[] {
  const rank = new Map(rankCandidates(candidates).map((c, index) => [c.id, index]));
  const position = (card: NewsCardModel): number => rank.get(card.id) ?? -1;
  return [lead, ...insights].sort((a, b) => position(a) - position(b));
}

/**
 * The lead card and every insight the brief listed beside it, each with its own visual.
 *
 * `items` is the cycle's reallocation rows and `view.recommendations` the cycle's
 * recommendations — together, the only places the evidence lives. Pass neither and every card
 * still renders: its band falls to the neutral strip of what the cycle knows.
 */
export function buildPortfolioNews(args: {
  view: HeroView;
  items: readonly CycleItemRow[];
  /** The portfolio's target cost per result, the line a cost is read against. */
  target: number | null;
}): PortfolioNews {
  const { view, items, target } = args;
  const brief = view.brief;
  const hero = brief.hero;
  const resultLabel = brief.growth.result_label;
  const shared = {
    recommendations: view.recommendations ?? [],
    items,
    growth: brief.growth,
    series: view.series ?? [],
    target,
    resultLabel,
  };

  const heroCandidate = brief.candidates.find((c) => c.id === hero.candidate_id) ?? null;
  const heroVisual = visualForCard({ ...shared, candidate: heroCandidate });
  const calm = hero.module === 'none';
  const lead: NewsCardModel = {
    id: hero.candidate_id ?? 'hero',
    eyebrow: calm ? 'Today · nothing to change' : eyebrowFor(hero.module, heroVisual, resultLabel),
    tag: tagFor(hero.module, heroVisual, resultLabel),
    subject: calm
      ? items.length > 0
        ? `${items.length} ad set${items.length === 1 ? '' : 's'}`
        : null
      : subjectFor(heroCandidate?.adset_name ?? null, hero.headline),
    claim: hero.headline,
    reason: hero.why || null,
    impactPerDay: hero.impact_per_day,
    chosenOver: hero.justification,
    visual: heroVisual,
    figure: figureForCard({
      candidate: heroCandidate,
      impactPerDay: hero.impact_per_day,
      visual: heroVisual,
      resultLabel,
    }),
    tone: toneForVisual(heroVisual),
    cta: view.cta,
  };

  const insights: NewsCardModel[] = [];
  for (const id of brief.secondary) {
    const candidate = brief.candidates.find((c) => c.id === id);
    if (!candidate || candidate.id === hero.candidate_id) continue;
    const visual = visualForCard({ ...shared, candidate });
    const claim = claimFor(candidate);
    insights.push({
      id: candidate.id,
      eyebrow: eyebrowFor(candidate.module, visual, resultLabel),
      tag: tagFor(candidate.module, visual, resultLabel),
      subject: subjectFor(candidate.adset_name ?? null, claim),
      claim,
      reason: candidate.reason,
      impactPerDay: candidate.impact_per_day,
      chosenOver: null,
      visual,
      figure: figureForCard({
        candidate,
        impactPerDay: candidate.impact_per_day,
        visual,
        resultLabel,
      }),
      tone: toneForVisual(visual),
      cta: ctaForCandidate(candidate, view.observe),
    });
  }
  return { lead, insights, cards: rankCards(lead, insights, brief.candidates) };
}
