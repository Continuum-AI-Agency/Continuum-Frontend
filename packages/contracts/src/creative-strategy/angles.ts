// The GLOBAL angle vocabulary: a CLOSED, VERSIONED list of strategic selling
// angles shared by every surface that labels, proposes, or aggregates creative
// angles (paid creative labeling, competitor gap analysis, the angle-synthesis
// worker, brand-angle backfill).
//
// Two properties are load-bearing:
//   1. CLOSED — a labeler or worker can only ever emit a member of this enum.
//      An off-list value is a HARD REJECT, never a silent coerce.
//   2. VERSIONED — ANGLE_VOCAB_VERSION stamps every row produced under it, so a
//      later vocabulary revision does not retroactively re-interpret old rows.
//      Bump it whenever a member is added, removed, or its DEFINITION changes.
//
// GLOBAL_ANGLE_DEFINITIONS is not decoration: those sentences are the text that
// gets embedded for nearest-neighbour backfill of free-text brand angles onto
// this enum. They must be discriminative enough that two neighbouring angles
// (e.g. risk_reversal_trial vs risk_reversal_guarantee) never collapse.

import { z } from 'zod';

export const ANGLE_VOCAB_VERSION = 1;

// DECISION PENDING(D-ANGLEENUM): the exact 29-entry list is a design conversation; that it is CLOSED and VERSIONED is the load-bearing property. See handoff §5.
export const globalAngleIdSchema = z.enum([
  'offer_discount',
  'offer_bundle',
  'risk_reversal_trial',
  'risk_reversal_guarantee',
  'time_scarcity',
  'stock_scarcity',
  'social_proof_volume',
  'social_proof_peer',
  'authority_expert',
  'authority_credential',
  'transformation_before_after',
  'transformation_aspiration',
  'mechanism_how_it_works',
  'mechanism_ingredient',
  'problem_agitation',
  'cost_of_inaction',
  'objection_handling',
  'comparison_alternative',
  'comparison_competitor',
  'convenience_time',
  'convenience_access',
  'identity_belonging',
  'identity_status',
  'value_stack',
  'price_transparency',
  'seasonal_occasion',
  'launch_newness',
  'local_proximity',
  'unknown',
]);
export type GlobalAngleId = z.infer<typeof globalAngleIdSchema>;

/** The size of the closed vocabulary. Asserted in tests so the enum cannot silently drift. */
export const GLOBAL_ANGLE_COUNT = 29;

/** Short human-facing names. Never used for matching — GLOBAL_ANGLE_DEFINITIONS is. */
export const GLOBAL_ANGLE_LABELS: Record<GlobalAngleId, string> = {
  offer_discount: 'Discount offer',
  offer_bundle: 'Bundle offer',
  risk_reversal_trial: 'Try before you commit',
  risk_reversal_guarantee: 'Money-back guarantee',
  time_scarcity: 'Deadline urgency',
  stock_scarcity: 'Limited availability',
  social_proof_volume: 'Proof by numbers',
  social_proof_peer: 'Proof by someone like you',
  authority_expert: 'Expert endorsement',
  authority_credential: 'Institutional credential',
  transformation_before_after: 'Documented before and after',
  transformation_aspiration: 'The life on the other side',
  mechanism_how_it_works: 'How it works',
  mechanism_ingredient: 'The key ingredient',
  problem_agitation: 'Name the pain',
  cost_of_inaction: 'Cost of doing nothing',
  objection_handling: 'Answer the hesitation',
  comparison_alternative: 'Versus the old way',
  comparison_competitor: 'Versus a named rival',
  convenience_time: 'Saves time',
  convenience_access: 'Easy to get',
  identity_belonging: 'People like you',
  identity_status: 'Status and prestige',
  value_stack: 'Everything you get',
  price_transparency: 'Honest, predictable pricing',
  seasonal_occasion: 'Seasonal moment',
  launch_newness: 'New and just released',
  local_proximity: 'Right near you',
  unknown: 'Unassigned',
};

/**
 * One discriminative sentence per angle. These are embedded for nearest-neighbour
 * backfill, so each sentence must state the DECIDING distinction against its closest
 * neighbours, not merely restate the label.
 */
