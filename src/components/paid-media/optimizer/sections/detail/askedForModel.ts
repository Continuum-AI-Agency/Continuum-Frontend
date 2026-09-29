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
//
// NOR DOES IT END AT THE HANDOFF. A handoff that opened an audience proposal is a pointer
// to a row that keeps changing — queued, read by Jaina, ready, blocked, failed — and the row
// that asked reads that state off the proposals query rather than repeating "being built"
// forever (`handoffProposal`). MENSAJES // TODOS, 2026-09-29: suggestion 1f2426b1 was
// adopted, its handoff opened proposal e2310011, the worker failed it with a 40-line Zod
// dump in `error.message`, and the row said "being built". It now says "No se pudo
// construir" with a one-line reason and offers to ask again.

import type {
  AdhocSuggestionCategory,
  AdhocSuggestionFigure,
  AdhocSuggestionHandoff,
  AdhocSuggestionPlan,
  AdhocSuggestionRow,
  AudienceProposalBlock,
  AudienceProposalCardState,
  AudienceProposalRow,
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
  readProposalBlock,
} from '@continuum/contracts';
import {
  AUDIENCE_PROPOSAL_STATE_LABEL,
  audienceCardStateFor,
  proposalFailureReason,
} from '../audienceCardModel';
import type { DailyReadRow } from './dailyReadModel';
import { type HeroCta, queueRowKeyFor } from './heroModel';

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
  /** The audience proposal the handoff opened, as the proposals query has it right now.
   *  Null before the build, for the other categories, and until the query has the row. */
  proposal: HandoffProposal | null;
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
    proposal: null,
    nextNote: null,
    cta: { kind: 'manage', rowKey: null, label: 'Working…' },
  };
}

/** What the asked-for rows read besides their own rows: the brand's audience proposals, so
 *  a handoff that opened a proposal can say what became of it. */
export type AskedForContext = {
  proposals?: readonly AudienceProposalRow[];
};

/** The proposal a handoff opened, read once for the row, the panel and the retry. */
export type HandoffProposal = {
  row: AudienceProposalRow;
  /** The card's own state for the row (`audienceCardStateFor`), so the asked-for row and
   *  the card it opens can never disagree about what the proposal is. */
  state: AudienceProposalCardState;
  block: AudienceProposalBlock | null;
  /** One line a person can read: the block's message, or why the build failed. Null for the
   *  states that need no reason. Never a raw error dump — see `proposalFailureReason`. */
  reason: string | null;
  /** True once the cycle superseded it — the trigger stopped firing, so the recommendation
   *  it belonged to was expired in the same pass (public.optimizer_supersede_
   *  recommendations). Both facts come from the proposal row; nothing here is inferred. */
  closed: boolean;
  /** Whether asking again is on offer: a failed or blocked proposal on a recommendation the
   *  cycle has not closed. The request RPC is the existing one, keyed by recommendation. */
  retryable: boolean;
};

export function handoffProposal(
  handoff: AdhocSuggestionHandoff | null,
  proposals: readonly AudienceProposalRow[] | undefined,
): HandoffProposal | null {
  if (!handoff?.proposal_id || !proposals) return null;
  const row = proposals.find((candidate) => candidate.id === handoff.proposal_id);
  if (!row) return null;
  const state = audienceCardStateFor(row);
  const block = readProposalBlock(row);
  const closed = row.status === 'superseded';
  const blocked = state === 'blocked' || state === 'blocked_cbo';
  const reason = blocked
    ? (block?.message ?? null)
    : state === 'failed'
      ? proposalFailureReason(row.error)
      : null;
  return {
    row,
    state,
    block,
    reason,
    closed,
    retryable: (blocked || state === 'failed') && !closed,
  };
}

/** The badge on the row: the proposal's state in the card's own words, or "Cerrada" for a
 *  proposal the cycle closed without ever giving it a body. */
export function proposalStateLabel(proposal: HandoffProposal): string {
  if (proposal.state === 'none' && proposal.closed) return 'Cerrada';
  return AUDIENCE_PROPOSAL_STATE_LABEL[proposal.state];
}

const CLOSED_NOTE = 'El ciclo cerró la recomendación que abrió.';

/**
 * The sentence under the row once the proposal exists: what state it is in and, for a
 * blocked or failed one, why. Null for the states the built note already covers.
 */
