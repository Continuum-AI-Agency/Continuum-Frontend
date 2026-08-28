// Why one cycle decision happened, in words.
//
// This prose used to live ONLY in the Frontend (reportModel.ts), which meant the sentence a
// human read on the dashboard and the sentence persisted next to the money write could not
// be the same sentence — because the second one did not exist. Now the optimizer service
// calls these at cycle time to fill optimizer.cycle_items.reason, that string is copied into
// optimizer.apply_audits.justification when the move is executed, and the Frontend renders
// from the same functions. One source, so they cannot drift.
//
// Deliberately PURE: string and number logic over what a cycle item already carries. No I/O,
// no clock, no currency formatting (the caller owns the money symbols), no engine imports.
// That is what makes it unit-testable and safe to call from either side of the boundary.

/** The diagnostic fields these explanations read. Structurally satisfied by the engine's
 *  own ItemDiagnostics AND by the loose `cycle_items.diagnostics` jsonb the Frontend
 *  parses, so neither side needs an adapter. */
export type ExplainDiagnostics = {
  freezeReason?: string | null;
  score3d?: number | null;
  score7d?: number | null;
  score14d?: number | null;
  rawBudget?: number | null;
  velocityCapped?: number | null;
  ci?: {
    cpa?: number | null;
    lo?: number | null;
    hi?: number | null;
    events?: number | null;
  } | null;
};

export type BudgetMoveWhy = {
  lead: string;
  windows: { d3: number | null; d7: number | null; d14: number | null } | null;
  windowsAgree: boolean | null;
  cost: { cpa: number; lo: number | null; hi: number | null; events: number | null } | null;
  capped: boolean;
};

const finite = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** A money-ish figure in a sentence a human reads, not a float in a log line.
 *
 *  `ci.cpa` is a raw quotient — spend over events — so it arrives as 29.91909090909091 and
 *  went into apply_audits.justification verbatim. Two decimals, trailing zeros dropped, so
 *  61 stays "61" and 29.919… reads "29.92". The dashboard's formatCpa already rounds for
 *  the same reason; this is the same intent for the persisted sentence, which has no
 *  currency to hand and so renders a bare number by design.
 */
const readableFigure = (value: number): string => String(Math.round(value * 100) / 100);

/** Did the per-cycle velocity guardrail actually truncate this move?
 *
 *  velocityCapped is the raw proportional budget CLAMPED to the ad set's velocity band, so
 *  the guardrail bit exactly when the clamp changed the number. The old test was
 *  `velocityCapped === true`, which never fired on a real row — the field is a budget, not
 *  a flag — so this hint has been silently absent since it shipped. Epsilon because both
 *  sides are floating-point money. */
export function velocityCapTruncated(diag: ExplainDiagnostics | null | undefined): boolean {
  const raw = finite(diag?.rawBudget);
  const capped = finite(diag?.velocityCapped);
  if (raw == null || capped == null) return false;
  return Math.abs(raw - capped) > 0.005;
}

/** A cycle item's freeze reason → a labeled "Held" state. Returns null when the
 *  item was NOT held (budget was actually reallocated). Rendering this instead of
 *  a $0.00 change is the point: a held ad set was left unchanged ON PURPOSE, not
 *  scored to no-change. Tolerant of loose DB strings. */
export function freezeLabel(
  reason: string | null | undefined,
): { label: string; hint: string } | null {
  switch (reason) {
    case 'no_conversions':
      return {
        label: 'Held · no conversion signal',
        hint: 'Spending but no tracked conversions yet — budget left unchanged until signal arrives.',
      };
    case 'missing_window':
      return {
        label: 'Held · incomplete data',
        hint: 'Not enough trailing-window history to score reliably — held this cycle.',
      };
    case 'unsupported_budget':
      return {
        label: 'Held · CBO/lifetime',
        hint: 'Budget is managed at the campaign level (CBO or lifetime) — the optimizer does not touch it. Convert the campaign to ad-set budgets to optimize its ad sets.',
      };
    case 'lifetime_budget':
      return {
        label: 'Held · lifetime budget',
        hint: 'This campaign has a whole-flight lifetime budget, not a daily one. The optimizer paces and scores in daily terms, so it will not resize a flight it cannot reason about.',
      };
    case 'no_own_budget':
      return {
        label: 'Held · no budget of its own',
        hint: 'This ad set has no ad-set budget for the optimizer to move — boosted posts and promoted posts usually look like this. It is left alone rather than handed a share of the pool it never had. Give it an ad-set daily budget in Meta if you want the optimizer to manage it.',
      };
    case 'no_declared_objective':
      return {
        label: 'Held · no declared goal',
        hint: 'This ad set does not tell Meta what result it is buying, and it has produced none of the results this portfolio measures. Scoring it would rank it on events it never claimed to buy, so it is held instead. Set an optimization goal on the ad set in Meta.',
      };
    case 'kpi_mismatch':
      return {
        label: 'Held · different goal',
        hint: 'This ad set is bidding for a different result than the portfolio prices (for example messaging conversations in a portfolio measured on leads). Ranking them together would compare a cheap event against an expensive one and hand the budget to whichever is cheaper, so it is held instead. Move it to a portfolio that measures what it actually buys.',
      };
    default:
      if (reason) return { label: 'Held', hint: 'Budget left unchanged on purpose this cycle.' };
      return null;
  }
}

