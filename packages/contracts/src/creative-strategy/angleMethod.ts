// Communication-angle method — the rules a creative analysis applies once ads carry
// labels and numbers. Ported from the reference methodology (Pixis Prism, doc 04) onto
// the vocabulary this repo already has: hooks are `creativeHookArchetypeSchema`
// (taxonomy.ts), angles are the closed `globalAngleIdSchema` (angles.ts). Nothing here
// mints a new enum; it adds the three things the vocabulary lacked:
//
//   1. the LABEL GRAMMAR — "[Offer] · [Hook] · [Format] · [Funnel role]" — one string a
//      brief, a chart legend and a Jaina answer can all print for the same cluster;
//   2. the EFFICIENCY RATIO — CTR ÷ CVR — which splits creatives that earn clicks on an
//      entertaining hook and convert nobody ("engagement traps") from the ones whose
//      clicks become results, even when both share a hook type;
//   3. the OPPORTUNITY RULES — scale / refresh / kill / emerging — with the thresholds
//      the methodology names, so a recommendation can cite the rule it fired on.
//
// Every function is pure and every threshold is exported: the Optimizer, Jaina and the
// Forge brief all read the same numbers, and a change to one is a change to all.

import { z } from 'zod';
import { GLOBAL_ANGLE_LABELS, type GlobalAngleId, globalAngleIdSchema } from './angles';
import { type CreativeHookArchetype, creativeHookArchetypeSchema } from './taxonomy';

// ---------------------------------------------------------------------------
// Prism's ten hook types, mapped onto the repo's hook archetypes. The mapping is the
// documentation: when a Prism-trained reader says "value/price", the store says
// value_stack. Two Prism types are not hooks in this taxonomy — UGC/native is a visual
// style, seasonal/event is a scarcity framing — and are mapped accordingly.
// ---------------------------------------------------------------------------
export const PRISM_HOOK_TYPES = {
  urgency_scarcity: 'scarcity',
  social_proof: 'social_proof',
  benefit_led: 'transformation',
  curiosity_pattern_interrupt: 'curiosity_gap',
  value_price: 'value_stack',
  emotional_lifestyle: 'transformation',
  feature_product: 'comparison',
  authority_trust: 'authority',
  ugc_native: 'unknown',
  seasonal_event: 'scarcity',
} as const satisfies Record<string, CreativeHookArchetype>;
export type PrismHookType = keyof typeof PRISM_HOOK_TYPES;

export const HOOK_ARCHETYPE_LABELS: Record<CreativeHookArchetype, string> = {
  problem_agitation: 'Problem-led',
  social_proof: 'Social proof',
  scarcity: 'Urgency / scarcity',
  curiosity_gap: 'Curiosity',
  authority: 'Authority',
  transformation: 'Benefit-led',
  value_stack: 'Value / price',
  comparison: 'Feature / comparison',
  unknown: 'Unclassified hook',
};

// ---------------------------------------------------------------------------
// Label grammar
// ---------------------------------------------------------------------------
export const angleVisualStyleSchema = z.enum([
  'ugc',
  'studio',
  'motion_graphic',
  'celebrity',
  'text_only',
  'unknown',
]);
export type AngleVisualStyle = z.infer<typeof angleVisualStyleSchema>;

export const angleFormatSchema = z.enum(['static', 'video', 'carousel', 'collection', 'unknown']);
export type AngleFormat = z.infer<typeof angleFormatSchema>;

export const angleFunnelRoleSchema = z.enum(['tof', 'mof', 'bof', 'unknown']);
export type AngleFunnelRole = z.infer<typeof angleFunnelRoleSchema>;

export const angleClusterKeySchema = z.object({
  /** The selling idea, from the closed vocabulary. */
  angleId: globalAngleIdSchema.nullable(),
  hook: creativeHookArchetypeSchema,
  format: angleFormatSchema,
  funnelRole: angleFunnelRoleSchema,
  visualStyle: angleVisualStyleSchema.default('unknown'),
});
export type AngleClusterKey = z.infer<typeof angleClusterKeySchema>;

const FORMAT_WORDS: Record<AngleFormat, string> = {
  static: 'static',
  video: 'video',
  carousel: 'carousel',
  collection: 'collection',
  unknown: 'any format',
};
const FUNNEL_WORDS: Record<AngleFunnelRole, string> = {
  tof: 'TOF',
  mof: 'MOF',
  bof: 'BOF',
  unknown: 'any stage',
};