export const GLOBAL_ANGLE_DEFINITIONS: Record<GlobalAngleId, string> = {
  offer_discount:
    'Argues on a reduced price for the same thing — percent or currency off, sale pricing, promo codes, "was X now Y" — where the persuasion is the price cut itself, not the quantity of goods or the fairness of the pricing model.',
  offer_bundle:
    'Argues that several products, services, or sessions packaged together for one combined price is the reason to buy, where the persuasion is getting MORE items in one purchase rather than a lower price on a single item.',
  risk_reversal_trial:
    'Lowers the barrier to ENTRY by inviting someone to experience the product or facility before committing any money or contract — free trial, trial pass, day pass, first class or session free, sample, demo, tour, test drive, "try it and see"; the risk is removed BEFORE purchase, not refunded after one.',
  risk_reversal_guarantee:
    'Removes risk AFTER a purchase has been made by promising the money back or the commitment undone — money-back guarantee, full refund window, warranty, "cancel anytime", "no questions asked returns"; the buyer pays first and is protected afterwards.',
  time_scarcity:
    'Presses on a DEADLINE — offer ends Friday, last day, 24 hours left, closes at midnight — where the pressure comes from time running out rather than from units running out.',
  stock_scarcity:
    'Presses on LIMITED QUANTITY or capacity — only 12 left, 3 spots remaining, nearly sold out, waitlist forming — where the pressure comes from supply running out rather than from a clock.',
  social_proof_volume:
    'Proves value with CROWD SCALE — number of customers, units sold, five-star review counts, "joined by 40,000 members" — persuasion by aggregate numbers rather than by any one named person.',
  social_proof_peer:
    'Proves value through ONE relatable person telling their own story — customer testimonial, user-generated review, "I was skeptical until…" — persuasion by identification with a specific ordinary user, not by counts and not by expert credentials.',
  authority_expert:
    'Borrows credibility from a recognized PERSON with expertise or fame — doctor, trainer, dermatologist, chef, celebrity, founder-as-expert — who endorses, demonstrates, or explains the product.',
  authority_credential:
    'Borrows credibility from an INSTITUTION or formal record rather than a person — clinical study, certification, patent, award, regulatory approval, "as featured in" press logos, ratings body.',
  transformation_before_after:
    'Shows a DOCUMENTED change from a stated starting state to a stated result — before and after photos, week-one versus week-twelve, "I went from X to Y" — the persuasion depends on the prior state being shown or named.',
  transformation_aspiration:
    'Paints the desirable future state, identity, or feeling on the other side of purchase without documenting where the person started — "become the person who…", the imagined better day.',
  mechanism_how_it_works:
    'Explains the PROCESS or technology by which the product produces its result — the steps, the system, the science of the method — answering "why does this work?" at the level of mechanism rather than naming a single component.',
  mechanism_ingredient:
    'Attributes the result to a specific named COMPONENT — an active ingredient, material, chip, fabric, strain, or proprietary compound — where the single element is the reason to believe.',
  problem_agitation:
    'Dwells on the pain, frustration, or embarrassment of the current situation to make it feel intolerable, before or instead of presenting the fix; the persuasion is felt discomfort about the present.',
  cost_of_inaction:
    'Quantifies or dramatizes what continuing to do nothing COSTS over time — money wasted, hours lost, damage compounding, opportunity forfeited; the persuasion is the accruing price of delay rather than present-tense discomfort.',
  objection_handling:
    'Names a specific hesitation the audience is known to hold — too expensive, too complicated, "I tried something like this before", no time — and answers it head on.',
  comparison_alternative:
    'Contrasts the product with a generic alternative approach or the status quo — doing it yourself, the old way, the whole category it replaces — without naming a rival brand.',
  comparison_competitor:
    'Contrasts the product against a NAMED rival brand or product, explicitly or through unmistakable reference, on price, features, or results.',
  convenience_time:
    'Sells SPEED or reduced effort in minutes — ready in five minutes, ten minutes a day, cuts the job in half — where the benefit is how little time it takes.',
  convenience_access:
    'Sells EASE OF ACCESS rather than speed — delivered to your door, available online, no appointment needed, works on any device, open 24/7, no equipment required.',
  identity_belonging:
    'Invites the viewer into a group of people like them — a community, a movement, a shared trait or life stage — where the pull is fitting IN and being understood.',
  identity_status:
    'Positions the product as a marker of standing, taste, or being ahead — premium, insider, professional-grade, what serious people use — where the pull is standing OUT or above.',
  value_stack:
    'Enumerates everything included so the total feels larger than the price — "plus the app, plus coaching, plus the guide" — persuasion by accumulating listed inclusions WITHOUT reducing the price.',
  price_transparency:
    'Makes the cost plain and predictable as the selling point — flat rate, no hidden fees, no contract, exact price shown, cancel-free pricing — where the persuasion is honesty about the pricing model, not the size of the discount.',
  seasonal_occasion:
    'Anchors relevance to a moment on the calendar — a holiday, back-to-school, New Year, wedding season, a sporting event, weather turning — that supplies the reason to act now.',
  launch_newness:
    'Sells the fact that something is NEW — just launched, new formula, newly available here, latest version, first of its kind — where novelty itself is the reason to look.',
  local_proximity:
    'Sells physical nearness or local relevance — in your city, minutes from you, neighborhood named, "now open near you" — where geography is the reason it applies to the viewer.',
  unknown:
    'Explicit non-assignment: the available evidence does not support any angle above. Never a default or a tie-breaker — use it only when a reading would be invented.',
};