/** Why one budget move happened, assembled entirely from what a cycle item already carries —
 *  so it works on rows scored before this shipped. Numbers stay raw; the caller owns currency.
 *
 *  Null when the item was HELD (freezeLabel already explains those — a held ad set was left
 *  unchanged on purpose rather than scored into a move) or when nothing actually moved.
 *
 *  Two arguments rather than one row, because the two callers hold the same facts in
 *  different shapes: the engine item IS its own diagnostics (`item.changeAbs, item`), while a
 *  persisted row nests them (`row.change_abs, row.diagnostics`). */
export function budgetMoveWhy(
  changeAbs: number | null | undefined,
  diag: ExplainDiagnostics | null | undefined,
): BudgetMoveWhy | null {
  if (diag?.freezeReason) return null;

  const change = finite(changeAbs) ?? 0;
  if (change === 0) return null;

  // The solver water-fills in proportion to each ad set's shrunk composite score, so a
  // raise means exactly this: its score earned a bigger slice of the pool than the
  // budget it currently holds. Not "it beat the average".
  const lead =
    change > 0
      ? 'Earned a larger share of the pool than its current budget.'
      : 'Earned a smaller share of the pool than its current budget.';

  const d3 = finite(diag?.score3d);
  const d7 = finite(diag?.score7d);
  const d14 = finite(diag?.score14d);
  const present = [d3, d7, d14].filter((value): value is number => value != null && value > 0);
  // ponytail: max/min ratio, not the engine's coefficient of variation. Good enough to
  // say "agree"/"disagree" in a sentence; use the engine's consistency term if this ever
  // needs to be the same number the score was computed from.
  const windowsAgree =
    present.length >= 2 ? Math.max(...present) / Math.min(...present) <= 1.35 : null;

  const ci = diag?.ci ?? null;
  const cpa = finite(ci?.cpa);

  return {
    lead,
    windows: d3 == null && d7 == null && d14 == null ? null : { d3, d7, d14 },
    windowsAgree,
    cost:
      cpa == null
        ? null
        : { cpa, lo: finite(ci?.lo), hi: finite(ci?.hi), events: finite(ci?.events) },
    capped: velocityCapTruncated(diag),
  };
}

/** The ONE-LINE why persisted to optimizer.cycle_items.reason at cycle time, and copied to
 *  optimizer.apply_audits.justification when the move is executed. Composed from the same
 *  freezeLabel / budgetMoveWhy prose the dashboard renders, so the sentence in the audit
 *  trail is the sentence the human read.
 *
 *  Null when there is nothing to say (unchanged budget, no diagnostics) — a null reason is
 *  honest; a manufactured one is not. */
export function moveReasonText(
  changeAbs: number | null | undefined,
  diag: ExplainDiagnostics | null | undefined,
): string | null {
  const held = freezeLabel(diag?.freezeReason);
  if (held) return `${held.label} — ${held.hint}`;

  const why = budgetMoveWhy(changeAbs, diag);
  if (!why) return null;

  const parts = [why.lead];
  if (why.windowsAgree === true) parts.push('The 3d, 7d and 14d scores agree.');
  if (why.windowsAgree === false) parts.push('The 3d, 7d and 14d scores disagree.');
  if (why.cost) {
    const events = why.cost.events;
    parts.push(
      events == null
        ? `Cost per result ${readableFigure(why.cost.cpa)}.`
        : `Cost per result ${readableFigure(why.cost.cpa)} on ${events} event${events === 1 ? '' : 's'}.`,
    );
  }
  if (why.capped) parts.push('Truncated by the per-cycle velocity cap.');
  return parts.join(' ');
}
