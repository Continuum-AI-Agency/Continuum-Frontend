import type {UiLocale} from '@/i18n/config';
import {heroMinImpact,readBriefStanding,MATERIAL_OVER_TARGET,STANDING_EVENT_FLOOR} from '@continuum/contracts';
import {formatCurrency} from '../../../format';
import {freezeLabel} from '../../../reportModel';
import {createOptimizerDisplayTranslate} from '@/lib/paid-media/optimizerTranslator';
import {resultNoun,resultWords} from './cardVisual';
import type { useTranslations as ScaleTranslationHook } from 'next-intl';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

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
function kindOf(
  module: string,
  visual: CardVisual,
  resultLabel: string,
  uiTranslate?: ScaleCopy,
): string | null {
  switch (visual.kind) {
    case 'cost_vs_reference':
      return uiTranslate?uiTranslate('newsKind',{kind:'cost_vs_reference'}):'sustained cost';
    case 'spend_blocks':
      return uiTranslate
        ? uiTranslate('helper_0af3742937c3', { v0: resultLabel.toLowerCase() })
        : `zero ${resultLabel.toLowerCase()}`;
    case 'ctr_step':
      return uiTranslate?uiTranslate('newsKind',{kind:'ctr_step'}):'fatigue';
    case 'budget_move':
      return module === 'budget' ? (uiTranslate?uiTranslate('newsKind',{kind:visual.to>visual.from?'budget_raise':'budget_cut'}):(visual.to > visual.from ? 'raise' : 'cut')) : null;
    default:
      return null;
  }
}

/** The finding named by its evidence, so a reader knows the kind before reading a word. */
function eyebrowFor(
  module: string,
  visual: CardVisual,
  resultLabel: string,
  uiTranslate?: ScaleCopy,
): string {
  const base = uiTranslate?uiTranslate('newsModule',{module}):(MODULE_LABEL[module] ?? module);
  const kind = kindOf(module, visual, resultLabel, uiTranslate);
  return kind ? `${base} · ${kind}` : base;
}

/**
 * The tag a finding is listed under. A budget move that raises an ad set is a scale; every
 * other module keeps its own name. Colour carries the direction only — scale green, pause red,
 * creative amber — so a list of findings reads as a list of verbs before a word of it.
 */
function tagFor(
  module: string,
  visual: CardVisual,
  resultLabel: string,
  uiTranslate?: ScaleCopy,
): FindingTag {
  const detail = kindOf(module, visual, resultLabel, uiTranslate);
  switch (module) {
    case 'pause':
      return { label: uiTranslate?uiTranslate('newsModule',{module:'pause'}):MODULE_LABEL.pause, tone: 'bad', detail };
    case 'creative':
      return { label: uiTranslate?uiTranslate('newsModule',{module:'creative'}):MODULE_LABEL.creative, tone: 'warn', detail };
    case 'budget':
      return visual.kind === 'budget_move' && visual.to > visual.from
        ? { label: 'Scale', tone: 'good', detail: null }
        : { label: uiTranslate?uiTranslate('newsModule',{module:'budget'}):MODULE_LABEL.budget, tone: 'muted', detail };
    case 'none':
      return { label: 'Today', tone: 'muted', detail: uiTranslate?uiTranslate('newsKind',{kind:'none'}):'nothing to change' };
    default:
      return { label: uiTranslate?uiTranslate('newsModule',{module}):(MODULE_LABEL[module] ?? module), tone: 'muted', detail };
  }
}

/** The ad set line, unless the claim already says it. */
function subjectFor(name: string | null, claim: string): string | null {
  if (!name) return null;
  return claim.includes(name) ? null : name;
}