export function proposalNote(proposal: HandoffProposal): string | null {
  const closedTail = proposal.closed
    ? ` ${proposalFailureReason(proposal.row.error) ?? 'La señal dejó de dispararse.'} ${CLOSED_NOTE}`
    : '';
  switch (proposal.state) {
    case 'queued':
      return 'En cola: Jaina la toma en menos de un minuto.';
    case 'proposing':
      return 'Jaina está leyendo la audiencia, el catálogo y los creativos…';
    case 'ready':
      return 'Lista: abrila para ver qué audiencia, qué cambia y crear el conjunto nuevo (pausado).';
    case 'blocked':
    case 'blocked_cbo':
      return `Bloqueada — ${proposal.reason ?? 'No se pudo armar la propuesta.'}${closedTail}`;
    case 'failed':
      return `No se pudo construir — ${proposal.reason ?? 'La propuesta no se pudo construir.'}`;
    case 'approved':
      return 'Aprobada: el worker crea el conjunto en menos de un minuto.';
    case 'executing':
      return 'Creando el conjunto y sus anuncios en Meta…';
    case 'executed':
      return 'Creada en Meta. Se activa desde la propuesta.';
    case 'switching':
      return 'Activando el conjunto nuevo…';
    case 'undoing':
      return 'Deshaciendo…';
    case 'undone':
      return 'Deshecha: el conjunto nuevo quedó pausado.';
    case 'none':
      return proposal.closed
        ? `${proposalFailureReason(proposal.row.error) ?? 'La señal dejó de dispararse.'} ${CLOSED_NOTE}`
        : null;
  }
}

function settledRow(
  row: AdhocSuggestionRow,
  dailyTotal: number | null | undefined,
  context: AskedForContext,
): AskedForRow {
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
      proposal: null,
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
  const proposal = handoffProposal(handoff, context.proposals);

  return {
    id: `asked:${row.id}`,
    suggestionId: row.id,
    askedCategory: row.category,
    status: row.status,
    module,
    category: copy.label,
    tier,
    tierLabel: adopted
      ? proposal
        ? proposalStateLabel(proposal)
        : handoff
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
    proposal,
    // The proposal's own state outranks the "being built" promise: the row that asked must
    // say what actually became of the ask, not what the build was going to be.
    nextNote:
      (proposal ? proposalNote(proposal) : null) ??
      nextNoteFor(row.category, plan, handoff, adopted),
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
 * 2. IT HAS BEEN BUILT. Land on what the build made, by the queue's own row key. A handoff
 *    that opened an audience proposal is an `audience_card` CTA: the proposal opens on the
 *    row itself, and the key still names the recommendation row it belongs to.
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
  // ONE resolver with the hero card (heroModel.queueRowKeyFor). An `audience_card` CTA
  // carries the PROPOSAL id and no queue row is keyed by it — the card renders nested inside
  // its recommendation's row — so the key is the CTA's own only when it already is a row
  // key, else the recommendation the handoff says the plan became. Nothing else is a key.
  const rowKey = queueRowKeyFor(cta, { recommendationId: handoff?.recommendation_id ?? null });
  if (cta?.kind === 'queue_row' && rowKey) {
    return {
      kind: 'queue_row',
      rowKey,
      label: module === 'budget' ? 'Review the budget moves' : 'Open it in the queue',
    };
  }
  if (cta?.kind === 'audience_card' && rowKey) {
    return { kind: 'audience_card', rowKey, label: ADHOC_HANDOFF_COPY.audience.open };
  }

  if (handoff) {
    const rowKey = adhocHandoffRowKey(handoff, plan);
    if (rowKey && handoff.kind === 'audience_proposal' && handoff.proposal_id) {
      return { kind: 'audience_card', rowKey, label: ADHOC_HANDOFF_COPY.audience.open };
    }
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
  context: AskedForContext = {},
): AskedForRow[] {
  return rows
    .filter((row) => SHOWN.has(row.status))
    .map((row) =>
      row.status === 'queued' || row.status === 'proposing'
        ? waitingRow(row)
        : settledRow(row, dailyTotal, context),
    );
}

/** The recommendations the asked-for handoffs point at. The queue is built from the cycle's
 *  PENDING recommendations, so one a later cycle expired is absent from it while the row that
 *  opened it still says "Open the audience proposal" — the queue carries these ids so that
 *  press always has a row to land on (see buildActionQueue). */
export function askedRecommendationIds(rows: readonly AskedForRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.handoff?.recommendation_id) ids.add(row.handoff.recommendation_id);
  }
  return [...ids];
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