/** "[Offer] · [Hook] · [Format] · [Funnel role]" — e.g. "Discount offer · Value / price ·
 *  static · BOF". The offer is the angle's own label; a cluster with no angle in the
 *  vocabulary leads with its hook. */
export function angleLabel(key: AngleClusterKey): string {
  const offer = key.angleId ? GLOBAL_ANGLE_LABELS[key.angleId] : null;
  const hook = HOOK_ARCHETYPE_LABELS[key.hook];
  const parts = [offer, hook, FORMAT_WORDS[key.format], FUNNEL_WORDS[key.funnelRole]].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join(' · ');
}

/** Two creatives belong to one cluster when their key matches exactly. */
export function angleClusterId(key: AngleClusterKey): string {
  return [key.angleId ?? '-', key.hook, key.format, key.funnelRole].join('|');
}

// ---------------------------------------------------------------------------
// Efficiency ratio — CTR ÷ CVR. Both as fractions (clicks/impressions, results/clicks).
// ---------------------------------------------------------------------------
export const EFFICIENCY_QUALITY_MAX = 10;
export const EFFICIENCY_TRAP_MIN = 100;

export const efficiencyClassSchema = z.enum([
  'quality_converter',
  'moderate',
  'engagement_trap',
  'unknown',
]);
export type EfficiencyClass = z.infer<typeof efficiencyClassSchema>;

export function efficiencyRatio(ctr: number | null, cvr: number | null): number | null {
  if (ctr == null || cvr == null || !Number.isFinite(ctr) || !Number.isFinite(cvr)) return null;
  if (ctr <= 0 || cvr <= 0) return null;
  return ctr / cvr;
}

export function efficiencyClass(ratio: number | null): EfficiencyClass {
  if (ratio == null) return 'unknown';
  if (ratio < EFFICIENCY_QUALITY_MAX) return 'quality_converter';
  if (ratio > EFFICIENCY_TRAP_MIN) return 'engagement_trap';
  return 'moderate';
}

export const EFFICIENCY_CLASS_LABELS: Record<EfficiencyClass, string> = {
  quality_converter: 'Quality converter',
  moderate: 'Moderate',
  engagement_trap: 'Engagement trap',
  unknown: 'Not enough data',
};

// ---------------------------------------------------------------------------
// Aggregation law: an angle's metrics are sums of its members' numerators and
// denominators, never averages of their ratios.
// ---------------------------------------------------------------------------
export type AngleMemberMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Optional week-over-week CTR change of the member, as a fraction (−0.2 = down 20%). */
  ctrWoW?: number | null;
};

export type AngleStat = {
  id: string;
  label: string;
  members: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  cvr: number | null;
  cpa: number | null;
  ratio: number | null;
  class: EfficiencyClass;
  /** Spend-weighted mean of members' WoW CTR change; null when none carries one. */
  ctrWoW: number | null;
};

export function aggregateAngle(
  id: string,
  label: string,
  members: readonly AngleMemberMetrics[],
): AngleStat {
  const spend = members.reduce((s, m) => s + m.spend, 0);
  const impressions = members.reduce((s, m) => s + m.impressions, 0);
  const clicks = members.reduce((s, m) => s + m.clicks, 0);
  const conversions = members.reduce((s, m) => s + m.conversions, 0);
  const ctr = impressions > 0 ? clicks / impressions : null;
  const cvr = clicks > 0 ? conversions / clicks : null;
  const cpa = conversions > 0 ? spend / conversions : null;
  const ratio = efficiencyRatio(ctr, cvr);
  const wow = members.filter((m) => typeof m.ctrWoW === 'number' && m.spend > 0);
  const wowSpend = wow.reduce((s, m) => s + m.spend, 0);
  const ctrWoW =
    wowSpend > 0 ? wow.reduce((s, m) => s + (m.ctrWoW as number) * m.spend, 0) / wowSpend : null;
  return {
    id,
    label,
    members: members.length,
    spend,
    impressions,
    clicks,
    conversions,
    ctr,
    cvr,
    cpa,
    ratio,
    class: efficiencyClass(ratio),
    ctrWoW,
  };
}

