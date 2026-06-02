// Progressive NDJSON frames for the onboarding finale. Two independent streams:
//   1. Inspirations  — competitor cards populate as organic posts + paid ads are
//      pulled (POST /api/onboarding/inspirations).
//   2. Generation    — the three brand-guided images arrive as each completes
//      (POST /api/onboarding/inspirations/generate).
// Each line is the frame spread with the shared StreamEnvelope (see ndjson.ts +
// envelope.ts). Backend emits via serializeFrame; Frontend reads via parseFrame.

import { z } from "zod";
import {
  competitorInspirationSchema,
  inspirationPostSchema,
  inspirationAdSchema,
  onboardingGeneratedImageSchema,
  generationDirectionSchema,
} from "../onboarding/inspirations";

// --- Inspirations stream --------------------------------------------------

const competitorDiscoveredFrame = z.object({
  type: z.literal("competitor_discovered"),
  data: z
    .object({
      competitorName: z.string().min(1),
      website: z.string().nullable().optional(),
      index: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .loose(),
});

const postPulledFrame = z.object({
  type: z.literal("post_pulled"),
  data: z
    .object({
      competitorName: z.string().min(1),
      post: inspirationPostSchema,
    })
    .loose(),
});

const adPulledFrame = z.object({
  type: z.literal("ad_pulled"),
  data: z
    .object({
      competitorName: z.string().min(1),
      ad: inspirationAdSchema,
    })
    .loose(),
});

const competitorDoneFrame = z.object({
  type: z.literal("competitor_done"),
  data: competitorInspirationSchema,
});

const inspirationsErrorFrame = z.object({
  type: z.literal("error"),
  data: z
    .object({
      message: z.string(),
      competitorName: z.string().nullable().optional(),
    })
    .loose(),
});

const inspirationsCompleteFrame = z.object({
  type: z.literal("complete"),
  data: z.object({ competitorCount: z.number().int().nonnegative() }).loose(),
});

export const onboardingInspirationsStreamFrameSchema = z.discriminatedUnion("type", [
  competitorDiscoveredFrame,
  postPulledFrame,
  adPulledFrame,
  competitorDoneFrame,
  inspirationsErrorFrame,
  inspirationsCompleteFrame,
]);
export type OnboardingInspirationsStreamFrame = z.infer<
  typeof onboardingInspirationsStreamFrameSchema
>;
export type OnboardingInspirationsFrameType =
  OnboardingInspirationsStreamFrame["type"];

// --- Generation stream ----------------------------------------------------

const generationStartedFrame = z.object({
  type: z.literal("generation_started"),
  data: z.object({ total: z.number().int().positive() }).loose(),
});

const imageReadyFrame = z.object({
  type: z.literal("image_ready"),
  data: onboardingGeneratedImageSchema,
});

const generationCompleteFrame = z.object({
  type: z.literal("generation_complete"),
  data: z.object({ imageCount: z.number().int().nonnegative() }).loose(),
});

const generationErrorFrame = z.object({
  type: z.literal("error"),
  data: z
    .object({
      message: z.string(),
      direction: generationDirectionSchema.nullable().optional(),
    })
    .loose(),
});

export const onboardingGenerationStreamFrameSchema = z.discriminatedUnion("type", [
  generationStartedFrame,
  imageReadyFrame,
  generationCompleteFrame,
  generationErrorFrame,
]);
export type OnboardingGenerationStreamFrame = z.infer<
  typeof onboardingGenerationStreamFrameSchema
>;
export type OnboardingGenerationFrameType =
  OnboardingGenerationStreamFrame["type"];
