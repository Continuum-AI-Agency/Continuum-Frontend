import type {
  ReadinessCriterion,
  ReadinessDimensionKey,
  ReadinessEvidenceSource,
} from './readiness';

/**
 * The readiness scorecard as a table. The model only answers whether each
 * criterion is met, with a quote from the brand's own material or third-party
 * search; the backend turns the answers into scores and the UI renders "what
 * earned this" from the same rows. Changing a row changes what a score means —
 * bump the backend scorer_version with it.
 *
 * Every target_field is a dotted path into BrandReportResult (the brand book),
 * pinned by readiness-criteria.test.ts.
 */

const H: ReadinessEvidenceSource = 'homepage';
const A: ReadinessEvidenceSource = 'about';
const P: ReadinessEvidenceSource = 'pricing';
const C: ReadinessEvidenceSource = 'customers';
const IB: ReadinessEvidenceSource = 'instagram_bio';
const IP: ReadinessEvidenceSource = 'instagram_post';
const S: ReadinessEvidenceSource = 'search';
const M: ReadinessEvidenceSource = 'brand_md';
/** The brand's own material: a claim counts wherever the brand makes it. */
const OWN = [H, A, P, C, IB, IP, M];
/** Own material plus third-party search: proof may come from outside. */
const PROOF = [...OWN, S];

