// The cross-side creative taxonomy: ONE vocabulary for hook archetypes, funnel
// stages, and asset types, shared by the brand's own creative labels
// (creative-strategy/paid.ts, creative-strategy/analysis.ts) and competitor ad
// analysis (competitor-spy/analysis.ts). The gap analysis joins the two sides
// on these dimensions, so they must never drift — every consumer re-exports
// from here rather than defining its own copy.
//
// CREATIVE_TAXONOMY_VERSION stamps each label row with the vocabulary it was
// produced under. Bump it when a labeled field's MEANING changes (not for
// additive prompt tweaks); aggregations that depend on the new fields filter
// to rows at or above the version that introduced them.

import { z } from 'zod';

export const creativeHookArchetypeSchema = z.enum([
  'problem_agitation',
  'social_proof',
  'scarcity',
  'curiosity_gap',
  'authority',
  'transformation',
  'value_stack',
  'comparison',
  'unknown',
]);
export type CreativeHookArchetype = z.infer<typeof creativeHookArchetypeSchema>;

export const creativeFunnelStageSchema = z.enum(['tof', 'mof', 'bof', 'unknown']);
export type CreativeFunnelStage = z.infer<typeof creativeFunnelStageSchema>;

export const creativeAssetTypeSchema = z.enum([
  'static_image',
  'video',
  'carousel',
  'catalog',
  'unknown',
]);
export type CreativeAssetType = z.infer<typeof creativeAssetTypeSchema>;

export const ctaStrategySchema = z.enum([
  'direct_purchase',
  'lead_capture',
  'book_appointment',
  'start_trial',
  'learn_more',
  'message_us',
  'download_app',
  'unknown',
]);
export type CtaStrategy = z.infer<typeof ctaStrategySchema>;

export const valuePropStrategySchema = z.enum([
  'save_money',
  'save_time',
  'quality_superiority',
  'outcome_result',
  'ease_of_use',
  'emotional_reassurance',
  'exclusivity_access',
  'unknown',
]);
export type ValuePropStrategy = z.infer<typeof valuePropStrategySchema>;

// Version 2 = angle/funnelStage/assetType exist on competitor ad analysis
// (v1 competitor labels carry hooks/themes only).
// Version 3 = ctaStrategy and valuePropStrategy are labeled dimensions, and the
// free-text `valueProps` list is now read as EVIDENCE for the single labeled
// valuePropStrategy rather than as the value dimension itself — the meaning of
// that field changed, so rows must be filtered by version when aggregating on it.
export const CREATIVE_TAXONOMY_VERSION = 3;

// Prompt fragments embedded VERBATIM by both the own-ad labeler and the
// competitor-ad analyzer, so "angle" and the funnel stages mean the same thing
// on both sides of the gap join. Keep these model-facing strings here — in the
// contract, next to the schemas they populate — not in either backend.
export const ANGLE_FIELD_GUIDANCE =
  'angle: the strategic selling idea / point of view the ad argues — the reason ' +
  'to believe or buy (e.g. "salon results at home", "the switch saves 20 hours a week"). ' +
  'Distinct from the hook, which is the opening line or moment that EXPRESSES the angle. ' +
  'State it as a short reusable phrase, not a full sentence about this specific ad.';

export const FUNNEL_STAGE_GUIDANCE =
  'funnelStage: tof = cold-audience problem/awareness creative (no brand familiarity assumed, ' +
  'broad pain or desire framing); mof = consideration creative (comparison, proof, mechanism, ' +
  'objection handling for people who know the category); bof = conversion creative (offer, ' +
  'urgency, retargeting framing, "back in stock", discounts, testimonials as final push). ' +
  'Use unknown only when the copy and visual genuinely support no reading.';

export const CTA_STRATEGY_GUIDANCE =
  'ctaStrategy: the single action the ad actually asks for, judged from the button and the ' +
  'closing copy together. direct_purchase = buy/shop/order the thing now; lead_capture = hand ' +
  'over contact details (quote, waitlist, newsletter, form, "get pricing"); book_appointment = ' +
  'reserve a specific time slot (call, consult, class, viewing, test drive); start_trial = begin ' +
  'a free or introductory usage period with no immediate purchase; learn_more = read/watch more ' +
  'with no commitment asked; message_us = open a conversation (DM, WhatsApp, chat); ' +
  'download_app = install the app or game. Use unknown only when the creative asks for nothing.';

export const VALUE_PROP_GUIDANCE =
  'valuePropStrategy: the DOMINANT kind of value promised, not every benefit mentioned. ' +
  'save_money = cheaper, better price, cost avoided; save_time = faster, fewer steps, less of ' +
  'your day; quality_superiority = it is simply better made or better performing; ' +
  'outcome_result = a concrete end state achieved (weight lost, leads booked, room finished); ' +
  'ease_of_use = simple, no skill or setup required, works anywhere; emotional_reassurance = ' +
  'safety, confidence, peace of mind, being cared for; exclusivity_access = getting in, being ' +
  'first, members-only, limited to a few. Pick one. Use unknown only when no value is claimed.';