/** A secondary candidate's sentence: its own persisted reason, else what it is and where. */
function claimFor(candidate: BriefCandidate, uiTranslate?: ScaleCopy): string {
  const where = candidate.adset_name ?? candidate.adset_id ?? (uiTranslate?uiTranslate('newsPortfolio'):'the portfolio');
  const module = uiTranslate?uiTranslate('newsModule',{module:candidate.module}):(MODULE_LABEL[candidate.module] ?? candidate.module);
  return uiTranslate
    ? uiTranslate('helper_fd32956785c1', { v0: module, v1: where })
    : `${module} on ${where}`;
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
export function buildPortfolioNews(
  args: {
    view: HeroView;
    items: readonly CycleItemRow[];
    /** The portfolio's target cost per result, the line a cost is read against. */
    target: number | null;
    dailyTotal?:number|null;
  },
  uiTranslate?: ScaleCopy,
  locale:UiLocale='en',
): PortfolioNews {
  const { view, items, target } = args;
  const brief = view.brief;
  const hero = brief.hero;
  const resultLabel = brief.growth.result_label;
  // Unread (HeroView.unread), the growth and the recap's days are the Meta half or nothing — not
  // the portfolio — so no card draws a spend, a result count or a cost line from them.
  const unread = Boolean(view.unread);
  const shared = {
    recommendations: view.recommendations ?? [],
    items,
    growth: unread ? null : brief.growth,
    series: unread ? [] : (view.series ?? []),
    target,
    resultLabel,
  };

  const heroCandidate = brief.candidates.find((c) => c.id === hero.candidate_id) ?? null;
  const heroVisual = visualForCard({ ...shared, candidate: heroCandidate });
  const calm = hero.module === 'none';
 const displayHero=uiTranslate&&view.source==='fallback'&&brief.model==='deterministic'?deterministicHeroCopy(args,uiTranslate,locale):{headline:hero.headline,why:hero.why};
  const lead: NewsCardModel = {
    id: hero.candidate_id ?? 'hero',
    eyebrow: calm
      ? 'Today · nothing to change'
      : eyebrowFor(hero.module, heroVisual, resultLabel, uiTranslate),
    tag: tagFor(hero.module, heroVisual, resultLabel, uiTranslate),
    subject: calm
      ? items.length > 0
        ? (uiTranslate?uiTranslate('newsAdSetCount',{count:items.length}):`${items.length} ad set${items.length === 1 ? '' : 's'}`)
        : null
      : subjectFor(heroCandidate?.adset_name ?? null, displayHero.headline),
    claim: displayHero.headline,
    reason: displayHero.why || null,
    impactPerDay: hero.impact_per_day,
    chosenOver: hero.justification,
    visual: heroVisual,
    figure: figureForCard(
      {
        candidate: heroCandidate,
        impactPerDay: hero.impact_per_day,
        visual: heroVisual,
        resultLabel,
      },
      uiTranslate,
    ),
    tone: toneForVisual(heroVisual),
    cta: view.cta,
  };

  const insights: NewsCardModel[] = [];
  for (const id of brief.secondary) {
    const candidate = brief.candidates.find((c) => c.id === id);
    if (!candidate || candidate.id === hero.candidate_id) continue;
    const visual = visualForCard({ ...shared, candidate });
    const claim = claimFor(candidate, uiTranslate);
    insights.push({
      id: candidate.id,
      eyebrow: eyebrowFor(candidate.module, visual, resultLabel, uiTranslate),
      tag: tagFor(candidate.module, visual, resultLabel, uiTranslate),
      subject: subjectFor(candidate.adset_name ?? null, claim),
      claim,
      reason: candidate.reason,
      impactPerDay: candidate.impact_per_day,
      chosenOver: null,
      visual,
      figure: figureForCard(
        {
          candidate,
          impactPerDay: candidate.impact_per_day,
          visual,
          resultLabel,
        },
        uiTranslate,
      ),
      tone: toneForVisual(visual),
      cta: ctaForCandidate(candidate, view.observe),
    });
  }
  return { lead, insights, cards: rankCards(lead, insights, brief.candidates) };
}

/** Only canonical deterministic briefs receive app-owned prose; model-written candidates and report text remain source content. */
function deterministicHeroCopy(args:Parameters<typeof buildPortfolioNews>[0],t:ScaleCopy,locale:UiLocale):{headline:string;why:string}{
 const {view,items}=args,brief=view.brief,g=brief.growth,h=brief.hero;
 const candidate=brief.candidates.find(c=>c.id===h.candidate_id);
 const money=(n:number)=>formatCurrency(n,g.currency,locale);
 const words=resultWords(g.result_label,t),result=words.one,results=words.many;
 if(h.module!=='none'&&candidate)return {headline:t('newsCandidateHeadline',{module:h.module,amount:money(candidate.impact_per_day),name:candidate.adset_name??candidate.adset_id??t('newsAnAdSet'),results}),why:h.why};
 const days=Number(g.window.slice(1)),standing=view.standing??readBriefStanding(null,items),held=standing.adsets_total>0&&standing.adsets_held===standing.adsets_total;
 const top=brief.candidates[0],floorNote=top?t('newsUnderFloorReason',{amount:money(top.impact_per_day),floor:money(heroMinImpact(args.dailyTotal))}):t('newsNoRecommendationsReason');
 const guidance=freezeLabel(standing.held_reason,null,createOptimizerDisplayTranslate(t))?.hint??'';
 const heldNote=t('newsHeldReason',{count:standing.adsets_total,guidance});
 let headline=t('newsCalmHeadline'),why=top?t('newsBelowImpactFloor'):t('newsNoOpenRecommendations');
 if(g.results===0){
  headline=g.spend<=0?t('newsNoSpendHeadline',{results,days}):held?t('newsNoResultsHeldHeadline',{results,days,count:standing.adsets_total}):t('newsNoResultsHeadline',{results,days,amount:money(g.spend)});
  why=held?(g.spend<=0?t('newsNothingDelivered')+' ':'')+heldNote:g.spend<=0?t('newsNothingDelivered'):t('newsNoResultsReason',{amount:money(g.spend),days,results});
 }else if(held){headline=t('newsAllHeldHeadline',{count:standing.adsets_total});why=heldNote}
 else if(g.cost_per_result!=null&&g.target!=null&&g.target>0&&g.cost_per_result/g.target-1>MATERIAL_OVER_TARGET){
  const confident=standing.confidence!=null?standing.confidence!=='low':g.results>=STANDING_EVENT_FLOOR;
  headline=t('newsOverTargetHeadline',{result,cost:money(g.cost_per_result),target:money(g.target),confident:confident?'yes':'no',percent:Math.round((g.cost_per_result/g.target-1)*100)});
  why=confident?t('newsCostGapReason',{floorNote,count:g.results,results}):t('newsLowConfidenceReason',{floorNote});
 }
 return {headline,why};
}
