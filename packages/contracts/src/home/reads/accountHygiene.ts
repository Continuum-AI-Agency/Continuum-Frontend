// Two Account Doctor aggregates (H13) over the brand's ACTIVE Meta ads, as of the latest sync:
//
//   naming     active ads, ad sets and campaigns whose names do not parse under the brand's
//              ad-naming convention (brand_profiles.ad_naming_schemas, `parseAdName`). A brand
//              with no convention is not in violation: `namingSchema` is null and the check is
//              `unknown`. A convention that is still the untouched platform default
//              (`adopted: false`) is reported, but `unknown` too — nobody chose it.
//   stale_ads  active ads older than HOME_STALE_AD_DAYS. Meta's created_time is not stored, so
//              age counts from when Continuum first saw the ad: a lower bound of the real age.
//
// The Frontend composes the health score; each check here only says what it found.
//
// Served by the Backend at HOME_READ_PATHS.accountHygiene: GET ?brandId=.

import { z } from 'zod';
import { homeReadEnvelopeSchema, homeReadSourceSchema } from './envelope';

export const HOME_STALE_AD_DAYS = 30;
export const HOME_HYGIENE_MAX_EXAMPLES = 10;

export const homeHygieneCheckIdSchema = z.enum(['naming', 'stale_ads']);
export type HomeHygieneCheckId = z.infer<typeof homeHygieneCheckIdSchema>;

export const homeHygieneStatusSchema = z.enum(['ok', 'warn', 'fail', 'unknown']);
export type HomeHygieneStatus = z.infer<typeof homeHygieneStatusSchema>;

export const homeHygieneLevelSchema = z.enum(['ad', 'adset', 'campaign']);
export type HomeHygieneLevel = z.infer<typeof homeHygieneLevelSchema>;

/**
 * - wrong_segment_count: the name splits into a different number of parts than the convention has.
 * - empty_segment: the parts line up but one of them is blank.
 * - running_too_long: an active ad first seen more than HOME_STALE_AD_DAYS ago.
 */
export const homeHygieneExampleCodeSchema = z.enum([
  'wrong_segment_count',
  'empty_segment',
  'running_too_long',
]);
export type HomeHygieneExampleCode = z.infer<typeof homeHygieneExampleCodeSchema>;

export const homeHygieneExampleSchema = z.object({
  level: homeHygieneLevelSchema,
  id: z.string().min(1),
  name: z.string().nullable(),
  code: homeHygieneExampleCodeSchema,
  /** The Backend's sentence for the example, e.g. 'Splits into 3 parts on "|"; the convention has 5.' */
  detail: z.string().min(1),
  /** Days since first seen (stale ads only). */
  ageDays: z.number().int().nonnegative().nullable(),
  /** The ad's share of its currency's 30-day spend (stale ads only), when the sync measured it. */
  spendShare: z.number().min(0).max(1).nullable(),
});
export type HomeHygieneExample = z.infer<typeof homeHygieneExampleSchema>;

export const homeHygieneCheckSchema = z
  .object({
    id: homeHygieneCheckIdSchema,
    status: homeHygieneStatusSchema,
    /** How many entities failed the check. */
    count: z.number().int().nonnegative(),
    /** How many entities the check looked at. */
    total: z.number().int().nonnegative(),
    detail: z.string().min(1),
    /** Up to HOME_HYGIENE_MAX_EXAMPLES of the failures, worst first. */
    examples: z.array(homeHygieneExampleSchema).max(HOME_HYGIENE_MAX_EXAMPLES),
    source: homeReadSourceSchema,
  })
  .refine((check) => check.count <= check.total, {
    message: 'A check cannot fail more than it looked at.',
  })
  .refine((check) => check.status !== 'ok' || check.count === 0, {
    message: 'An ok check counts no failures.',
  })
  .refine((check) => check.examples.length <= check.count, {
    message: 'Every example is a counted failure.',
  });
export type HomeHygieneCheck = z.infer<typeof homeHygieneCheckSchema>;

export const homeHygieneNamingSchemaSchema = z.object({
  delimiter: z.string().min(1),
  fields: z.array(z.string().min(1)).min(1),
  version: z.number().int().positive(),
  /** False while the convention is still the platform default nobody set or edited for the brand. */
  adopted: z.boolean(),
});
export type HomeHygieneNamingSchema = z.infer<typeof homeHygieneNamingSchemaSchema>;

export const homeAccountHygieneDataSchema = z.object({
  /** The latest ad sync the checks were read at. */
  asOf: z.string(),
  namingSchema: homeHygieneNamingSchemaSchema.nullable(),
  checks: z.array(homeHygieneCheckSchema),
});
export type HomeAccountHygieneData = z.infer<typeof homeAccountHygieneDataSchema>;

export const homeAccountHygieneReadSchema = homeReadEnvelopeSchema(homeAccountHygieneDataSchema);
export type HomeAccountHygieneRead = z.infer<typeof homeAccountHygieneReadSchema>;
