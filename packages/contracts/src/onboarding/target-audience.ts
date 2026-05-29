import { z } from "zod";

const audienceBullet = z.string().min(1).max(420);
const AUDIENCE_BULLETS_MAX = 18;
const AUDIENCE_OTHER_MAX = 12;
const AUDIENCE_SUMMARY_MAX = 1800;

export const audienceJourneyStageEnum = z.enum([
  "awareness",
  "consideration",
  "decision",
  "implementation",
]);
export type AudienceJourneyStage = z.infer<typeof audienceJourneyStageEnum>;

export const audienceSegmentSchema = z
  .object({
    name: z.string().min(2).max(90),
    headline: z.string().max(330).nullable().optional(),
    jtbd: z.string().max(420).nullable().optional(),
    pains_verbatim: z.array(z.string().max(420)).max(7).nullable().optional(),
    buying_criteria: z.array(z.string().max(330)).max(7).nullable().optional(),
    objections: z.array(z.string().max(420)).max(7).nullable().optional(),
    journey_stage: audienceJourneyStageEnum.nullable().optional(),
    status_quo_loss: z.string().max(420).nullable().optional(),
  })
  .strict();
export type AudienceSegment = z.infer<typeof audienceSegmentSchema>;

export const targetAudienceSchema = z
  .object({
    summary: z.string().max(AUDIENCE_SUMMARY_MAX).nullable().optional(),
    segments: z.array(audienceSegmentSchema).max(3).nullable().optional(),
    demographics: z.array(audienceBullet).max(AUDIENCE_BULLETS_MAX).nullable().optional(),
    psychographics: z.array(audienceBullet).max(AUDIENCE_BULLETS_MAX).nullable().optional(),
    behaviors: z.array(audienceBullet).max(AUDIENCE_BULLETS_MAX).nullable().optional(),
    motivations: z.array(audienceBullet).max(AUDIENCE_BULLETS_MAX).nullable().optional(),
    pain_points: z.array(audienceBullet).max(AUDIENCE_BULLETS_MAX).nullable().optional(),
    goals: z.array(audienceBullet).max(AUDIENCE_BULLETS_MAX).nullable().optional(),
    challenges: z.array(audienceBullet).max(AUDIENCE_BULLETS_MAX).nullable().optional(),
    solutions: z.array(audienceBullet).max(AUDIENCE_BULLETS_MAX).nullable().optional(),
    benefits: z.array(audienceBullet).max(AUDIENCE_BULLETS_MAX).nullable().optional(),
    interests: z.array(audienceBullet).max(AUDIENCE_BULLETS_MAX).nullable().optional(),
    buying_criteria: z.array(audienceBullet).max(AUDIENCE_BULLETS_MAX).nullable().optional(),
    other: z.array(audienceBullet).max(AUDIENCE_OTHER_MAX).nullable().optional(),
  })
  .strict();
export type TargetAudience = z.infer<typeof targetAudienceSchema>;