export const READINESS_CRITERIA: readonly ReadinessCriterion[] = [
  // value_proposition
  {
    id: 'vp_outcome',
    dimension: 'value_proposition',
    label:
      "Names a concrete result the customer gets (what changes for them); 'we help you grow' is not one",
    weight: 30,
    sources: OWN,
    target_field: 'structured.strategy.value_proposition',
    unmet_headline: 'The site never says what a customer walks away with',
    rubric: {
      yes: "A sentence states a specific change the customer gets: faster, cheaper, or a result they reach ('get paid in days, not months').",
      partial: "Only a vague benefit is stated ('grow', 'succeed', 'tell your story').",
    },
  },
  {
    id: 'vp_offering',
    dimension: 'value_proposition',
    label: 'Names what is sold (the product, service or category) in plain words',
    weight: 20,
    sources: OWN,
    target_field: 'structured.business.business_description',
    unmet_headline: 'It is not clear what you actually sell',
    rubric: {
      yes: "Plainly names what is sold: a product type, a service or a category ('invoicing software', 'wool running shoes').",
      partial: 'What is sold can only be inferred from context.',
    },
  },
  {
    id: 'vp_mechanism',
    dimension: 'value_proposition',
    label:
      'Explains how it delivers the result: a named feature, method or process, not a generic promise',
    weight: 20,
    sources: OWN,
    target_field: 'structured.business.business_features',
    unmet_headline: "How it works is left to the visitor's imagination",
    rubric: {
      yes: "Names or concretely describes a specific feature, method or process ('sends the invoice the moment the file is approved').",
      partial:
        "Mentions features only generically ('powerful tools', 'from strategy to execution').",
    },
  },
  {
    id: 'vp_specific_benefits',
    dimension: 'value_proposition',
    label: 'Lists specific benefits rather than generic superlatives (best, easy, powerful)',
    weight: 15,
    sources: OWN,
    target_field: 'structured.business.business_benefits',
    unmet_headline: 'Benefits read as generic superlatives',
    rubric: {
      yes: 'At least two benefits are specific enough to check: a material, a speed, a guarantee or a named capability.',
      partial: 'Exactly one benefit is specific; the rest are superlatives.',
    },
  },
  {
    id: 'vp_one_line',
    dimension: 'value_proposition',
    label:
      'One plain sentence says what it sells and who it is for (a slogan alone does not count)',
    weight: 15,
    sources: OWN,
    target_field: 'structured.website.hero_statement',
    unmet_headline: 'There is no one-line summary of the offer',
    rubric: {
      yes: 'A single sentence names both what it offers and who it is for.',
      partial: 'A single sentence names what it offers, but not who it is for.',
    },
  },

  // icp_clarity
  {
    id: 'icp_named_customer',
    dimension: 'icp_clarity',
    label: "Names a specific customer (a role, business type or life situation), not 'everyone'",
    weight: 30,
    sources: OWN,
    target_field: 'structured.strategy.positioning.target_customer',
    unmet_headline: 'No specific customer is named',
    rubric: {
      yes: "Names a specific customer type: a role, a business type or a life situation ('freelance designers', 'product teams').",
      partial: "Names only a broad group ('businesses', 'people who care').",
    },
  },
  {
    id: 'icp_use_case',
    dimension: 'icp_clarity',
    label:
      'Describes a specific moment or task in which the customer needs it, not only who they are',
    weight: 20,
    sources: OWN,
    target_field: 'structured.target_audience.segments',
    unmet_headline: 'The moment a customer needs this is never described',
    rubric: {
      yes: "Describes a specific moment, task or trigger in which the customer needs it ('when a client pays late').",
      partial: 'Describes a general activity with no moment or trigger.',
    },
  },
  {
    id: 'icp_qualifiers',
    dimension: 'icp_clarity',
    label: 'Uses qualifiers that rule someone out (size, industry, stage, skill, lifestyle)',
    weight: 20,
    sources: OWN,
    target_field: 'structured.target_audience.demographics',
    unmet_headline: 'Nothing tells a visitor this is not for them',
    rubric: {
      yes: "States who it is for in words that exclude others: size, industry, stage, skill, place, or 'not for ...'.",
      partial: null,
    },
  },
  {
    id: 'icp_self_select',
    dimension: 'icp_clarity',
    label: 'Offers paths, plans or pages by audience so a visitor can self-identify',
    weight: 15,
    sources: OWN,
    target_field: 'structured.target_audience.segments',
    unmet_headline: 'Visitors cannot find the path meant for them',
    rubric: {
      yes: "Offers separate plans, paths or pages named by audience ('for teams', 'for enterprise'). Shop departments (men, women, kids) do not count.",
      partial: null,
    },
  },
  {
    id: 'icp_customer_match',
    dimension: 'icp_clarity',
    label: 'Names real customers (companies, people or logos) who match the target',
    weight: 15,
    sources: PROOF,
    target_field: 'structured.target_audience.summary',
    unmet_headline: 'No existing customer shows who this is for',
    rubric: {
      yes: 'Names at least one real customer, client, partner or supporter: a company or a person.',
      partial: null,
    },
  },

  // customer_pains
  {
    id: 'pain_problem',
    dimension: 'customer_pains',
    label: 'Names the problem the customer has before they buy',
    weight: 30,
    sources: OWN,
    target_field: 'structured.target_audience.pain_points',
    unmet_headline: "The customer's problem is never named",
    rubric: {
      yes: 'A sentence names the problem the customer has before buying: what goes wrong without it.',
      partial: 'The problem is only implied by a benefit.',
    },
  },
  {
    id: 'pain_cost',
    dimension: 'customer_pains',
    label: 'States what the problem costs today (time, money, risk or frustration)',
    weight: 25,
    sources: OWN,
    target_field: 'structured.target_audience.challenges',
    unmet_headline: 'The cost of doing nothing is left unsaid',
    rubric: {
      yes: 'States what the problem costs in time, money, risk or a named frustration.',
      partial: "Mentions the cost only vaguely ('hassle', 'stress').",
    },
  },
  {
    id: 'pain_customer_words',
    dimension: 'customer_pains',
    label: 'Quotes a customer describing the problem in their own words',
    weight: 20,
    sources: PROOF,
    target_field: 'structured.target_audience.segments',
    unmet_headline: 'No customer describes the problem in their own words',
    rubric: {
      yes: 'A customer, reviewer or user is quoted describing the problem or their life before the product.',
      partial: null,
    },
  },
  {
    id: 'pain_alternative',
    dimension: 'customer_pains',
    label: 'Names what customers use or do instead today (a rival, a workaround, doing nothing)',
    weight: 25,
    sources: OWN,
    target_field: 'structured.business.competitor_names',
    unmet_headline: 'The alternative customers use today is never named',
    rubric: {
      yes: "Names what customers use or do instead: a rival, a workaround, or doing nothing ('spreadsheets', 'Jira').",
      partial: "Refers to alternatives without naming them ('other tools', 'the old way').",
    },
  },

  // success_metrics
  {
    id: 'sm_quantified',
    dimension: 'success_metrics',
    label: 'States a number for a result or impact (time saved, projects funded, customers served)',
    weight: 30,
    sources: PROOF,
    target_field: 'structured.strategy.message_pillars',
    unmet_headline: 'No result is quantified',
    rubric: {
      yes: 'A number for a customer result or impact: time saved, projects funded, customers served. Prices, plans, trials, valuations and funding do not count.',
      partial: null,
    },
  },
  {
    id: 'sm_attributed',
    dimension: 'success_metrics',
    label: 'Attributes a result to a named customer, case study or independent review',
    weight: 25,
    sources: PROOF,
    target_field: 'structured.strategy.positioning.reason_to_believe',
    unmet_headline: 'Proof is not attributed to anyone',
    rubric: {
      yes: 'Ties customer praise or a result to a named customer, a case study, or an independent review. A review on a review site counts: its URL names the site.',
      partial: null,
    },
  },
  {
    id: 'sm_buyer_kpi',
    dimension: 'success_metrics',
    label: 'Names a measure the buyer judges success by (revenue, time saved, cost, impact)',
    weight: 20,
    sources: PROOF,
    target_field: 'structured.business.business_benefits',
    unmet_headline: 'The measure a buyer judges success by is never named',
    rubric: {
      yes: 'Names a measure the buyer judges success by: revenue, time saved, cost, conversion, people helped.',
      partial: null,
    },
  },
  {
    id: 'sm_time_bound',
    dimension: 'success_metrics',
    label: 'Ties a result to a timeframe (per week, in 30 days, since 2015)',
    weight: 15,
    sources: PROOF,
    target_field: 'structured.strategy.promise.headline',
    unmet_headline: 'Results are never tied to a timeframe',
    rubric: {
      yes: "Ties a customer result to a timeframe ('paid in 9 days', 'since 2006'). A billing period or a trial length is not a result.",
      partial: null,
    },
  },
  {
    id: 'sm_pricing',
    dimension: 'success_metrics',
    label: 'States pricing or what it costs to get started',
    weight: 10,
    sources: PROOF,
    target_field: 'deep.product.product_pricing',
    unmet_headline: 'What it costs to start is not stated',
    rubric: {
      yes: 'States the price of the product or service, a price range, or what it costs to start (free counts). Shipping costs and discounts do not count.',
      partial: null,
    },
  },

  // positioning
  {
    id: 'pos_category',
    dimension: 'positioning',
    label: 'Claims a clear market category a buyer would search for',
    weight: 20,
    sources: PROOF,
    target_field: 'structured.strategy.positioning.market_category',
    unmet_headline: 'The market category is not claimed',
    rubric: {
      yes: "Names the market category it competes in, as a buyer would search for it ('issue tracker', 'running shoes').",
      partial: 'The category can only be inferred.',
    },
  },
  {
    id: 'pos_differentiator',
    dimension: 'positioning',
    label: 'States what makes it different from the alternatives',
    weight: 30,
    sources: OWN,
    target_field: 'structured.strategy.positioning.key_differentiator',
    unmet_headline: 'Nothing says why this over the alternatives',
    rubric: {
      yes: "Says explicitly what makes it different from or better than alternatives ('the only ...', 'unlike ...', 'built for ...').",
      partial: 'Describes a distinctive quality without any contrast.',
    },
  },
  {
    id: 'pos_competitor_frame',
    dimension: 'positioning',
    label: 'Names or clearly implies the competitor or approach it beats',
    weight: 20,
    sources: OWN,
    target_field: 'structured.business.differentiators',
    unmet_headline: 'The competition is never framed',
    rubric: {
      yes: "Names a competitor, an incumbent or the old way it replaces ('unlike spreadsheets', 'left Jira').",
      partial: "Contrasts with an unnamed alternative ('other tools', 'traditional charities').",
    },
  },
  {
    id: 'pos_reason_to_believe',
    dimension: 'positioning',
    label:
      'Backs its difference with proof: technology, process, credentials, track record or awards',
    weight: 30,
    sources: PROOF,
    target_field: 'structured.strategy.positioning.reason_to_believe',
    unmet_headline: 'The difference is claimed but never backed',
    rubric: {
      yes: 'Backs a claim with concrete proof: a named technology or process, credentials, years in business, a rating or an award.',
      partial: "Asserts proof with no concrete detail ('trusted', 'award-winning').",
    },
  },

  // messaging_coherence
  {
    id: 'msg_core_promise',
    dimension: 'messaging_coherence',
    label: "The homepage's main promise is restated on another page or in the Instagram bio",
    weight: 30,
    sources: [A, P, C, IB, IP, M],
    target_field: 'structured.strategy.promise.headline',
    unmet_headline: 'The core promise changes from page to page',
    rubric: {
      yes: "Another page's own copy, or the Instagram bio, repeats a key phrase of the homepage headline. A new line on a similar theme, or shared titles and meta, do not count.",
      partial: null,
    },
  },
  {
    id: 'msg_themes',
    dimension: 'messaging_coherence',
    label: 'The same theme recurs across at least two documents, not a scatter of unrelated claims',
    weight: 25,
    sources: OWN,
    target_field: 'structured.strategy.message_pillars',
    unmet_headline: 'Messages scatter instead of building a few themes',
    rubric: {
      yes: 'The same theme (a benefit or idea) recurs in the copy of two different documents. Text every page shares (titles, meta, banners) does not count.',
      partial: null,
    },
  },
  {
    id: 'msg_primary_cta',
    dimension: 'messaging_coherence',
    label: 'Asks the visitor to take a clear next step (sign up, shop, donate, book, start free)',
    weight: 20,
    sources: OWN,
    target_field: 'structured.business.alt_ctas',
    unmet_headline: 'There is no single clear next step',
    rubric: {
      yes: 'A call to action asks the visitor to act: sign up, shop, donate, book, start free.',
      partial: null,
    },
  },
  {
    id: 'msg_social_echo',
    dimension: 'messaging_coherence',
    label: "The Instagram bio or posts echo the website's core promise",
    weight: 25,
    sources: [IB, IP, M],
    target_field: 'brand_profile.brand_voice.key_messaging',
    unmet_headline: 'Social and site tell different stories',
    rubric: {
      yes: "The Instagram bio or a post repeats a key phrase of the website's headline or tagline. A new line on a similar theme does not count.",
      partial: null,
    },
  },

  // brand_identity
  {
    id: 'id_mission',
    dimension: 'brand_identity',
    label:
      'States a purpose beyond selling (a mission, cause or belief about the world), not a work ethic',
    weight: 30,
    sources: PROOF,
    target_field: 'brand_profile.brand_voice.mission',
    unmet_headline: 'No purpose beyond the product is stated',
    rubric: {
      yes: "An explicit purpose beyond selling: 'our mission is', 'we exist to', 'we believe', 'we're committed to', 'we're in business to'.",
      partial: 'A purpose is only implied by a tagline or by values.',
    },
  },
  {
    id: 'id_voice',
    dimension: 'brand_identity',
    label:
      'Uses wording no generic competitor would: a coined term, running joke or signature phrase',
    weight: 25,
    sources: PROOF,
    target_field: 'brand_profile.brand_voice.tone',
    unmet_headline: 'The copy has no recognisable voice',
    rubric: {
      yes: 'A term the brand coined: a named program, mascot or catchphrase it repeats. Taglines, product descriptions and tone of voice do not count.',
      partial: null,
    },
  },
  {
    id: 'id_values_in_action',
    dimension: 'brand_identity',
    label: 'Shows values in action (commitments, initiatives, policies), not just value words',
    weight: 20,
    sources: PROOF,
    target_field: 'brand_profile.brand_voice.core_values',
    unmet_headline: 'Values are claimed but never shown',
    rubric: {
      yes: 'Describes a specific commitment, program or policy with a concrete detail: a name, a number or a date.',
      partial: 'States values or causes without a concrete action.',
    },
  },
  {
    id: 'id_origin',
    dimension: 'brand_identity',
    label: 'Tells where it came from: who founded it, when, or why',
    weight: 15,
    sources: PROOF,
    target_field: 'structured.strategy.promise.rationale',
    unmet_headline: 'The brand never tells its origin story',
    rubric: {
      yes: 'Says who founded it, when, or why it started: a founder, a year or a founding story.',
      partial: null,
    },
  },
  {
    id: 'id_signature_line',
    dimension: 'brand_identity',
    label: 'Has a short tagline or slogan (under 10 words) distinct from a product description',
    weight: 10,
    sources: OWN,
    target_field: 'structured.strategy.taglines.primary',
    unmet_headline: 'There is no memorable signature line',
    rubric: {
      yes: 'Has a tagline or slogan under 10 words that is not just a product description.',
      partial: null,
    },
  },
];

