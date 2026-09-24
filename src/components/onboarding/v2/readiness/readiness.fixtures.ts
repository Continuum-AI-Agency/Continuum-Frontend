import type {
  ReadinessAnalysis,
  ReadinessCriterionMet,
  ReadinessCriterionResult,
  ReadinessEvidenceSource,
  ReadinessFinding,
} from '@continuum/contracts';

// Criteria-scored readiness rows for the hero's render test and the onboarding DNA
// bench. Numbers follow the scorer's arithmetic with equal weights: a dimension is
// 100 × earned / known criteria (yes 1, partial 0.5, unknown left out), overall is
// the mean over dimensions with any coverage, and `reachable` fixes the three moves.

function criterion(
  id: string,
  label: string,
  met: ReadinessCriterionMet,
  source: ReadinessEvidenceSource | null = null,
  quote: string | null = null,
  sourceUrl: string | null = null,
): ReadinessCriterionResult {
  return { id, label, met, quote, source, source_url: sourceUrl, verified: quote !== null };
}

const brandIdentity = {
  score: 88,
  coverage: 1,
  reachable: 88,
  rationale: 'Name, palette and tone hold across the homepage and Instagram.',
  criteria: [
    criterion(
      'bi.name_consistent',
      'Brand name is used consistently',
      'yes',
      'homepage',
      'Physio Loop',
    ),
    criterion(
      'bi.visual_system',
      'A recognisable visual system is applied',
      'yes',
      'instagram_bio',
      'Clinic-friendly scheduling, in teal.',
    ),
    criterion(
      'bi.voice',
      'A consistent voice across channels',
      'partial',
      'instagram_post',
      'New: SMS rebooking is live.',
    ),
    criterion(
      'bi.story',
      'An origin story explains why the brand exists',
      'yes',
      'about',
      'Built by two physios tired of no-shows.',
    ),
  ],
};

const positioning = {
  score: 63,
  coverage: 1,
  reachable: 88,
  rationale: 'Category is clear; the difference from generic booking tools is implied, not stated.',
  criteria: [
    criterion(
      'po.category',
      'Names the category it competes in',
      'yes',
      'homepage',
      'Scheduling built for physiotherapy clinics',
    ),
    criterion(
      'po.alternative',
      'Names the alternative customers use today',
      'partial',
      'about',
      'Most clinics still run on a paper diary.',
    ),
    criterion('po.differentiator', 'States what it does that alternatives cannot', 'no'),
    criterion(
      'po.proof_point',
      'Backs the difference with a proof point',
      'yes',
      'customers',
      '38% fewer no-shows at Northside Physio',
    ),
  ],
};

const messaging = {
  score: 88,
  coverage: 1,
  reachable: 88,
  rationale: 'Headline, pricing and social copy make the same promise.',
  criteria: [
    criterion(
      'mc.headline_promise',
      'Homepage headline makes one promise',
      'yes',
      'homepage',
      'Fill every appointment slot.',
    ),
    criterion(
      'mc.pricing_echo',
      'Pricing page repeats that promise',
      'yes',
      'pricing',
      'Every plan includes automatic rebooking.',
    ),
    criterion(
      'mc.social_echo',
      'Social posts repeat that promise',
      'yes',
      'instagram_post',
      'Empty slots cost clinics more than rent.',
    ),
    criterion(
      'mc.cta',
      'Calls to action use the same verb',
      'partial',
      'homepage',
      'Start filling slots',
    ),
  ],
};

const valueProposition = {
  score: 63,
  coverage: 1,
  reachable: 63,
  rationale: 'The outcome is stated; price-to-value is left for the visitor to work out.',
  criteria: [
    criterion(
      'vp.outcome',
      'States the outcome a customer gets',
      'yes',
      'homepage',
      'Fill every appointment slot.',
    ),
    criterion('vp.for_whom', 'Says who it is for', 'partial', 'homepage', 'for clinics'),
    criterion(
      'vp.mechanism',
      'Explains how the outcome happens',
      'yes',
      'homepage',
      'Patients rebook by text in one tap.',
    ),
    criterion('vp.price_value', 'Connects price to the value delivered', 'no'),
  ],
};

const icp = {
  score: 50,
  coverage: 0.75,
  reachable: 83,
  rationale: 'Clinics are named; size, role and buying trigger are not.',
  criteria: [
    criterion(
      'icp.segment',
      'Names the customer segment',
      'yes',
      'homepage',
      'physiotherapy clinics',
    ),
    criterion('icp.size', 'Sizes the customer it serves best', 'no'),
    criterion(
      'icp.buyer',
      'Names the person who buys',
      'partial',
      'pricing',
      'for practice managers and owners',
    ),
    criterion('icp.trigger', 'Names the moment a customer starts looking', 'unknown'),
  ],
};

const customerPains = {
  score: 63,
  coverage: 1,
  reachable: 63,
  rationale: 'No-shows are named and quantified; admin load is mentioned in passing.',
  criteria: [
    criterion(
      'cp.primary_pain',
      'Names the primary pain in the customer’s words',
      'partial',
      'instagram_post',
      'Empty slots cost clinics more than rent.',
    ),
    criterion(
      'cp.cost',
      'Quantifies what the pain costs',
      'yes',
      'customers',
      '38% fewer no-shows at Northside Physio',
    ),
    criterion('cp.secondary', 'Names a second pain it removes', 'no'),
    criterion(
      'cp.third_party',
      'A third party describes the same pain',
      'yes',
      'search',
      'Our front desk used to spend mornings chasing cancellations.',
      'https://www.g2.com/products/physio-loop/reviews',
    ),
  ],
};

