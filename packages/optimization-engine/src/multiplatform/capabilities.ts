// ---------------------------------------------------------------------------
// Which of the engine's rule families can judge an entity on its platform.
//
// Three stages read signals only Meta reports today: delivery (issues_info,
// learning_stage_info, the ACTIVE roster), creative (the per-ad standing from
// paid-creative-intel) and — on Google — fatigue (frequency and the Meta CTR series).
// Fed a Google or TikTok entity they would not fire, and that silence would read as
// "nothing wrong". So a family that cannot apply is skipped BY NAME, with the reason
// 'not_applicable:<platform>', and the cycle carries the skip.
// Design: google-acciones.html §4 (G09/G10/G23 are "siguiente"), tiktok.html §4.1.
// ---------------------------------------------------------------------------

import type { EntityAutomation, PlatformId } from '@continuum/contracts';
import type { AdSetSnapshot, RuleFamily, RuleSkip } from '../types';

export type RuleApplicability =
  | { applies: true }
  | { applies: false; reason: `not_applicable:${PlatformId}` };

export type PlatformCapabilities = {
  platform: PlatformId;
  automation: EntityAutomation;
  /** May the engine reason about (and move budget between) this campaign's sub-units?
   *  False when the platform controls them: PMax asset groups, Smart+ ad groups. */
  descendToGroups: boolean;
  rules: Record<RuleFamily, RuleApplicability>;
};

const APPLIES: RuleApplicability = { applies: true };

function notApplicable(platform: PlatformId): RuleApplicability {
  return { applies: false, reason: `not_applicable:${platform}` };
}

/** Rule families that read Meta-only inputs, per platform. Meta keeps every family. */
const META_ONLY_FAMILIES: Readonly<Record<PlatformId, readonly RuleFamily[]>> = {
  meta: [],
  // Delivery reads Meta's blockers and roster (Google darkness is the account/campaign
  // read in googleRules); creative needs the per-ad standing; fatigue needs frequency.
  google_ads: ['delivery', 'fatigue', 'creative'],
  // F1/F2 port as-is (tiktok.html §4.1 rules 04–05). Delivery needs secondary_status mapped
  // into DeliverySignals and creative needs AUCTION_AD reporting: neither exists yet.
  tiktok_ads: ['delivery', 'creative'],
};

const PLATFORM_CONTROLS_SUBUNITS: ReadonlySet<EntityAutomation> = new Set<EntityAutomation>([
  'pmax',
  'smart_plus',
  'upgraded_smart_plus',
]);

export function platformCapabilities(
  platform: PlatformId,
  automation: EntityAutomation,
): PlatformCapabilities {
  const skipped = new Set(META_ONLY_FAMILIES[platform]);
  // A campaign whose ads the platform assembles has no creative standing we could read.
  if (platform !== 'meta' && PLATFORM_CONTROLS_SUBUNITS.has(automation)) skipped.add('creative');
  const rule = (family: RuleFamily): RuleApplicability =>
    skipped.has(family) ? notApplicable(platform) : APPLIES;
  return {
    platform,
    automation,
    descendToGroups: !PLATFORM_CONTROLS_SUBUNITS.has(automation),
    rules: { delivery: rule('delivery'), fatigue: rule('fatigue'), creative: rule('creative') },
  };
}

const RULE_FAMILIES: readonly RuleFamily[] = ['delivery', 'fatigue', 'creative'];

/** Every (entity, family) pair the cycle must skip. Empty for a Meta-only roster. */
export function ruleSkipsFor(snapshots: readonly AdSetSnapshot[]): RuleSkip[] {
  const skips: RuleSkip[] = [];
  for (const s of snapshots) {
    if (!s.platform || s.platform === 'meta') continue;
    const caps = platformCapabilities(s.platform, s.automation ?? 'manual');
    for (const family of RULE_FAMILIES) {
      const applicability = caps.rules[family];
      if (!applicability.applies) {
        skips.push({ adSetId: s.id, family, reason: applicability.reason });
      }
    }
  }
  return skips;
}

/** The ids a cycle stage must leave alone. */
export function skippedIds(skips: readonly RuleSkip[], family: RuleFamily): Set<string> {
  return new Set(skips.filter((s) => s.family === family).map((s) => s.adSetId));
}
