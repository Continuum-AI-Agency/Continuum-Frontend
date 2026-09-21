// Suggestions a person asked for, turned into rows of the SAME list the day's read renders.
//
// This is the whole "one inbox" argument, and it is structural rather than a promise: a
// suggestion does not get a panel of its own. `buildAskedForRows` emits `DailyReadRow`s, the
// Activity tab concatenates them with `buildDailyRead`'s, and one `DailyReadList` renders
// both with one CTA handler. When a suggestion's plan carries a `cta` naming a queue row —
// which it does whenever the model recognised the work as something the cycle already
// scored — pressing it focuses that row in the queue below, exactly as a brief candidate
// does. Nothing is duplicated and nothing needs a second place to look.
//
// A row still with the worker is in the list too, as itself. The alternative is a spinner
// somewhere else on the screen, which is a second place to look by another name.

import type {
  AdhocSuggestionCategory,
  AdhocSuggestionFigure,
  AdhocSuggestionRow,
  HeroModule,
  ImpactTier,
} from '@continuum/contracts';
import {
  ADHOC_SUGGESTION_CATEGORY_COPY,
  HERO_MODULE_COPY,
  IMPACT_TIER_COPY,
  impactTier,
  readAdhocSuggestion,
} from '@continuum/contracts';
import type { DailyReadRow } from './dailyReadModel';
import type { HeroCta } from './heroModel';

/** A suggestion row, as the shared list sees it. Every field `DailyReadRow` has, plus what
 *  only an asked-for row can offer: the steps, its own figures, and the single-use grant
 *  that lets the person take it on. */
export type AskedForRow = DailyReadRow & {
  suggestionId: string;
  askedCategory: AdhocSuggestionCategory;
  status: AdhocSuggestionRow['status'];
  steps: string[];
  figures: AdhocSuggestionFigure[];
  /** Present only on a `ready` row whose grant has not been burned. */
  adoptToken: string | null;
};

const MODULE_BY_CATEGORY: Record<AdhocSuggestionCategory, Exclude<HeroModule, 'none'>> = {
  audience: 'audience',
  budget: 'budget',
  creative: 'creative',
};

/** The statuses that belong on screen. `dismissed` never comes back from the RPC; `adopted`
 *  stays one more read so the person sees their own decision land, then the next fetch after
 *  they leave the tab drops it. */
const SHOWN: ReadonlySet<AdhocSuggestionRow['status']> = new Set([
  'queued',
  'proposing',
  'ready',
  'empty',
  'failed',
  'adopted',
]);

function waitingRow(row: AdhocSuggestionRow): AskedForRow {
  const copy = ADHOC_SUGGESTION_CATEGORY_COPY[row.category];
  return {
    id: `asked:${row.id}`,
    suggestionId: row.id,
    askedCategory: row.category,
    status: row.status,
    module: MODULE_BY_CATEGORY[row.category],
    category: copy.label,
    tier: 'low',
    // Not "Low impact": nothing has been weighed yet, and a tier badge on an unanswered ask
    // is a figure invented to fill a slot.
    tierLabel: 'Reading',
    title: `${copy.label} — reading the portfolio`,
    reason: null,
    basis: copy.blurb,
    isHero: false,
    origin: 'asked',
    steps: [],
    figures: [],
    adoptToken: null,
    cta: { kind: 'manage', rowKey: null, label: 'Working…' },
  };
}

