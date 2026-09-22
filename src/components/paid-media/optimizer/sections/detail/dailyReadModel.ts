// The daily read, one row per category: the strongest candidate of each module the brief
// weighed — budget, pausing, creatives, audience — with its impact in words rather than
// money. The hero on the overview shows the single strongest of these; the activity view
// shows the whole set, so a module that did not win the hero is still a recommendation.

import type {
  AdhocSuggestionFigure,
  BriefCandidate,
  HeroModule,
  ImpactTier,
} from '@continuum/contracts';
import {
  HERO_MODULE_COPY,
  IMPACT_TIER_COPY,
  impactTier,
  topCandidatePerModule,
} from '@continuum/contracts';
import { triggerWords } from '../recQueueModel';
import { ctaForCandidate, type HeroCta, type HeroView } from './heroModel';

export type DailyReadRow = {
  id: string;
  module: Exclude<HeroModule, 'none'>;
  /** "Budget", "Creatives" — the category chip. */
  category: string;
  tier: ImpactTier;
  tierLabel: string;
  /** "Creative rotation · Retargeting 30d" */
  title: string;
  /** The persisted sentence, quoted as the engine wrote it. */
  reason: string | null;
  basis: string;
  /** This row is the one the hero opened on. */
  isHero: boolean;
  /** Where the row came from. 'brief' is the cycle's own read; 'asked' is a suggestion a
   *  person requested just now. Both live in ONE list — see askedForModel.ts. */
  origin: 'brief' | 'asked';
  /** What an asked-for row adds under the sentence: how to do it, and the figures it was
   *  read off. Absent on a brief row, whose argument is already its one reason line. */
  detail?: { steps: string[]; figures: AdhocSuggestionFigure[] };
  /** The line beside the control: what pressing it will do and that nothing goes live, or
   *  what the press already built. Absent on a brief row — the queue row it focuses carries
   *  its own approve/execute wording. See askedForModel.ts. */
  nextNote?: string | null;
  cta: HeroCta;
};

const KIND_WORDS: Record<string, string> = {
  budget_move: 'Budget moves this cycle',
  pause: 'Pause',
  variate_creative: 'New creatives',
  creative_refresh: 'Creative rotation',
  audience_expand: 'New audience',
  audience_change: 'Audience change',
};

function titleOf(candidate: BriefCandidate): string {
  const action =
    KIND_WORDS[candidate.kind] ??
    (candidate.trigger
      ? triggerWords(candidate.trigger)
      : HERO_MODULE_COPY[candidate.module].label);
  const where = candidate.adset_name ?? candidate.adset_id;
  return where && candidate.id !== 'budget:portfolio' ? `${action} · ${where}` : action;
}

export function buildDailyRead(
  view: HeroView,
  dailyTotal: number | null | undefined,
): DailyReadRow[] {
  const heroId = view.brief.hero.candidate_id;
  return topCandidatePerModule(view.brief.candidates).map((candidate) => {
    const tier = impactTier(candidate.impact_per_day, dailyTotal);
    return {
      id: candidate.id,
      module: candidate.module,
      category: HERO_MODULE_COPY[candidate.module].label,
      tier,
      tierLabel: IMPACT_TIER_COPY[tier],
      title: titleOf(candidate),
      reason: candidate.reason,
      basis: candidate.impact_basis,
      isHero: candidate.id === heroId,
      origin: 'brief',
      cta: ctaForCandidate(candidate, view.observe),
    };
  });
}
