// How a Jaina answer is read at a glance.
//
// THE RULE, and everything else follows from it: COLOUR CARRIES JUDGEMENT, WEIGHT CARRIES
// HIERARCHY. Never the other way round. A figure is coloured only when something actually
// judged it; a figure nobody judged stays in the ink colour, which is not "neutral styling"
// but a statement — nobody said whether this is good. Emphasis (size, weight, mono) says how
// important a figure is; it never says whether it is healthy.
//
// Why this needed writing down:
//
//   1. `MetricItemV2.severity` exists in the contract with four values and was thrown away
//      at render. The model's judgement never reached a pixel.
//
//   2. `DeltaBadge` colours by SIGN — up green, down red, unconditionally, and it is shared
//      across every dashboard in the app. On a cost metric that is exactly backwards: cost
//      per result falling is the good outcome, rendered red. `HeroTile.goodWhenDown` was
//      computed for precisely this and then dropped at the call site.
//
// Both are the same defect: a judgement the data already carries, discarded on the way to
// the screen. This module is the one place that turns a judgement into a colour, so there is
// one answer to "why is this number red" instead of one per component.
//
// The palette is not new. It is the design system's own tokens, used by meaning:
//
//   success            #16a34a  green      — this is good
//   destructive        #ef4444  red        — this is a problem
//   warning            #b45309  amber      — watch this
//   foreground         ink                 — judged, and unremarkable
//   muted-foreground   #5c5b7a  slate-violet — nobody judged this
//   primary            #5a48f9  violet     — Jaina's own voice, not a measured figure
//
// No emojis anywhere. A severity that needs a picture to be legible is a severity the colour
// and the word should have carried.

import type { MetricRead } from '@continuum/contracts';
import type { Severity } from '@/lib/jaina/schemas';

/** What a figure's colour means. `unjudged` is a real state, not a fallback. */
export type Judgement = Severity | 'unjudged';

/** Text colour per judgement. The only place a severity becomes a class. */
export const JUDGEMENT_TEXT: Record<Judgement, string> = {
  positive: 'text-success',
  risk: 'text-destructive',
  watch: 'text-warning',
  // Judged, and fine. The ink itself — deliberately NOT muted, because "we looked and it is
  // normal" is a stronger statement than "we did not look".
  neutral: 'text-foreground',
  unjudged: 'text-muted-foreground',
};

/** The word a reader gets for a judgement, for screen readers and for tooltips. */
export const JUDGEMENT_LABEL: Record<Judgement, string> = {
  positive: 'good',
  risk: 'a problem',
  watch: 'worth watching',
  neutral: 'normal',
  unjudged: 'not judged',
};

/**
 * What a metric's one-word read means as a colour. The read is derived on the Backend from
 * the figure's direction against its target or its prior, so it IS a judgement — `mejor` is
 * good news, `peor` a problem, `igual` judged and unremarkable — and `sin_comparacion` is
 * the one honest "nobody could judge this", which is the muted ink by this module's law.
 */
export const READ_JUDGEMENT: Record<MetricRead, Judgement> = {
  mejor: 'positive',
  peor: 'risk',
  igual: 'neutral',
  sin_comparacion: 'unjudged',
};

/** Jaina's own sentence, as opposed to a figure something measured. */
export const JAINA_VOICE_TEXT = 'text-primary';

/**
 * What a period-over-period change means — which is NOT the same as which way it moved.
 *
 * Order of authority, and it matters:
 *
 *   1. An explicit `severity` from the contract. Something judged this on purpose; nothing
 *      here is entitled to second-guess it.
 *   2. `goodWhenDown`, when the caller knows the metric's polarity — a cost, a bounce rate,
 *      a cost per thousand. Falling is the good outcome and the colour must say so.
 *   3. The sign. The last resort, and the one that is wrong for every cost metric in the
 *      product — which is why it is last and why callers are expected to supply one of the
 *      two above.
 *
 * Returns `unjudged` when there is no change to judge, rather than inventing `neutral`:
 * "there is no delta" and "the delta is unremarkable" are different facts.
 */
