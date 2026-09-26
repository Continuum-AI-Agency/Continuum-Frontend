// A compiled optimizer card on the wire.
//
// Unlike a citation, this payload points at a document that was already rendered and filed.
// The figures live in that file. What crosses here is the pointer a reader signs and loads:
// bucket + path, never a signed URL (those expire inside a transcript) and never a number.

import { z } from 'zod';
import { CARD_COMPOSITIONS } from './account-card-html';
import { accountDetectorSchema } from './account-strategy';

/** The `state.delta` source a compiled card travels on. Distinct from `optimizer_card`. */
export const JAINA_OPTIMIZER_HYPERFRAME_DELTA_SOURCE = 'optimizer_hyperframe';

export const jainaHyperframeSchema = z
  .object({
    candidate_id: z.string().min(1),
    detector: accountDetectorSchema,
    composition: z.enum(CARD_COMPOSITIONS),
    bucket: z.string().min(1),
    path: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    duration_seconds: z.number().positive(),
  })
  .strict();

export const jainaHyperframeSetSchema = z
  .object({
    read_id: z.string().min(1),
    read_day: z.string().min(1).nullable(),
    frames: z.array(jainaHyperframeSchema).min(1).max(3),
  })
  .strict();

export type JainaHyperframeSet = z.infer<typeof jainaHyperframeSetSchema>;
