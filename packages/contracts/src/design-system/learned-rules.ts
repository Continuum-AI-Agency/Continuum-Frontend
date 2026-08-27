// Turning a complaint about a generated piece into a rule a machine can check — and refusing
// to pretend when it can't.
//
// Someone reviews a piece and writes «the date block sits on top of the headline». That is a
// complaint, not a rule. A rule carries a MEASUREMENT: "intersection of the two text boxes =
// 0 px; minimum separation 2 % of the height". The translation is the whole product, and the
// refusal is what keeps it honest — Verne's training endpoint answers a rule with no
// measurement with a literal 400, «una regla sin medición no es una regla»
// (`verne-demo-studio/server.py`, the `/up/reglas` endpoint). Here that refusal is a schema
// error rather than a runtime one: {@link learnedRuleSchema} cannot be satisfied without a
// non-empty `measurement`, and {@link proposeRule} routes a complaint it cannot measure into
// {@link pendingComplaintSchema} instead of inventing a threshold to make it fit.
//
// The shape of the durable rule is ported from the hand-authored bank in
// `verne-demo-studio/up_knowledge/invariantes.json` — id, name, prohibition, measurement,
// blocking-or-not, provenance, probable cause, date — plus one field that file does not have.
//
// ── STORING A RULE IS NOT ENFORCING IT ───────────────────────────────────────────────────
//
// In the reference, learned rules are stored, counted and displayed, and NOTHING EVER
// EXECUTES THEM against a rendered piece — while the UI tells the reviewer that the system
// «can no longer do this without detecting it». That claim is false there: only the
// hand-authored R01-R03 and R11-R15 actually run, in `_pruebas/auditoria.py`. Every rule the
// training loop adds is inert.
//
// So `enforcedBy` is required and nullable, and it names the checker rather than asserting a
// boolean: a rule is enforced only when someone can point at the code that runs it. `null`
// means stored-and-inert, which is the honest state of every rule the moment it is learned —
// {@link proposeRule} therefore always stamps `null` and offers no way to say otherwise.
// Wiring a rule into a checker is a reviewed code change, not a field a proposer sets.
// A UI that counts rules must count {@link isEnforced} separately, or it ships the same lie.

import { z } from 'zod';

/** `R01`, `R02`, … — the sequence {@link allocateRuleId} continues. */
export const RULE_ID_PATTERN = /^R\d+$/;

const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

/**
 * How a violation lands: `blocking` pieces must not be delivered, `warning` ones may.
 *
 * There is deliberately no default anywhere in this module. This flag decides whether a
 * piece ships, and a default would decide it for someone who never thought about it.
 */
export const ruleSeveritySchema = z.enum(['blocking', 'warning']);
export type RuleSeverity = z.infer<typeof ruleSeveritySchema>;

/** Where a rule came from. The learning loop can only ever produce the second. */
export const ruleOriginSchema = z.enum(['hand-authored', 'learned-from-feedback']);
export type RuleOrigin = z.infer<typeof ruleOriginSchema>;

/**
 * The convention a proposer uses to admit it cannot write a measurement.
 *
 * The reference asks its model for «si no se puede medir, dilo en esta clave empezando por
 * "no medible todavía:"» — the marker is a prefix, and whatever follows it is the reason.
 * Both languages are listed because the corpus this is ported from is Spanish and the
 * proposer is not guaranteed to answer in English.
 */
export const NOT_MEASURABLE_MARKERS: readonly string[] = [
  'not measurable yet',
  'no medible todavía',
  'no medible todavia',
];

/** What a draft with no measurement at all is told, so a pending row always says why. */
export const NO_MEASUREMENT_REASON =
  'no measurement was offered: something the engine cannot check on the rendered piece is a preference, not a rule';

/**
 * The reason a measurement is not a measurement, or `null` if it is one.
 *
 * Single source for the marker convention: {@link learnedRuleSchema} refuses what this
 * accepts and {@link proposeRule} routes on it, so the two cannot drift.
 */
export function notMeasurableReason(measurement: string): string | null {
  const text = measurement.trim();
  const lower = text.toLowerCase();
  for (const marker of NOT_MEASURABLE_MARKERS) {
    if (!lower.startsWith(marker)) continue;
    // «no medible todavía: hace falta una medida de dónde está el sujeto» — keep the why.
    return text.slice(marker.length).replace(/^[\s:.,;—-]+/, '').trim() || text;
  }
  return null;
}

/**
 * A rule the engine can be held to.
 *
 * `measurement` is the entire point of the schema. `min(1)` after `trim()` means a
 * whitespace-only string is not a measurement either, and the refinement closes the other
 * door: a measurement that itself admits it cannot measure belongs in
 * {@link pendingComplaintSchema}, not here dressed as a rule.
 */