export function judgeDelta(args: {
  /** Signed change. Null or undefined means there is nothing to judge. */
  change: number | null | undefined;
  /** True when a FALLING value is the good outcome (cost per result, CPM, bounce rate). */
  goodWhenDown?: boolean;
  /** An explicit judgement from the data. Wins over everything. */
  severity?: Severity | null;
}): Judgement {
  const { change, goodWhenDown = false, severity } = args;
  if (severity) return severity;
  if (change == null || change === 0) return 'unjudged';
  const improved = goodWhenDown ? change < 0 : change > 0;
  return improved ? 'positive' : 'risk';
}

/**
 * The judgement for a figure's own value, independent of any change.
 *
 * Kept separate from `judgeDelta` on purpose: a metric can be at a healthy level while
 * moving the wrong way, and collapsing the two into one colour loses exactly the
 * information a reader needs.
 */
export function judgeValue(severity: Severity | null | undefined): Judgement {
  return severity ?? 'unjudged';
}

/**
 * Does a FALLING value mean good news for a metric with this name?
 *
 * A heuristic, and deliberately a narrow one. The contract says how to PRINT a figure
 * (`format`) and never which direction is welcome, so something has to decide — but a broad
 * guess that paints a metric the wrong colour is worse than no colour at all. This matches the
 * cost family only, and an explicit `severity` always beats it (see `judgeDelta`).
 *
 * Exported so the sweep across the rest of the app's dashboards has ONE definition to reach
 * for. Every place that renders a delta on a cost metric is currently colouring it backwards;
 * they are not fixed by this module existing, only by each one opting in.
 */
export function fallsAreGood(label: string): boolean {
  const l = label.trim().toLowerCase();
  return (
    l.startsWith('cost per') ||
    l.startsWith('cost/') ||
    l.startsWith('cpa') ||
    l.startsWith('cpl') ||
    l.startsWith('cpm') ||
    l.startsWith('cpi') ||
    l.startsWith('cpc') ||
    l.includes('bounce')
  );
}

/**
 * The left rule a judgement earns on a highlight, an insight card or a callout.
 *
 * The same law as `JUDGEMENT_TEXT` and the same tokens. It exists because `NarrativeBlock`
 * and `InsightListBlock` each hand-rolled `border-emerald-500 / border-amber-500 /
 * border-red-500`. Raw palette literals are wrong here twice over: they put a second answer
 * to "why is this red" back into the tree, and they are not theme-aware — the dark theme
 * redefines `--success` to emerald-400 and `--warning` to amber-400, while a literal
 * `emerald-500` keeps its light value and drifts away from every other judged figure on the
 * same screen.
 */
export const JUDGEMENT_RULE: Record<Judgement, string> = {
  positive: 'border-l-success',
  risk: 'border-l-destructive',
  watch: 'border-l-warning',
  neutral: 'border-l-border',
  // Same rule as the ink: "nobody judged this" is a statement, and a coloured rule would
  // contradict it.
  unjudged: 'border-l-border',
};

/**
 * The type scale of a finished answer. Five sizes, and the smallest is 12px.
 *
 * Measured on the 2026-09-27 EasyFit weekly summary before this existed: nine sizes on one
 * screen — the sentence at 15px, tiles at 17px mono, sub-labels at 10 and 11px, template
 * tables at 12px. Four sizes inside a single block is not hierarchy, it is noise, and the
 * two smallest were below what the design system calls legible. Each block and template
 * under `jaina/` now takes its sizes from here and nowhere else:
 *
 *   answer   20px / 500        the one sentence that answers the question
 *   figure   16px mono / 600   a number something measured
 *   body     15px / 400        the prose a figure sits in
 *   table    14px / 400        table cells, the window line, captions
 *   label    12px / 600 caps   Why · Evidence · Action, column heads, tile labels
 *
 * `text-md` is the 15px step (`--text-md` in globals.css); Tailwind ships no size between
 * `sm` (14) and `base` (16). the 2xs and 3xs steps (11 and 10px) exist for dense chrome
 * elsewhere in the app and are not allowed under `jaina/` — `typeScale.test.ts` counts them.
 */
