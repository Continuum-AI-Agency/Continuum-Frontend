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
//
// AND THE ROW DOES NOT END AT ADOPTING. Adopting is a decision stamp that writes nothing, so
// a plan proposing something NEW — three audiences worth testing, a creative iteration to
// try — carries no `target_id` and used to fall through to "Open Manage", which cannot build
// anything. The same row now carries the real next step: one press turns the adopted plan
// into work the EXISTING approved path runs (`optimizer_implement_adhoc_suggestion` mints a
// pending recommendation against the portfolio's latest cycle run and, for audiences, calls
// `optimizer_request_audience_proposal` unchanged), and afterwards the row says what was
// made and that it is not delivering. No second inbox and no second write path — the card
// that asked the question is the card that finishes it.

import type {
  AdhocSuggestionCategory,
  AdhocSuggestionFigure,
  AdhocSuggestionHandoff,
  AdhocSuggestionPlan,
  AdhocSuggestionRow,
  HeroModule,
  ImpactTier,
} from '@continuum/contracts';
import {
  ADHOC_HANDOFF_COPY,
  ADHOC_SUGGESTION_CATEGORY_COPY,
  adhocHandoffBuiltNote,
  adhocHandoffRowKey,
  HERO_MODULE_COPY,
  IMPACT_TIER_COPY,
  impactTier,
  readAdhocHandoff,
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
  /** What implementing built, once it has been. Null before the build. */
  handoff: AdhocSuggestionHandoff | null;
  /** The sentence under the control: what pressing it will do and that nothing goes live,
   *  or — once built — what exists now and that it is not delivering. Null when the row has
   *  nothing to add beyond its own basis line. */
  nextNote: string | null;
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
    handoff: null,
    nextNote: null,
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
      handoff: null,
      nextNote: null,
      cta: { kind: 'manage', rowKey: null, label: 'Open Manage' },
    };
  }

  // Unsized suggestions are common and honest: the cycle did not raise this, so there is no
  // money figure behind it and inventing one would sort it above work that has a real one.
  const sized = plan.impact_per_day != null && plan.impact_per_day > 0;
  const tier: ImpactTier = sized ? impactTier(plan.impact_per_day ?? 0, dailyTotal) : 'low';
  const adopted = row.status === 'adopted';
  const handoff = readAdhocHandoff(row);

  return {
    id: `asked:${row.id}`,
    suggestionId: row.id,
    askedCategory: row.category,
    status: row.status,
    module,
    category: copy.label,
    tier,
    tierLabel: adopted
      ? handoff
        ? 'Handed off'
        : 'Taken on'
      : sized
        ? IMPACT_TIER_COPY[tier]
        : 'Not sized',
    title: plan.headline,
    reason: plan.why || null,
    basis: plan.impact_basis ?? plan.confidence_note ?? copy.blurb,
    isHero: false,
    origin: 'asked',
    steps: plan.steps,
    figures: plan.figures,
    detail: { steps: plan.steps, figures: plan.figures },
    adoptToken: adopted ? null : (plan.adopt?.token ?? null),
    handoff,
    nextNote: nextNoteFor(row.category, plan, handoff, adopted),
    cta: ctaFor(plan, module, row.category, adopted, handoff),
  };
}

/**
 * What the row says under its control.
 *
 * Before the build, the paused promise — stated at the moment somebody is deciding whether
 * to press, not discovered afterwards. After the build, what exists and that it is not
 * delivering. And on an adopted plan with nothing to build from, the reason, so a row that
 * cannot go further says why instead of offering a button that goes nowhere.
 */
function nextNoteFor(
  category: AdhocSuggestionCategory,
  plan: AdhocSuggestionPlan,
  handoff: AdhocSuggestionHandoff | null,
  adopted: boolean,
): string | null {
  if (handoff) return adhocHandoffBuiltNote(category);
  if (!adopted) return null;
  if (plan.cta?.target_id) return null;
  if (!plan.adset_id) {
    return 'This suggestion names no ad set, so there is nothing here to build from.';
  }
  return ADHOC_HANDOFF_COPY[category].paused;
}

/**
 * Where the card takes the person, in the order the row's own life runs.
 *
 * 1. THE WORK ALREADY EXISTS. A plan naming a queue row goes THERE — the decision is taken
 *    on the row that already exists, not twice. This outranks everything below, including
 *    the build: a suggestion that recognised work the cycle already scored must never mint
 *    a second copy of it.
 * 2. IT HAS BEEN BUILT. Land on what the build made, by the queue's own row key.
 * 3. IT WAS ADOPTED AND NAMES AN AD SET. Offer the build. This is the case that used to
 *    dead-end on "Open Manage".
 * 4. Otherwise: take it on, or — adopted with nothing to build from — say so in `nextNote`
 *    and leave Manage as the way out rather than a button that does nothing.
 */
function ctaFor(
  plan: Pick<AdhocSuggestionPlan, 'cta' | 'adset_id'>,
  module: Exclude<HeroModule, 'none'>,
  category: AdhocSuggestionCategory,
  adopted: boolean,
  handoff: AdhocSuggestionHandoff | null,
): HeroCta {
  const cta = plan.cta;
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

  if (handoff) {
    const rowKey = adhocHandoffRowKey(handoff, plan);
    if (rowKey) {
      return { kind: 'queue_row', rowKey, label: ADHOC_HANDOFF_COPY[category].open };
    }
    return { kind: 'manage', rowKey: null, label: 'Open Manage' };
  }

  if (adopted && plan.adset_id) {
    return { kind: 'build', rowKey: null, label: ADHOC_HANDOFF_COPY[category].build };
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
