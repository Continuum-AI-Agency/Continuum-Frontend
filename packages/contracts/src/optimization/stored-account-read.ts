// What `public.optimizer_get_account_read` answers with.
//
// Four hand-rolled copies of this envelope existed: the Backend's own doc type, the Jaina
// tool client, the Frontend's dashboard query and the Frontend's citation resolver. Only the
// leaf `accountCandidateSchema` came from the contract, so the envelope drifted exactly the
// way root AGENTS.md §4 says it will — `assumptions` was added to the producer and to ONE
// consumer, in two commits in two repositories, and two copies never learned about it. The
// Jaina copy also declared `read` NON-nullable and parsed strictly, so a row that is `ready`
// with a null read threw inside the tool instead of answering "no read yet".
//
// The Jaina copy justified itself with "the shape never crosses to the Frontend". A cited
// optimizer card crosses it now.
//
// TOLERANCE IS THE CALLER'S. This schema says what the row IS; how forgiving to be about a
// row whose shape has moved on is a decision each surface makes for itself — the dashboard
// drops unreadable rows one by one so one new detector cannot blank the screen, while the
// Jaina tool would rather refuse than cite something it cannot read.

import { z } from 'zod';

import { accountCandidateSchema } from './account-strategy';

/** The document the worker composes and stores. `.loose()` — new keys must not break a reader. */
export const storedAccountReadDocSchema = z
  .object({
    candidates: z.array(accountCandidateSchema).default([]),
    guards: z.array(accountCandidateSchema).default([]),
    narrative: z.string().default(''),
    lead_candidate_id: z.string().nullable().default(null),
    lead_reason: z.string().nullable().default(null),
    justification_if_not_max: z.string().nullable().default(null),
    conflicts: z.array(z.object({ a: z.string(), b: z.string(), why: z.string() })).default([]),
    starved: z.array(z.object({ detector: z.string(), missing: z.string() })).default([]),
    /** How much of the catalogue applies to what this account buys. */
    deck: z
      .object({
        applies: z.number(),
        total: z.number(),
        muted: z.array(z.string()).default([]),
      })
      .nullable()
      .default(null),
    /** What had to be assumed to measure this account at all. */
    assumptions: z.array(z.string()).default([]),
    /** The family ceilings the candidates were resolved against. */
    ceiling_defaults: z.record(z.string(), z.string()).default({}),
    scale_per_day: z.number().nullable().default(null),
    currency: z.string().nullable().default(null),
    model: z.string().default('deterministic'),
  })
  .loose();

export type StoredAccountReadDoc = z.infer<typeof storedAccountReadDocSchema>;

/**
 * The row the RPC returns.
 *
 * `read` is NULLABLE, and that is not defensive padding: a row is created `queued` and only
 * later carries a document, and `optimizer_complete_account_read_owned` stores
 * `read = coalesce(p_read, read)`. A reader that cannot represent "ready, no document" will
 * throw on a real row.
 */
export const storedAccountReadRowSchema = z
  .object({
    id: z.string().min(1),
    utc_day: z.string().nullable().default(null),
    read: storedAccountReadDocSchema.nullable().default(null),
    model: z.string().nullable().default(null),
    prompt_version: z.string().nullable().default(null),
    ready_at: z.string().nullable().default(null),
  })
  .loose();

export type StoredAccountReadRow = z.infer<typeof storedAccountReadRowSchema>;
