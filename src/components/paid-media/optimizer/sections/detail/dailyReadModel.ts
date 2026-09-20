// The daily read, one row per category: the strongest candidate of each module the brief
// weighed — budget, pausing, creatives, audience — with its impact in words rather than
// money. The hero on the overview shows the single strongest of these; the activity view
// shows the whole set, so a module that did not win the hero is still a recommendation.

import type { BriefCandidate, HeroModule, ImpactTier } from '@continuum/contracts';
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
      cta: ctaForCandidate(candidate, view.observe),
    };
  });
}
