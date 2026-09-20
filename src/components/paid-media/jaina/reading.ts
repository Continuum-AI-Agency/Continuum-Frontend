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