export const JAINA_TYPE = {
  answer: 'text-xl font-medium leading-snug text-foreground',
  figure: 'font-mono text-base font-semibold tabular-nums',
  body: 'text-md leading-6',
  table: 'text-sm',
  label: 'text-xs font-semibold uppercase tracking-wide',
} as const;

/**
 * The one table. `DataTableBlock`, `ComparisonBlock` and the templates' `TemplateTableView`
 * each drew their own — two borders, two header weights, 14px cells beside 12px cells in
 * the same answer. Column heads are labels (12px caps), cells are table size, digits are
 * tabular so the columns line up.
 */
export const JAINA_TABLE = {
  wrap: 'overflow-x-auto rounded-lg border border-border/60',
  table: `w-full ${JAINA_TYPE.table} tabular-nums`,
  headRow: 'border-b border-border/60 bg-muted/30',
  th: `px-3 py-2 ${JAINA_TYPE.label} text-muted-foreground`,
  row: 'border-b border-border/30 last:border-0',
  td: 'px-3 py-2',
} as const;

/**
 * How Jaina's own answer is set, wherever it appears.
 *
 * One constant because the answer arrives by two routes that were drifting apart: a plain
 * turn renders `message.content` through `SafeMarkdown` at reading size in the ink colour,
 * while a report turn rendered `report.executive_summary` — the SAME sentence, the part the
 * reader actually reads — at `text-sm` in `text-muted-foreground`. By this module's own law
 * that second class is not "quieter styling": muted ink means *nobody judged this*, applied
 * to the one paragraph somebody did.
 *
 * The answer is the `answer` step of the scale. A markdown table inside it drops to table
 * size and regular weight: the sentence is the claim, the table is its evidence.
 * `tabular-nums` on the cells is here because Streamdown's own table classes set padding
 * and alignment and no numeric variant, so a markdown table of figures renders with
 * proportional digits and columns that do not line up.
 */
export const JAINA_ANSWER_PROSE = `${JAINA_TYPE.answer} [&_table]:${JAINA_TYPE.table} [&_table]:font-normal [&_td]:tabular-nums [&_th]:tabular-nums`;

/**
 * Supporting prose: a reasoning trace, a block's own body, an aside. Body size, and quieter
 * than the answer on purpose — this is the material the answer rests on, not the answer.
 */
export const JAINA_EVIDENCE_PROSE = `${JAINA_TYPE.body} text-muted-foreground [&_td]:tabular-nums [&_th]:tabular-nums`;

/**
 * A severity the model actually chose, as opposed to the one the schema filled in.
 *
 * `metricItemSchema` and `comparisonPairSchema` both declare
 * `severity: z.enum([...]).default('neutral')`, so EVERY item arrives carrying `'neutral'`
 * whether the model judged it or said nothing at all. `judgeDelta` gives an explicit
 * severity top authority and `'neutral'` is truthy, so that default wins every time and
 * rule 2 — the metric's polarity, the whole reason `goodWhenDown` exists — never runs.
 *
 * Measured, not supposed: across the last six structured reports in production, every
 * metric in every block arrived `severity: "neutral"`. Not one was a judgement; all six
 * were the default.
 *
 * So for a DELTA, read `'neutral'` as silence and let the polarity rule speak. This is not
 * inventing a judgement — a change is a measured movement, and "cost per result fell 12%"
 * is good news whether or not anyone annotated it. For a VALUE, `judgeValue` keeps taking
 * `'neutral'` at face value: the ink colour is the right answer for a figure with no
 * judgement attached, and a level, unlike a movement, has no direction to read.
 */
export function explicitSeverity(severity: Severity | null | undefined): Severity | null {
  return severity && severity !== 'neutral' ? severity : null;
}
