// A question Jaina asks back instead of answering — the one turn whose content is a request.
//
// It used to be typed only on the Backend (`core/models.ts`) and crossed the wire as
// `Record<string, unknown>`, with no field for the answers on offer. The Frontend had to find them
// in whichever `survey` block streamed beside the question, and a reloaded conversation, which kept
// neither, showed the question as plain prose with nothing to click.

import { z } from 'zod';

/** The most answers a clarification offers as buttons; past this the question is too open. */
export const JAINA_CLARIFICATION_MAX_CHOICES = 6;

export const jainaClarificationRequestSchema = z.object({
  /** What the reply sends back (`clarification.id` on the chat request) to pair with this question. */
  id: z.string(),
  question: z.string(),
  source_scope: z.string().nullable().default(null),
  source_agent: z.string().nullable().default(null),
  requested_at: z.string(),
  /**
   * The answers offered, in the question's language. Absent when Jaina offers none and the reply
   * is free text — never a placeholder standing in for one.
   */
  choices: z.array(z.string().min(1)).max(JAINA_CLARIFICATION_MAX_CHOICES).optional(),
});
export type JainaClarificationRequest = z.infer<typeof jainaClarificationRequestSchema>;

/**
 * The `data` of a `response.clarification_request` frame, and of the `data-jaina-clarification`
 * part built from it: the text block it was asked in, and the request nested under `clarification`.
 */
export const jainaClarificationFrameDataSchema = z.object({
  item_id: z.string().optional(),
  part_id: z.string().optional(),
  clarification: jainaClarificationRequestSchema,
});
export type JainaClarificationFrameData = z.infer<typeof jainaClarificationFrameDataSchema>;