// ---------------------------------------------------------------------------
// Opportunity rules
// ---------------------------------------------------------------------------
/** A cluster needs this many creatives, OR this share of spend, to be an angle at all. */
export const ANGLE_MIN_MEMBERS = 2;
export const ANGLE_MIN_SPEND_SHARE = 0.05;
/** Scale: best-tier efficiency AND at least this share of spend. */
export const SCALE_MIN_SPEND_SHARE = 0.05;
/** Refresh: week-over-week CTR down by at least this fraction. */
export const REFRESH_CTR_DROP = 0.2;

export const angleOpportunityKindSchema = z.enum([
  'scale_winning',
  'refresh_fatigued',
  'kill_trap',
  'emerging',
]);
export type AngleOpportunityKind = z.infer<typeof angleOpportunityKindSchema>;

export type AngleOpportunity = {
  kind: AngleOpportunityKind;
  angleId: string;
  label: string;
  /** The rule that fired, in words a brief can quote. */
  evidence: string;
};

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** Read the opportunities off a set of angle stats. Order: kill first (money leaking),
 *  then refresh, then scale, then emerging. */
export function angleOpportunities(stats: readonly AngleStat[]): AngleOpportunity[] {
  const totalSpend = stats.reduce((s, a) => s + a.spend, 0);
  if (totalSpend <= 0) return [];
  const share = (a: AngleStat): number => a.spend / totalSpend;
  const isAngle = (a: AngleStat): boolean =>
    a.members >= ANGLE_MIN_MEMBERS || share(a) >= ANGLE_MIN_SPEND_SHARE;
  const withCpa = stats.filter((a) => a.cpa != null && isAngle(a));
  const medianCpa = median(withCpa.map((a) => a.cpa as number));

  const out: AngleOpportunity[] = [];
  for (const a of stats) {
    if (!isAngle(a)) continue;
    // A single creative is read in the second pass, as emerging — one ad's luck is not
    // an angle to scale, whatever its ratio says.
    if (a.members < ANGLE_MIN_MEMBERS) continue;
    if (a.class === 'engagement_trap') {
      out.push({
        kind: 'kill_trap',
        angleId: a.id,
        label: a.label,
        evidence: `CTR ÷ CVR = ${Math.round(a.ratio ?? 0)}× (over ${EFFICIENCY_TRAP_MIN}) on ${pct(share(a))} of spend — clicks that do not become results.`,
      });
      continue;
    }
    if (a.ctrWoW != null && a.ctrWoW <= -REFRESH_CTR_DROP) {
      out.push({
        kind: 'refresh_fatigued',
        angleId: a.id,
        label: a.label,
        evidence: `CTR down ${pct(-a.ctrWoW)} week over week across ${a.members} creative${a.members === 1 ? '' : 's'} — brief a new hook inside the same angle.`,
      });
      continue;
    }
    if (
      a.class === 'quality_converter' &&
      a.cpa != null &&
      medianCpa != null &&
      a.cpa <= medianCpa &&
      share(a) >= SCALE_MIN_SPEND_SHARE
    ) {
      out.push({
        kind: 'scale_winning',
        angleId: a.id,
        label: a.label,
        evidence: `Quality converter (CTR ÷ CVR = ${Math.round(a.ratio ?? 0)}×) at or under the median cost per result, on ${pct(share(a))} of spend — raise budget on its ad sets.`,
      });
    }
  }
  for (const a of stats) {
    if (a.members < ANGLE_MIN_MEMBERS && share(a) >= ANGLE_MIN_SPEND_SHARE) {
      out.push({
        kind: 'emerging',
        angleId: a.id,
        label: a.label,
        evidence: `One creative carrying ${pct(share(a))} of spend — an emerging angle; ship a second variant before reading it as a cluster.`,
      });
    }
  }
  return out;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// The brief the Forge consumes — analysis hands generation a recommendation, never the
// other way round (the two stay separate services with this as the seam).
// ---------------------------------------------------------------------------
export const angleRecommendationSchema = z.object({
  cluster: angleClusterKeySchema,
  label: z.string().min(1),
  kind: angleOpportunityKindSchema,
  messagePromise: z.string().nullable().default(null),
  proofMechanism: z.string().nullable().default(null),
  evidence: z.string().min(1),
  /** Ad sets the recommendation is for. */
  targetAdSets: z.array(z.object({ id: z.string(), name: z.string().nullable() })).default([]),
  /** Node ids from the evidence the numbers came from; never a second rollup. */
  groundedOn: z.array(z.string()).default([]),
});
export type AngleRecommendation = z.infer<typeof angleRecommendationSchema>;

export type { GlobalAngleId };
