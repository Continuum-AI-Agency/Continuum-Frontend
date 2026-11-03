'use client';

// Whether a card's write landed in this session. The platform card's own dialog runs the write
// through optimizer-apply-actions; this reads that same response back from React Query's
// mutation cache, so the card can say "Applied" beside the dialog's Undo instead of offering the
// approval a second time. An undo that landed afterwards takes the card back to Approve. Both
// responses are parsed here, at the boundary: a shape this does not know reads as "not landed",
// never as a success.

import { useMutationState } from '@tanstack/react-query';
import { z } from 'zod';

const AppliedSchema = z.object({
  variables: z.object({ dryRun: z.literal(false), recommendation_id: z.string() }),
  data: z.object({
    results: z
      .array(
        z.object({
          status: z.string(),
          legs: z.array(z.object({ auditId: z.string().nullable().optional() })).optional(),
        }),
      )
      .min(1),
  }),
});

const RevertedSchema = z.object({
  variables: z.object({ dryRun: z.literal(false), audit_id: z.string() }),
  data: z.object({ result: z.object({ status: z.string() }) }),
});

/** The statuses that mean the platform took the write. */
const LANDED_STATUSES: ReadonlySet<string> = new Set(['applied', 'scheduled']);

export type MutationRecord = { variables: unknown; data: unknown; submittedAt: number };

export type LandedWrite = { auditId: string | null; submittedAt: number };

/** A real write for this recommendation that the platform took, with the audit an undo names. */
export function landedWriteOf(
  record: MutationRecord,
  recommendationId: string,
): LandedWrite | null {
  const parsed = AppliedSchema.safeParse(record);
  if (!parsed.success || parsed.data.variables.recommendation_id !== recommendationId) return null;
  const [first] = parsed.data.data.results;
  if (!first || !LANDED_STATUSES.has(first.status)) return null;
  return { auditId: first.legs?.[0]?.auditId ?? null, submittedAt: record.submittedAt };
}

/** The audit a real undo put back, when it landed. */
export function revertedAuditOf(record: MutationRecord): string | null {
  const parsed = RevertedSchema.safeParse(record);
  if (!parsed.success || parsed.data.data.result.status !== 'reverted') return null;
  return parsed.data.variables.audit_id;
}

/** Whether the latest write that landed for this recommendation still stands. */
export function writeStands(records: readonly MutationRecord[], recommendationId: string): boolean {
  let latest: LandedWrite | null = null;
  for (const record of records) {
    const landed = landedWriteOf(record, recommendationId);
    if (landed && (latest == null || landed.submittedAt >= latest.submittedAt)) latest = landed;
  }
  if (latest == null) return false;
  const { auditId } = latest;
  return auditId == null || !records.some((record) => revertedAuditOf(record) === auditId);
}

export function useWriteLanded(recommendationId: string | null): boolean {
  const records = useMutationState({
    filters: { status: 'success' },
    select: (mutation): MutationRecord => ({
      variables: mutation.state.variables,
      data: mutation.state.data,
      submittedAt: mutation.state.submittedAt,
    }),
  });
  return recommendationId != null && writeStands(records, recommendationId);
}