export const learnedRuleSchema = z
  .object({
    id: z
      .string()
      .regex(RULE_ID_PATTERN, 'rule ids are R01, R02, … — allocate with allocateRuleId'),
    /** Short, in the affirmative: "No logo is ever cropped". */
    name: z.string().trim().min(1).max(120),
    /** What is forbidden, in one sentence. */
    forbidden: z.string().trim().min(1).max(400),
    /** How it is checked on pixels or geometry. A rule without this is not a rule. */
    measurement: z
      .string()
      .trim()
      .min(1, 'a rule without a measurement is not a rule')
      .max(600)
      .refine(
        (m) => notMeasurableReason(m) === null,
        'a measurement that admits it cannot measure belongs in the pending bucket, not the rule bank',
      ),
    severity: ruleSeveritySchema,
    origin: ruleOriginSchema,
    /** The receipt: the brand-manual page, or the complaint and the day it was reported. */
    originNote: z.string().trim().min(1).max(600).optional(),
    /** Which part of the engine produces it, when that can be inferred. */
    probableCause: z.string().trim().min(1).max(400).optional(),
    recordedOn: isoDaySchema,
    /**
     * The checker that actually runs this rule, or `null` for stored-and-inert.
     *
     * Nullable rather than boolean on purpose: `enforcedBy: true` is a claim, and this repo's
     * reference shipped exactly that claim about rules nothing executed.
     */
    enforcedBy: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();
export type LearnedRule = z.infer<typeof learnedRuleSchema>;

/** Whether anything actually runs this rule. The counter a UI must not skip. */
export function isEnforced(rule: Pick<LearnedRule, 'enforcedBy'>): boolean {
  return Boolean(rule.enforcedBy);
}

/**
 * A complaint that is real and not yet machine-checkable.
 *
 * The holding pen exists so the third option is never "quietly drop it" or "promote it to a
 * fake rule". The reference's own entries set the tone — «la foto no siempre encuadra el
 * sujeto como lo haría un diseñador» is true, and the engine measures legibility, not
 * composition, so there is no measurement to write yet. Saying that is the honest answer.
 */
export const pendingComplaintSchema = z
  .object({
    /** The reviewer's own wording, verbatim. Paraphrasing it loses the defect. */
    reported: z.string().trim().min(1).max(1000),
    reportedOn: isoDaySchema,
    /** Why no measurement can be written for it yet. */
    whyNotMeasurable: z.string().trim().min(1).max(600),
  })
  .strict();
export type PendingComplaint = z.infer<typeof pendingComplaintSchema>;

/** What a reviewer wrote, and when. */
export const designComplaintSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    reportedOn: isoDaySchema,
  })
  .strict();
export type DesignComplaint = z.infer<typeof designComplaintSchema>;

/**
 * A proposed rule, before {@link proposeRule} decides what it actually is.
 *
 * `measurement` is the one loose field — empty, whitespace and marker-prefixed values are all
 * legal here, because sorting those out is the job downstream. `id`, `recordedOn`, `origin`,
 * `originNote` and `enforcedBy` are absent: a draft cannot choose its own id, backdate itself,
 * launder a hand-authored provenance through the learning loop, or claim to be enforced.
 */
export const ruleDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    forbidden: z.string().trim().min(1).max(400),
    measurement: z.string().max(600),
    severity: ruleSeveritySchema,
    probableCause: z.string().trim().min(1).max(400).optional(),
  })
  .strict();
export type RuleDraft = z.infer<typeof ruleDraftSchema>;

/** What {@link proposeRule} decided, and — for a duplicate — why. */
export type RuleProposal =
  | {
      readonly kind: 'duplicate';
      readonly ruleId: string;
      readonly ruleName: string;
      /** Term overlap, 0..1, against the matched rule. */
      readonly score: number;
      /** The normalised terms both share, so the match can be shown rather than trusted. */
      readonly sharedTerms: readonly string[];
      readonly reason: string;
    }
  | { readonly kind: 'rule'; readonly rule: LearnedRule }
  | { readonly kind: 'pending'; readonly complaint: PendingComplaint };

/**
 * Words carrying no discriminating signal, dropped before overlap is measured.
 *
 * ponytail: `no`/`not` are in here, so "logo is cropped" and "no logo is cropped" score
 * identically. That is tolerable because every rule in the bank is phrased as a prohibition
 * and negation appears on both sides — and because a near-match that differs only by negation
 * is still worth putting in front of a human. If rules ever get phrased as assertions, take
 * the negations out of this set before trusting the score.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'an', 'and', 'any', 'are', 'as', 'at', 'be', 'by', 'do', 'does', 'for', 'from', 'in', 'is',
  'it', 'its', 'must', 'no', 'not', 'of', 'on', 'or', 'should', 'than', 'that', 'the', 'then',
  'this', 'to', 'when', 'with',
  'al', 'con', 'de', 'del', 'el', 'en', 'es', 'la', 'las', 'lo', 'los', 'para', 'por', 'que',
  'se', 'si', 'son', 'su', 'sus', 'un', 'una', 'y',
]);

/**
 * The comparable terms in a phrase: accent-folded, lowercased, de-stopworded, de-duplicated.
 *
 * Exported because a match nobody can reproduce by hand is not explainable. Non-latin scripts
 * fold to nothing here and will never match — a known ceiling, not a silent one.
 */