const successMetrics = {
  score: 33,
  coverage: 0.75,
  reachable: 75,
  rationale: 'One case-study number; no metric a buyer could track after signing.',
  criteria: [
    criterion(
      'sm.headline_metric',
      'Leads with one measurable result',
      'yes',
      'customers',
      '38% fewer no-shows',
    ),
    criterion('sm.timeframe', 'Says how quickly results arrive', 'no'),
    criterion('sm.trackable', 'Gives a metric the buyer can track', 'no'),
    criterion('sm.benchmark', 'Compares results against a benchmark', 'unknown'),
  ],
};

const icpFinding: ReadinessFinding = {
  dimension: 'icp_clarity',
  score: 50,
  severity: 'medium',
  headline: 'The clinic you serve best is not sized',
  detail: 'Clinics are named, but not how many practitioners or who signs.',
  recommendation: 'Say "clinics with 3 to 15 physios" and name the practice manager.',
  criterion_ids: ['icp.size', 'icp.buyer'],
  target_field: 'audience.ideal_customer',
  points_gain: 5,
};

const positioningFinding: ReadinessFinding = {
  dimension: 'positioning',
  score: 63,
  severity: 'medium',
  headline: 'The difference from generic booking tools is not stated',
  detail: 'Visitors can tell the category, not why this beats a general scheduler.',
  recommendation: 'Name the one thing a general booking tool cannot do for a clinic.',
  criterion_ids: ['po.differentiator'],
  target_field: 'positioning.differentiator',
  points_gain: 4,
};

export const READINESS_V2: ReadinessAnalysis = {
  overall_score: 64,
  reachable_score: 78,
  scorer_version: 'criteria-v1',
  completeness: 'complete',
  evidence_sources: { homepage: 'ok', subpages: 'ok', instagram: 'ok', search: 'ok' },
  generated_at: '2026-09-24T00:00:00.000Z',
  dimensions: {
    value_proposition: valueProposition,
    icp_clarity: icp,
    customer_pains: customerPains,
    success_metrics: successMetrics,
    positioning,
    messaging_coherence: messaging,
    brand_identity: brandIdentity,
  },
  findings: [
    {
      dimension: 'success_metrics',
      score: 33,
      severity: 'high',
      headline: 'No result a buyer could track after signing',
      detail: 'The only number is one case study; nothing says how fast results arrive.',
      recommendation: 'State the no-show reduction clinics see in their first month.',
      criterion_ids: ['sm.timeframe', 'sm.trackable'],
      target_field: 'strategy.success_metrics',
      points_gain: 6,
    },
    icpFinding,
    positioningFinding,
  ],
};

/** Instagram and search failed: pains are thin, success metrics could not be judged at all. */
export const READINESS_PARTIAL: ReadinessAnalysis = {
  ...READINESS_V2,
  overall_score: 67,
  reachable_score: 81,
  completeness: 'partial',
  evidence_sources: { homepage: 'ok', subpages: 'ok', instagram: 'failed', search: 'failed' },
  dimensions: {
    ...READINESS_V2.dimensions,
    value_proposition: { ...valueProposition, reachable: 88 },
    customer_pains: {
      score: 50,
      coverage: 0.25,
      reachable: 50,
      rationale: 'Only the case study speaks to pains; Instagram and reviews could not be read.',
      criteria: [
        criterion('cp.primary_pain', 'Names the primary pain in the customer’s words', 'unknown'),
        criterion(
          'cp.cost',
          'Quantifies what the pain costs',
          'partial',
          'customers',
          '38% fewer no-shows',
        ),
        criterion('cp.secondary', 'Names a second pain it removes', 'unknown'),
        criterion('cp.third_party', 'A third party describes the same pain', 'unknown'),
      ],
    },
    success_metrics: {
      score: 0,
      coverage: 0,
      reachable: 0,
      rationale: 'No evidence source that could speak to results was readable.',
      criteria: successMetrics.criteria.map((c) => ({
        ...c,
        met: 'unknown' as const,
        quote: null,
        source: null,
        source_url: null,
        verified: false,
      })),
    },
  },
  findings: [
    { ...icpFinding, points_gain: 6 },
    positioningFinding,
    {
      dimension: 'value_proposition',
      score: 63,
      severity: 'medium',
      headline: 'Price is not tied to the value delivered',
      detail: 'Pricing lists plans without saying what a filled slot is worth.',
      recommendation: 'Show what one recovered appointment a week pays back per plan.',
      criterion_ids: ['vp.price_value'],
      target_field: 'business.pricing',
      points_gain: 4,
    },
  ],
};

/** Scored before the criteria scorer: freehand scores, no criteria, no coverage. */
export const READINESS_LEGACY: ReadinessAnalysis = {
  overall_score: 72,
  generated_at: '2026-07-01T00:00:00.000Z',
  findings: [],
  dimensions: {
    value_proposition: { score: 80, rationale: 'Clear offer.' },
    icp_clarity: { score: 70, rationale: 'ICP is named.' },
    customer_pains: { score: 60, rationale: 'Pains are partial.' },
    success_metrics: { score: 55, rationale: 'Outcomes vague.' },
    positioning: { score: 75, rationale: 'Positioning solid.' },
    messaging_coherence: { score: 68, rationale: 'Messaging holds.' },
    brand_identity: { score: 90, rationale: 'Identity crisp.' },
  },
};
