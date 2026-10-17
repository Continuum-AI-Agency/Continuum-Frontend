// A Template Forge run, as the browser sees it.
//
// The forge's own progress model is unusually honest and the honesty is the part that is easy to
// lose in translation, so it is preserved here rather than flattened:
//
//   - `total` and `pct` are NULL until the AEP has been parsed. Nobody knows how many columns an
//     AEP implies until its Essential Graphics have been read. A bar sitting at 0% and a bar that
//     does not know yet are different facts, and showing 0 for both is how a wedged run looks
//     healthy. Render null as indeterminate.
//   - `done` means the run stopped advancing BY ITSELF — which includes `needs_input` and
//     `failed`. It is not a success signal.
//   - `ok` is the success signal: null while working, true finished clean, false failed OR
//     blocked on `needs`.
//
// Three flags, three questions. Collapsing them into one status enum loses the case this whole
// surface exists to show: a run that is not moving, is not finished, and is waiting for a person.

import { z } from 'zod';
import { readableLayerName } from './template-name';

/**
 * One phase of the seven, in work order: analyze · derive · provision · seed · load · build ·
 * validate. A phase with nothing to do is sized 0 rather than marked done, so `pct: 100` always
 * means the work finished and never that a step was quietly skipped.
 */
export const templateForgePhaseSchema = z
  .object({
    name: z.string(),
    total: z.number().int().nonnegative().nullable(),
    done: z.number().int().nonnegative(),
  })
  .strict();
export type TemplateForgePhase = z.infer<typeof templateForgePhaseSchema>;

export const templateForgeProgressSchema = z
  .object({
    total: z.number().int().nonnegative().nullable(),
    done: z.number().int().nonnegative(),
    pct: z.number().int().min(0).max(100).nullable(),
    phase: z.string().nullable(),
    /** The human string for the current phase (`"fields 7/19"`) — what goes beside the bar. */
    detail: z.string().nullable(),
    phases: z.array(templateForgePhaseSchema),
  })
  .strict();
export type TemplateForgeProgress = z.infer<typeof templateForgeProgressSchema>;

/**
 * Something the run could not do, reported instead of failing — a table that exists with one
 * column unresolved is more useful than no table at all. Findings never make a run not-ok.
 *
 * `resolver` names the forge tool that fixes it, or is null. A NULL RESOLVER IS THE BACKLOG: it
 * marks a class of problem that still needs code written for it, and surfacing that distinction
 * is the point — "we can fix this for you" and "nobody can fix this yet" are different answers.
 */
export const templateForgeFindingSchema = z
  .object({
    code: z.string(),
    what: z.string().optional(),
    why: z.string().optional(),
    resolver: z.string().nullable().optional(),
  })
  // Loose on purpose: this is a mirror of a shape the forge owns and extends. A finding carrying
  // one new field must not fail the whole run's ingestion — it is display data, and dropping the
  // run to show it is a worse trade than showing an extra key.
  .passthrough();
export type TemplateForgeFinding = z.infer<typeof templateForgeFindingSchema>;

/** A slot nothing could bind. Present only at `needs_input`; cleared by a decision. */
export const templateForgeNeedSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    comp: z.string().optional(),
    slot: z
      .object({
        stableKey: z.string(),
        type: z.string().optional(),
        label: z.string().optional(),
      })
      .passthrough()
      .optional(),
    reason: z.string().optional(),
    options: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();
export type TemplateForgeNeed = z.infer<typeof templateForgeNeedSchema>;

/**
 * The states the engine walks, and the five it parks on.
 *
 * Kept as a plain list rather than mirrored from the forge at runtime: the frontend branches on
 * these words, so a new state must be a code change here, seen in review, and not a string that
 * appears one day and renders as an unlabelled badge.
 */
export const TEMPLATE_FORGE_RUN_STATES = [
  'created',
  'analyzing',
  'mapping',
  'building',
  'validating',
  'draft_ready',
  'needs_input',
  'smoking',
  'review_ready',
  'promoting',
  'published',
  'failed',
] as const;
export type TemplateForgeRunState = (typeof TEMPLATE_FORGE_RUN_STATES)[number];

/** The states a run stops on. `done` is true for exactly these. */
export const TEMPLATE_FORGE_TERMINAL_STATES = [
  'needs_input',
  'draft_ready',
  'review_ready',
  'published',
  'failed',
] as const;

export const templateForgeErrorSchema = z
  .object({
    code: z.string(),
    message: z.string().optional(),
    retryable: z.boolean().optional(),
    need: z.record(z.string(), z.unknown()).optional(),
    evidence: z.unknown().optional(),
  })
  .passthrough();
export type TemplateForgeError = z.infer<typeof templateForgeErrorSchema>;

