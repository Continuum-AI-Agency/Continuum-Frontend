// A compiled optimizer card, delivered INSIDE a Jaina answer.
//
// The cited card (`jaina-card.ts`) is the inline evidence: the transcript draws it from a
// stored read. This is the other object — a self-contained animated document, compiled by
// `accountCardHtml` with no model in the loop, uploaded whole, and shown as a frame.
//
// IT WAS PRODUCED AND DROPPED. The tool compiled the frames, uploaded them and returned ids,
// paths and byte counts — deliberately omitting the signed url — and nothing downstream could
// link or render one. It also lived only in the analysis scope, reachable by a sub-agent and
// never by the orchestrator that writes the answer. Produced, filed, and invisible.
//
// WHAT TRAVELS, AND WHY IT IS NOT A URL. A signed url expires in about an hour and a
// transcript outlives that by months, so a part carrying one would render for a while and
// then break with nothing saying why. The durable bucket and path travel instead, and the
// reader's own surface signs on demand — the same thing every organic planner surface does
// through `signHyperframeComposition`, which caches by pair.
//
// NO FIGURE RIDES HERE EITHER, for a different reason than the cited card. There the payload
// has no field a number could sit in; here the numbers are already baked into a document that
// `cardFigures` compiled from the detector's own output. The model chose WHICH card to show
// and cannot author what it says.

import { z } from 'zod';

import { accountDetectorSchema } from './account-strategy';

/** The `state.delta` variant a compiled frame travels on. Stated once, read by both sides. */
export const JAINA_OPTIMIZER_HYPERFRAME_DELTA_SOURCE = 'optimizer_hyperframe';

/** One compiled card, as filed. */
export const jainaHyperframeSchema = z
  .object({
    /** '<detector>:<scope>' — the candidate this frame was compiled from. */
    candidate_id: z.string().min(1),
    detector: accountDetectorSchema,
    /** Which of the eleven layouts it used. Carried so a reader can be told, not to style. */
    composition: z.string().min(1),
    /** Durable. A signed url would outlive its own validity inside a transcript. */
    bucket: z.string().min(1),
    path: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** One loop, in seconds. The card breathes on this rhythm and then repeats. */
    duration_seconds: z.number().positive(),
  })
  .strict();
export type JainaHyperframe = z.infer<typeof jainaHyperframeSchema>;

/**
 * A set of compiled frames from ONE stored read.
 *
 * Three is the ceiling, the same as a strip and for the same reason: more than three is not
 * an answer, it is the account read.
 */
export const jainaHyperframeSetSchema = z
  .object({
    read_id: z.string().min(1),
    read_day: z.string().nullable().default(null),
    frames: z.array(jainaHyperframeSchema).min(1).max(3),
  })
  .strict();
export type JainaHyperframeSet = z.infer<typeof jainaHyperframeSetSchema>;

/** What a reader is told when a frame's document cannot be fetched. Never a blank box. */
export const HYPERFRAME_UNREACHABLE_NOTE =
  'This card could not be loaded — the figures behind it are still in the account read.';
