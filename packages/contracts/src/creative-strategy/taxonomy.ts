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

// Version 2 = angle/funnelStage/assetType exist on competitor ad analysis
// (v1 competitor labels carry hooks/themes only).
export const CREATIVE_TAXONOMY_VERSION = 2;

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