function settledRow(row: AdhocSuggestionRow, dailyTotal: number | null | undefined): AskedForRow {
  const copy = ADHOC_SUGGESTION_CATEGORY_COPY[row.category];
  const plan = readAdhocSuggestion(row);
  const module = MODULE_BY_CATEGORY[row.category];

  if (!plan) {
    // `empty` is an answer: we looked and had nothing. `failed` is not, and the two must not
    // wear the same sentence — the reason a model timed out is not a fact about the account.
    const looked = row.status === 'empty';
    return {
      id: `asked:${row.id}`,
      suggestionId: row.id,
      askedCategory: row.category,
      status: row.status,
      module,
      category: copy.label,
      tier: 'low',
      tierLabel: looked ? 'Nothing to change' : 'Could not read',
      title: looked
        ? `${copy.label} — nothing worth changing right now`
        : `${copy.label} — the read did not finish`,
      reason: null,
      basis: looked
        ? 'Looked across the enrolled ad sets and found nothing this category can improve today.'
        : 'Ask again in a moment.',
      isHero: false,
      origin: 'asked',
      steps: [],
      figures: [],
      adoptToken: null,
      cta: { kind: 'manage', rowKey: null, label: 'Open Manage' },
    };
  }

  // Unsized suggestions are common and honest: the cycle did not raise this, so there is no
  // money figure behind it and inventing one would sort it above work that has a real one.
  const sized = plan.impact_per_day != null && plan.impact_per_day > 0;
  const tier: ImpactTier = sized ? impactTier(plan.impact_per_day ?? 0, dailyTotal) : 'low';
  const adopted = row.status === 'adopted';

  return {
    id: `asked:${row.id}`,
    suggestionId: row.id,
    askedCategory: row.category,
    status: row.status,
    module,
    category: copy.label,
    tier,
    tierLabel: adopted ? 'Taken on' : sized ? IMPACT_TIER_COPY[tier] : 'Not sized',
    title: plan.headline,
    reason: plan.why || null,
    basis: plan.impact_basis ?? plan.confidence_note ?? copy.blurb,
    isHero: false,
    origin: 'asked',
    steps: plan.steps,
    figures: plan.figures,
    detail: { steps: plan.steps, figures: plan.figures },
    adoptToken: adopted ? null : (plan.adopt?.token ?? null),
    cta: ctaFor(plan.cta, module, adopted),
  };
}

/** Where the card takes the person. A plan that names a queue row goes THERE — the decision
 *  is taken on the row that already exists, not twice. */
function ctaFor(
  cta: { kind: 'queue_row' | 'audience_card' | 'manage'; target_id: string | null } | null,
  module: Exclude<HeroModule, 'none'>,
  adopted: boolean,
): HeroCta {
  if (cta?.kind === 'queue_row' && cta.target_id) {
    return {
      kind: 'queue_row',
      rowKey: cta.target_id,
      label: module === 'budget' ? 'Review the budget moves' : 'Open it in the queue',
    };
  }
  if (cta?.kind === 'audience_card' && cta.target_id) {
    return { kind: 'audience_card', rowKey: cta.target_id, label: 'Open the audience proposal' };
  }
  return {
    kind: 'manage',
    rowKey: null,
    label: adopted ? 'Open Manage' : 'Take this on',
  };
}

/**
 * The asked-for rows, newest first.
 *
 * Newest rather than by impact, unlike the day's read: a person pressed a button eight
 * seconds ago and the answer to THAT press has to be at the top. Ranking it below an older
 * suggestion because the older one carries a bigger number would read as the button having
 * done nothing.
 */
export function buildAskedForRows(
  rows: readonly AdhocSuggestionRow[],
  dailyTotal: number | null | undefined,
): AskedForRow[] {
  return rows
    .filter((row) => SHOWN.has(row.status))
    .map((row) =>
      row.status === 'queued' || row.status === 'proposing'
        ? waitingRow(row)
        : settledRow(row, dailyTotal),
    );
}

/** The one line above the list saying what the day's read and the asks add up to. */
export function askedForSummary(rows: readonly AskedForRow[]): string | null {
  const waiting = rows.filter((row) => row.status === 'queued' || row.status === 'proposing');
  if (waiting.length > 0) {
    return waiting.length === 1
      ? `Reading ${HERO_MODULE_COPY[waiting[0]!.module].label.toLowerCase()}…`
      : `Reading ${waiting.length} categories…`;
  }
  return null;
}