export function ruleTerms(text: string): readonly string[] {
  const folded = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return [...new Set(folded.split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t)))];
}

/** Shared terms over the smaller of the two sets: a short restatement of a verbose rule still scores. */
export const DUPLICATE_TERM_OVERLAP = 0.6;

/** One term in common is a coincidence. Two is the floor for calling anything a duplicate. */
export const DUPLICATE_MIN_SHARED_TERMS = 2;

function bestDuplicate(
  draft: RuleDraft,
  existing: readonly LearnedRule[],
): { rule: LearnedRule; score: number; sharedTerms: readonly string[] } | null {
  const draftTerms = ruleTerms(`${draft.name} ${draft.forbidden}`);
  let best: { rule: LearnedRule; score: number; sharedTerms: readonly string[] } | null = null;
  for (const rule of existing) {
    const ruleTermSet = ruleTerms(`${rule.name} ${rule.forbidden}`);
    const smaller = Math.min(draftTerms.length, ruleTermSet.length);
    if (smaller === 0) continue;
    const sharedTerms = draftTerms.filter((t) => ruleTermSet.includes(t));
    if (sharedTerms.length < DUPLICATE_MIN_SHARED_TERMS) continue;
    const score = sharedTerms.length / smaller;
    if (score < DUPLICATE_TERM_OVERLAP) continue;
    // Strictly greater keeps ties on the earliest rule, so the answer is stable.
    if (best === null || score > best.score) best = { rule, score, sharedTerms };
  }
  return best;
}

/**
 * Decide what a complaint plus a draft actually is: a duplicate, a rule, or a pending row.
 *
 * Returns a discriminated union and never throws — the three answers are all legitimate
 * outcomes, and an exception would make the ordinary case look like a failure. Inputs are
 * assumed to already be their schemas' shape; parse untrusted JSON with
 * {@link designComplaintSchema} and {@link ruleDraftSchema} first.
 *
 * **A re-report is not a new rule — it is the ENGINE FAILING AN EXISTING ONE.** The reference
 * says it plainly: «No hace falta una nueva, hace falta que el motor la cumpla». A rule bank
 * that grows every time the same defect is reported is measuring how often someone complained,
 * not what the engine must do. The right response to `duplicate` is to fix the engine — and,
 * if the matched rule's `enforcedBy` is `null`, the fix is to wire it up at last.
 *
 * Duplicates are checked BEFORE measurability, deliberately. Someone re-reporting a known
 * defect rarely bothers to write the measurement again, and answering that with `pending`
 * would file a second copy of a rule that already exists.
 */
export function proposeRule(
  complaint: DesignComplaint,
  existing: readonly LearnedRule[],
  draft: RuleDraft,
): RuleProposal {
  const duplicate = bestDuplicate(draft, existing);
  if (duplicate !== null) {
    const { rule, score, sharedTerms } = duplicate;
    return {
      kind: 'duplicate',
      ruleId: rule.id,
      ruleName: rule.name,
      score,
      sharedTerms,
      reason:
        `This restates ${rule.id} "${rule.name}" — ${Math.round(score * 100)} % term overlap ` +
        `(${sharedTerms.join(', ')}). A re-report means the engine failed ${rule.id}; ` +
        `fix the engine, not the rule list.`,
    };
  }

  const whyNotMeasurable =
    draft.measurement.trim() === ''
      ? NO_MEASUREMENT_REASON
      : notMeasurableReason(draft.measurement);
  if (whyNotMeasurable !== null) {
    return {
      kind: 'pending',
      complaint: {
        reported: complaint.text,
        reportedOn: complaint.reportedOn,
        whyNotMeasurable,
      },
    };
  }

  return {
    kind: 'rule',
    rule: {
      id: allocateRuleId(existing),
      name: draft.name,
      forbidden: draft.forbidden,
      measurement: draft.measurement.trim(),
      severity: draft.severity,
      origin: 'learned-from-feedback',
      originNote: `reported ${complaint.reportedOn} · ${complaint.text}`,
      ...(draft.probableCause === undefined ? {} : { probableCause: draft.probableCause }),
      recordedOn: complaint.reportedOn,
      // Nothing runs it yet, and this function has no way to say otherwise. See the header.
      enforcedBy: null,
    },
  };
}

/**
 * The next id in the `R01`, `R02`, … sequence, across hand-authored AND learned rules.
 *
 * One sequence over both banks or the two collide the first time someone learns a rule. Takes
 * anything with an `id` because ids are read back off stored JSON, where the pattern was
 * enforced on write and is not guaranteed on read: malformed entries are skipped rather than
 * allowed to poison the maximum.
 */
export function allocateRuleId(existing: readonly { readonly id: string }[]): string {
  let highest = 0;
  for (const entry of existing) {
    const id = entry?.id;
    if (typeof id !== 'string' || !RULE_ID_PATTERN.test(id)) continue;
    const n = Number.parseInt(id.slice(1), 10);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return `R${String(highest + 1).padStart(2, '0')}`;
}