export const templateForgeRunSchema = z
  .object({
    runId: z.string().min(1),
    assetId: z.string().uuid(),
    brandId: z.string().uuid(),
    state: z.string().min(1),
    done: z.boolean(),
    ok: z.boolean().nullable(),
    progress: templateForgeProgressSchema.nullable(),
    findings: z.array(templateForgeFindingSchema),
    needs: z.array(templateForgeNeedSchema),
    error: templateForgeErrorSchema.nullable(),
    application: z.string().nullable(),
    rootTable: z.string().nullable(),
    startedAt: z.string(),
    polledAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
  })
  .strict();
export type TemplateForgeRun = z.infer<typeof templateForgeRunSchema>;

// ── Mapping needs, grouped into the questions a person (or the autopilot) answers ──────────────
//
// A multi-ratio template authors each field once per ratio comp, so the forge asks the same
// question once per comp — 43 lines for a 5-comp package that has 9 fields. They are grouped by
// the slot they name, and one answer is sent for every comp that asked it. Shared by the Forge
// page's question list and the Backend autopilot so both take the same answer from the same needs.

/** The answer that keeps a layer as the file drew it. The forge refuses it for a media port. */
export const KEEP_AS_DESIGNED = '__keep';

export interface MappingQuestion {
  key: string;
  label: string;
  reason?: string;
  needs: TemplateForgeNeed[];
  /** Ranked by the forge; `score` > 0 means the name itself said something. */
  options: Array<{ fieldPath: string; label: string; score: number }>;
}

/** Mapping needs grouped by the slot they name; asset needs are the Variables tab's to answer. */
export function groupMappingNeeds(needs: readonly TemplateForgeNeed[]): MappingQuestion[] {
  const groups = new Map<string, MappingQuestion>();
  for (const need of needs) {
    if (need.kind !== 'mapping') continue;
    const label = readableLayerName(need.slot?.label ?? need.id);
    const key = `${label}\u0000${need.slot?.type ?? ''}`;
    const group = groups.get(key);
    if (group) {
      group.needs.push(need);
      continue;
    }
    groups.set(key, {
      key,
      label,
      ...(need.reason ? { reason: need.reason } : {}),
      needs: [need],
      options: (need.options ?? []).flatMap((option) =>
        typeof option.fieldPath === 'string'
          ? [
              {
                fieldPath: option.fieldPath,
                label: typeof option.label === 'string' ? option.label : option.fieldPath,
                score: typeof option.score === 'number' ? option.score : 0,
              },
            ]
          : [],
      ),
    });
  }
  return [...groups.values()];
}

/**
 * The answer to start from: the top option only when its NAME matched and nothing tied it.
 * A tie ordered alphabetically is not an answer, so those start unanswered.
 */
export function suggestedAnswer(question: MappingQuestion): string | undefined {
  const [top, second] = question.options;
  if (!top) return KEEP_AS_DESIGNED;
  return top.score > 0 && (!second || second.score < top.score) ? top.fieldPath : undefined;
}

/** The forge's decisions body: one entry per comp that asked, keyed by comp. */
export function decisionsFor(
  questions: readonly MappingQuestion[],
  answers: Readonly<Record<string, string>>,
): { mappings: Record<string, Array<Record<string, string>>> } {
  const mappings: Record<string, Array<Record<string, string>>> = {};
  for (const question of questions) {
    const answer = answers[question.key];
    if (!answer) continue;
    for (const need of question.needs) {
      const slotStableKey = need.slot?.stableKey;
      if (!slotStableKey) continue;
      const entry: Record<string, string> =
        answer === KEEP_AS_DESIGNED
          ? { slotStableKey, action: 'leaveStatic', reason: 'kept as designed by a person' }
          : { slotStableKey, fieldPath: answer };
      (mappings[need.comp ?? ''] ??= []).push(entry);
    }
  }
  return { mappings };
}

/**
 * Is this run still worth polling?
 *
 * Deliberately NOT `!done`: a run the forge parked on can still be advanced by a person (a
 * decision clears `needs_input`, a draft moves `draft_ready` on), and the poller must stop for
 * those rather than spin. It is the caller who restarts polling after acting.
 */
export function templateForgeRunIsMoving(run: { done: boolean; state: string }): boolean {
  return !run.done && run.state !== 'failed';
}

/**
 * What to show while a run is working.
 *
 * Returns null when the total is unknown, which the caller must render as an indeterminate bar.
 * Returning 0 here would be the exact lie the forge's own progress model is built to avoid.
 */
export function templateForgeRunPercent(run: {
  progress: TemplateForgeProgress | null;
}): number | null {
  return run.progress?.pct ?? null;
}
