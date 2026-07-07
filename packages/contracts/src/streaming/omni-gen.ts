// Gemini Omni Flash canvas node — SSE frame contract. The edge function
// (supabase/functions/gemini-omni-flash) streams these as Server-Sent Events;
// the Frontend executeOmniTurn reconstructs { type, data } from each event and
// safeParses against this union (the boundary check). The `interaction` frame
// carries the id the node persists so the next edit turn can thread it as
// previous_interaction_id; the `video` frame carries the durable, re-signable
// storage coordinates of the produced clip.

import { z } from 'zod';
import { omniGenTurnSchema } from '../ai-studio/omni-gen';

const omniStartedFrame = z.object({
  type: z.literal('omni_started'),
  data: z.object({ turn: omniGenTurnSchema }).loose(),
});

const omniProgressFrame = z.object({
  type: z.literal('progress'),
  data: z
    .object({
      pct: z.number().min(0).max(100).optional(),
      phase: z.string().optional(),
    })
    .loose(),
});

const omniInteractionFrame = z.object({
  type: z.literal('interaction'),
  data: z.object({ interactionId: z.string().min(1) }).loose(),
});

const omniVideoFrame = z.object({
  type: z.literal('video'),
  data: z
    .object({
      signedUrl: z.string().min(1),
      storagePath: z.string().min(1),
      bucket: z.string().min(1),
      assetId: z.string().nullable().optional(),
      durationSec: z.number().nullable().optional(),
      interactionId: z.string().min(1).optional(),
      mimeType: z.string().default('video/mp4'),
    })
    .loose(),
});

const omniCompleteFrame = z.object({
  type: z.literal('complete'),
  data: z.object({ interactionId: z.string().min(1).optional() }).loose(),
});

const omniErrorFrame = z.object({
  type: z.literal('error'),
  data: z.object({ message: z.string() }).loose(),
});

export const omniGenStreamFrameSchema = z.discriminatedUnion('type', [
  omniStartedFrame,
  omniProgressFrame,
  omniInteractionFrame,
  omniVideoFrame,
  omniCompleteFrame,
  omniErrorFrame,
]);
export type OmniGenStreamFrame = z.infer<typeof omniGenStreamFrameSchema>;
export type OmniGenFrameType = OmniGenStreamFrame['type'];
