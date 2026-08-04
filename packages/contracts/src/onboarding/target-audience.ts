import { z } from 'zod';

import { coerceStringArray } from './brand-voice';

const AUDIENCE_BULLET_MAX = 420;
const AUDIENCE_BULLETS_MAX = 18;
const AUDIENCE_OTHER_MAX = 12;
const AUDIENCE_SUMMARY_MAX = 1800;
const SEGMENT_BULLET_MAX = 420;
const SEGMENT_CRITERIA_MAX = 330;
const SEGMENT_BULLETS_MAX = 7;

// Models routinely emit list-shaped audience fields as a single delimited string
// (or with extra improvised keys). The strict, coercion-free version of this
// schema was the heaviest structured-generation target in the brand report and
// failed reliably with "No object generated". Mirror brandVoiceSchema: coerce
// stringy lists into bounded arrays and stay `.loose()` so unknown keys are
// stripped rather than rejected. This keeps the schema canonical for both the
// generation (Output.object) side and storage/FE validation.
const bulletArray = (maxItems: number) =>
  z
    .preprocess(
      coerceStringArray({ maxLen: AUDIENCE_BULLET_MAX, maxItems }),
      z.array(z.string().min(1).max(AUDIENCE_BULLET_MAX)).max(maxItems),
    )
    .nullable()
    .optional();

export const audienceJourneyStageEnum = z.enum([
  'awareness',
  'consideration',
  'decision',
  'implementation',
]);
export type AudienceJourneyStage = z.infer<typeof audienceJourneyStageEnum>;

export const audienceSegmentSchema = z
  .object({
    name: z.string().min(2).max(90),
    headline: z.string().max(330).nullable().optional(),
    jtbd: z.string().max(420).nullable().optional(),
    pains_verbatim: z
      .preprocess(
        coerceStringArray({ maxLen: SEGMENT_BULLET_MAX, maxItems: SEGMENT_BULLETS_MAX }),
        z.array(z.string().max(SEGMENT_BULLET_MAX)).max(SEGMENT_BULLETS_MAX),
      )
      .nullable()
      .optional(),
    buying_criteria: z
      .preprocess(
        coerceStringArray({ maxLen: SEGMENT_CRITERIA_MAX, maxItems: SEGMENT_BULLETS_MAX }),
        z.array(z.string().max(SEGMENT_CRITERIA_MAX)).max(SEGMENT_BULLETS_MAX),
      )
      .nullable()
      .optional(),
    objections: z
      .preprocess(
        coerceStringArray({ maxLen: SEGMENT_BULLET_MAX, maxItems: SEGMENT_BULLETS_MAX }),
        z.array(z.string().max(SEGMENT_BULLET_MAX)).max(SEGMENT_BULLETS_MAX),
      )
      .nullable()
      .optional(),
    journey_stage: audienceJourneyStageEnum.nullable().optional(),
    status_quo_loss: z.string().max(420).nullable().optional(),
  })
  .loose();
export type AudienceSegment = z.infer<typeof audienceSegmentSchema>;

export const targetAudienceSchema = z
  .object({
    summary: z.string().max(AUDIENCE_SUMMARY_MAX).nullable().optional(),
    segments: z.array(audienceSegmentSchema).max(3).nullable().optional(),
    demographics: bulletArray(AUDIENCE_BULLETS_MAX),
    psychographics: bulletArray(AUDIENCE_BULLETS_MAX),
    behaviors: bulletArray(AUDIENCE_BULLETS_MAX),
    motivations: bulletArray(AUDIENCE_BULLETS_MAX),
    pain_points: bulletArray(AUDIENCE_BULLETS_MAX),
    goals: bulletArray(AUDIENCE_BULLETS_MAX),
    challenges: bulletArray(AUDIENCE_BULLETS_MAX),
    solutions: bulletArray(AUDIENCE_BULLETS_MAX),
    benefits: bulletArray(AUDIENCE_BULLETS_MAX),
    interests: bulletArray(AUDIENCE_BULLETS_MAX),
    buying_criteria: bulletArray(AUDIENCE_BULLETS_MAX),
    other: bulletArray(AUDIENCE_OTHER_MAX),
  })
  .loose();
export type TargetAudience = z.infer<typeof targetAudienceSchema>;
