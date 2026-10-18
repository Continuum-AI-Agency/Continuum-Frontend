import { z } from 'zod';
import {
  JAINA_HYPOTHESES,
  type JainaHypothesis,
  jainaHypothesisSchema,
} from './jaina-question-plan';

/**
 * The hypothesis ledger (jaina-prism PRD §3.3, §3.5, §4). A diagnostic or optimization turn
 * opens every hypothesis a movement in cost per result can have, on the entity that moved,
 * with the window read and its equal-length prior. A bounded worker closes each one:
 * confirmed or rejected with its figure and the datasets it was decided on, or waived with
 * the reason. Evidence is sufficient only when every entry is terminal.
 *
 * Serializable on purpose: it rides the run's shared state, the durable run log and the
 * Frontend's findings, so a verdict is never only in prose.
 */
export const JAINA_HYPOTHESIS_STATUSES = ['open', 'confirmed', 'rejected', 'waived'] as const;
export const jainaHypothesisStatusSchema = z.enum(JAINA_HYPOTHESIS_STATUSES);
export type JainaHypothesisStatus = z.infer<typeof jainaHypothesisStatusSchema>;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const jainaLedgerWindowSchema = z.object({ since: isoDay, until: isoDay });
export type JainaLedgerWindow = z.infer<typeof jainaLedgerWindowSchema>;

export const jainaLedgerEntitySchema = z.object({
  level: z.enum(['account', 'campaign', 'adset', 'ad']),
  id: z.string().nullable(),
  name: z.string().nullable(),
});
export type JainaLedgerEntity = z.infer<typeof jainaLedgerEntitySchema>;

/** A dataset a verdict was decided on, by its registry id and the read that produced it. */
export const jainaEvidenceRefSchema = z.object({
  dataset_id: z.string().min(1),
  tool: z.string().min(1),
});
export type JainaEvidenceRef = z.infer<typeof jainaEvidenceRefSchema>;

export const jainaHypothesisEntrySchema = z
  .object({
    hypothesis: jainaHypothesisSchema,
    entity: jainaLedgerEntitySchema,
    current_window: jainaLedgerWindowSchema,
    prior_window: jainaLedgerWindowSchema,
    status: jainaHypothesisStatusSchema,
    /** One sentence: what the reads showed. Null while open. */
    verdict: z.string().nullable(),
    /** The figures behind the verdict, in both windows ("CPM 41.20 → 55.80 MXN"). */
    figure: z.string().nullable(),
    evidence: z.array(jainaEvidenceRefSchema),
    waiver_reason: z.string().nullable(),
  })
  .superRefine((entry, ctx) => {
    if (entry.status === 'waived' && !entry.waiver_reason?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['waiver_reason'],
        message: 'a waived hypothesis states why it was waived',
      });
    }
    if (entry.status === 'confirmed' || entry.status === 'rejected') {
      if (!entry.figure?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['figure'],
          message: 'a verdict states its figures in both windows',
        });
      }
      if (entry.evidence.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['evidence'],
          message: 'a confirmed or rejected hypothesis names the datasets it was decided on',
        });
      }
      if (!entry.verdict?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['verdict'],
          message: 'a confirmed or rejected hypothesis states its verdict',
        });
      }
    }
  });
export type JainaHypothesisEntry = z.infer<typeof jainaHypothesisEntrySchema>;

export const jainaHypothesisLedgerSchema = z
  .object({
    entries: z.array(jainaHypothesisEntrySchema),
  })
  .superRefine((ledger, ctx) => {
    const keys = ledger.entries.map((entry) =>
      JSON.stringify([
        entry.hypothesis,
        entry.entity.level,
        entry.entity.id,
        entry.current_window,
        entry.prior_window,
      ]),
    );
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: 'custom',
        path: ['entries'],
        message: 'a hypothesis is recorded once per entity and window pair',
      });
  });
export type JainaHypothesisLedger = z.infer<typeof jainaHypothesisLedgerSchema>;

export const jainaAnalysisProgressSchema = z.object({
  kind: z.enum(['notice', 'layer', 'hypothesis', 'drill']),
  id: z.string(),
  status: z.enum(['running', 'completed', 'partial']),
  label: z.string(),
  detail: z.string().optional(),
});
export type JainaAnalysisProgress = z.infer<typeof jainaAnalysisProgressSchema>;

export const isTerminalHypothesis = (entry: Pick<JainaHypothesisEntry, 'status'>): boolean =>
  entry.status !== 'open';

/** Every hypothesis the ledger opened is confirmed, rejected or waived. */
export const ledgerIsTerminal = (ledger: JainaHypothesisLedger): boolean =>
  ledger.entries.every(isTerminalHypothesis);

/** The ledger a turn opens: every hypothesis, open, on one entity and one pair of windows. */
export const openHypothesisLedger = (params: {
  entity: JainaLedgerEntity;
  current_window: JainaLedgerWindow;
  prior_window: JainaLedgerWindow;
  hypotheses?: ReadonlyArray<JainaHypothesis>;
}): JainaHypothesisLedger => ({
  entries: (params.hypotheses ?? JAINA_HYPOTHESES).map((hypothesis) => ({
    hypothesis,
    entity: params.entity,
    current_window: params.current_window,
    prior_window: params.prior_window,
    status: 'open',
    verdict: null,
    figure: null,
    evidence: [],
    waiver_reason: null,
  })),
});

/**
 * One entry closed. The entry is re-validated, so a waiver without its reason or a verdict
 * without its datasets never enters the ledger; the hypothesis is matched on its name and
 * entity, and the rest of the ledger is returned unchanged.
 */
export const closeHypothesis = (
  ledger: JainaHypothesisLedger,
  closed: JainaHypothesisEntry,
): JainaHypothesisLedger => {
  const entry = jainaHypothesisEntrySchema.parse(closed);
  return {
    entries: ledger.entries.map((current) =>
      current.hypothesis === entry.hypothesis &&
      current.entity.level === entry.entity.level &&
      current.entity.id === entry.entity.id &&
      current.current_window.since === entry.current_window.since &&
      current.current_window.until === entry.current_window.until &&
      current.prior_window.since === entry.prior_window.since &&
      current.prior_window.until === entry.prior_window.until
        ? entry
        : current,
    ),
  };
};