/** Each dimension's share of the overall score; sums to 100. */
export const READINESS_DIMENSION_WEIGHTS: Readonly<Record<ReadinessDimensionKey, number>> = {
  value_proposition: 18,
  icp_clarity: 16,
  customer_pains: 14,
  success_metrics: 14,
  positioning: 14,
  messaging_coherence: 12,
  brand_identity: 12,
};

export function readinessCriteriaFor(dimension: ReadinessDimensionKey): ReadinessCriterion[] {
  return READINESS_CRITERIA.filter((c) => c.dimension === dimension);
}

/**
 * The overall score as a function of the dimensions: the weighted mean over
 * dimensions that had evidence (coverage > 0, or no coverage field on legacy
 * rows). A dimension nothing could be assessed on is left out, never read as 0.
 */
export function readinessOverall(
  dimensions: Readonly<Record<ReadinessDimensionKey, { score: number; coverage?: number }>>,
): number {
  let weighted = 0;
  let weight = 0;
  for (const [key, w] of Object.entries(READINESS_DIMENSION_WEIGHTS) as [
    ReadinessDimensionKey,
    number,
  ][]) {
    const dimension = dimensions[key];
    if (dimension.coverage !== undefined && dimension.coverage <= 0) continue;
    weighted += w * dimension.score;
    weight += w;
  }
  return weight === 0 ? 0 : Math.round(weighted / weight);
}
