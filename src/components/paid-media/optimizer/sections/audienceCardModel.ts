// Pure reads for the audience recommendation card. No React, no fetch: what to show for a
// proposal row, the five sections an open proposal is read through (qué audiencia, qué
// cambia, qué es nuevo, por qué, cómo se implementa), and what the executed result lists as
// implemented.

import type {
  AudienceExpansionOption,
  AudienceProposalCardState,
  AudienceProposalPlan,
  AudienceProposalResult,
  AudienceProposalRow,
  AudienceSizeEstimate,
  MetaTargetingRef,
  MetaTargetingSpec,
  RecommendationRow,
} from '@continuum/contracts';
import {
  audienceProposalCardState,
  behaviorRefsOf,
  interestRefsOf,
  metaTargetingSpecSchema,
  proposalForRecommendation,
  readProposalBlock,
  readProposalPlan,
  readProposalResult,
  summarizeTargetingSpec,
} from '@continuum/contracts';
import { formatCurrency } from '../format';

export const AUDIENCE_TRIGGERS = new Set(['F2_audience_saturation', 'F3_audience_exhausted']);

export function isAudienceRecommendation(
  rec: Pick<RecommendationRow, 'kind' | 'trigger'>,
): boolean {
  return rec.kind === 'audience_expand' && AUDIENCE_TRIGGERS.has(rec.trigger);
}

export type AudienceCardView = {
  row: AudienceProposalRow | null;
  state: ReturnType<typeof audienceProposalCardState>;
  plan: AudienceProposalPlan | null;
  block: ReturnType<typeof readProposalBlock>;
  result: AudienceProposalResult | null;
  errorMessage: string | null;
};

/**
 * The card's state for a row. `audienceProposalCardState` reads a superseded row as `none`
 * — the terminal states no longer own a decision — but a proposal that was BLOCKED and then
 * superseded still holds the one fact the person came for: why nothing could be built. The
 * reason outlives the signal, so that row keeps its blocked face (reason shown, create
 * disabled) instead of offering a fresh analysis as if nothing had been tried.
 */
export function audienceCardStateFor(
  row: AudienceProposalRow | null,
): ReturnType<typeof audienceProposalCardState> {
  const state = audienceProposalCardState(row);
  if (state !== 'none' || !row || row.status !== 'superseded') return state;
  if (readProposalPlan(row) || !readProposalBlock(row)) return state;
  return readProposalBlock(row)?.code === 'cbo_campaign' ? 'blocked_cbo' : 'blocked';
}

/** The recommendation's status once its proposal reached the given status: the cycle expires
 *  the recommendation when it supersedes the proposal (public.optimizer_supersede_
 *  recommendations), a cancelled proposal rejects it, an executed one is applied, and every
 *  state before a decision leaves it pending. Documented consequences, never guesses. */
function recommendationStatusFor(status: AudienceProposalRow['status']): string {
  switch (status) {
    case 'superseded':
      return 'expired';
    case 'cancelled':
      return 'rejected';
    case 'executed':
    case 'activate_requested':
    case 'activating':
    case 'undo_requested':
    case 'undoing':
    case 'undone':
      return 'applied';
    default:
      return 'pending';
  }
}

/**
 * A recommendation row rebuilt from the proposal it opened, for a recommendation the cycle
 * report does not carry.
 *
 * The report lists PENDING recommendations, and it is a cached read: the recommendation a
 * press just minted is not in it until the next fetch, and one a later cycle expired never
 * comes back (public.optimizer_supersede_recommendations sets the proposal to `superseded`
 * and, in the same pass, the recommendation to `expired`). Every field here is the proposal's
 * own (id, ad set, kind, trigger, run, dates) or a documented consequence of its status; the
 * severity the engine scored is not on the proposal and is left null rather than guessed.
 * Only proposals an asked-for handoff points at are carried this way, so the row someone's
 * own press created always has somewhere to land.
 */
export function carriedRecommendation(
  proposal: AudienceProposalRow,
  adsetName: string | null = null,
): RecommendationRow | null {
  if (!proposal.recommendation_id) return null;
  const block = readProposalBlock(proposal);
  return {
    id: proposal.recommendation_id,
    adset_id: proposal.adset_id,
    adset_name: adsetName,
    ad_id: null,
    kind: proposal.kind,
    trigger: proposal.trigger,
    severity: null,
    reason: block?.message ?? null,
    status: recommendationStatusFor(proposal.status),
    run_id: proposal.cycle_run_id,
    created_at: proposal.created_at,
  };
}

/** What each proposal state is called on screen — on the asked-for row that opened it, on
 *  the inline panel, and on the card. One table, so the three cannot drift. */
export const AUDIENCE_PROPOSAL_STATE_LABEL: Record<AudienceProposalCardState, string> = {
  none: 'Sin propuesta',
  queued: 'En cola',
  proposing: 'Jaina está leyendo',
  ready: 'Lista',
  blocked: 'Bloqueada',
  blocked_cbo: 'Bloqueada',
  failed: 'No se pudo construir',
  approved: 'Aprobada',
  executing: 'Creando el conjunto',
  executed: 'Creada en Meta',
  switching: 'Activando',
  undoing: 'Deshaciendo',
  undone: 'Deshecha',
};

const FAILURE_COPY_BY_CODE: Record<string, string> = {
  propose_failed: 'Jaina no pudo armar la propuesta.',
  execute_failed: 'No se pudo crear el conjunto en Meta.',
  activate_failed: 'No se pudo activar el conjunto nuevo.',
  undo_failed: 'No se pudo deshacer el conjunto nuevo.',
  signal_stopped: 'La señal dejó de dispararse.',
};
const FAILURE_COPY_DEFAULT = 'La propuesta no se pudo construir.';
/** Past this a message is a dump, not a sentence a person is meant to read. */
const HUMAN_MESSAGE_MAX = 240;

/** Whether an error message was written for a person: one line, not a JSON dump, short. */
function isHumanMessage(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > HUMAN_MESSAGE_MAX) return false;
  if (/[\n\r]/.test(trimmed)) return false;
  return !/^[[{]/.test(trimmed);
}

/**
 * Why a proposal failed, in one line a person can read.
 *
 * The worker stores whatever the failing step threw in `error.message` — for MENSAJES //
 * TODOS on 2026-09-29 that was a 40-line Zod issue list. A row must never print that. A
 * message written as a sentence is used as is; anything else is replaced by the sentence the
 * error code stands for.
 */
export function proposalFailureReason(error: AudienceProposalRow['error']): string | null {
  if (!error) return null;
  const message = typeof error.message === 'string' ? error.message : '';
  if (isHumanMessage(message)) return message.trim();
  const code = typeof error.code === 'string' ? error.code : '';
  return FAILURE_COPY_BY_CODE[code] ?? FAILURE_COPY_DEFAULT;
}

export function audienceCardView(
  rows: readonly AudienceProposalRow[],
  rec: Pick<RecommendationRow, 'id' | 'adset_id' | 'trigger'>,
): AudienceCardView {
  const row = proposalForRecommendation(rows, rec);
  return {
    row,
    state: audienceCardStateFor(row),
    plan: row ? readProposalPlan(row) : null,
    block: row ? readProposalBlock(row) : null,
    result: row ? readProposalResult(row) : null,
    errorMessage: row ? proposalFailureReason(row.error) : null,
  };
}

// ── The portfolio's other ad sets ──────────────────────────────────────────────────────

/** One enrolled ad set's live targeting, for the "qué es nuevo" comparison. */
export type PortfolioAdsetSpec = {
  adsetId: string;
  adsetName: string | null;
  spec: MetaTargetingSpec;
};

/** The specs the snapshot envelope carries beside the fleet, parsed at the boundary. A spec
 *  that does not parse is left out rather than compared as an empty audience — an empty
 *  audience would make every option look new. */
export function portfolioSpecsFrom(
  targeting: readonly { adsetId: string; spec: Record<string, unknown> }[],
  nameOf: (adsetId: string) => string | null,
): PortfolioAdsetSpec[] {
  const specs: PortfolioAdsetSpec[] = [];
  for (const entry of targeting) {
    const parsed = metaTargetingSpecSchema.safeParse(entry.spec);
    if (!parsed.success) continue;
    specs.push({ adsetId: entry.adsetId, adsetName: nameOf(entry.adsetId), spec: parsed.data });
  }
  return specs;
}

// ── Reading a spec in words ────────────────────────────────────────────────────────────

const GENDER_WORD: Record<'all' | 'women' | 'men', string> = {
  all: 'todos',
  women: 'mujeres',
  men: 'hombres',
};

type Facets = {
  age: string | null;
  gender: 'all' | 'women' | 'men' | null;
  geo: string[];
  interests: string[];
  behaviors: string[];
  seeds: string[];
  excludedSeeds: string[];
  advantage: boolean | null;
};

const refNames = (refs: readonly MetaTargetingRef[] | undefined): string[] =>
  (refs ?? []).map((ref) => ref.name ?? ref.id);

function facetsOf(spec: MetaTargetingSpec): Facets {
  const summary = summarizeTargetingSpec(spec);
  return {
    age: summary.age,
    gender: spec.genders && spec.genders.length > 0 ? summary.gender : null,
    geo: summary.geo,
    interests: summary.interests,
    behaviors: summary.behaviors,
    seeds: refNames(spec.custom_audiences),
    excludedSeeds: refNames(spec.excluded_custom_audiences),
    advantage: summary.advantageAudience,
  };
}

function hasFacets(facets: Facets): boolean {
  return (
    facets.age != null ||
    facets.gender != null ||
    facets.geo.length > 0 ||
    facets.interests.length > 0 ||
    facets.behaviors.length > 0 ||
    facets.seeds.length > 0 ||
    facets.excludedSeeds.length > 0 ||
    facets.advantage != null
  );
}

function wordsOf(facets: Facets): string | null {
  const parts: string[] = [];
  if (facets.seeds.length > 0) parts.push(facets.seeds.join(', '));
  if (facets.geo.length > 0) parts.push(facets.geo.join(', '));
  if (facets.age) parts.push(facets.age);
  if (facets.gender && facets.gender !== 'all') parts.push(GENDER_WORD[facets.gender]);
  if (facets.interests.length > 0) parts.push(`intereses: ${facets.interests.join(', ')}`);
  if (facets.behaviors.length > 0) parts.push(`comportamientos: ${facets.behaviors.join(', ')}`);
  if (facets.excludedSeeds.length > 0) parts.push(`excluye ${facets.excludedSeeds.join(', ')}`);
  if (facets.advantage === true) parts.push('Advantage+ activo');
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** "Lookalike 1% compradores · MX · 25–45 · intereses: Gimnasios" — or null for an empty spec. */
export function audienceWords(spec: MetaTargetingSpec): string | null {
  return wordsOf(facetsOf(spec));
}

const chosenOptions = (plan: AudienceProposalPlan): AudienceExpansionOption[] => {
  const chosen = new Set(plan.chosen_option_ids);
  return plan.options.filter((o) => o.id != null && chosen.has(o.id) && o.blocked_by == null);
};

const SEED_KINDS = new Set<AudienceExpansionOption['kind']>([
  'custom_audience',
  'lookalike',
  'saved_audience',
]);

/** The proposed facets: the proposal's own spec, or — when the builder wrote none — the
 *  current spec with the chosen options folded in by kind. */
function proposedFacets(plan: AudienceProposalPlan): { facets: Facets; fromSpec: boolean } {
  const own = facetsOf(plan.targeting_spec);
  if (hasFacets(own)) return { facets: own, fromSpec: true };
  const base = facetsOf(plan.previous_spec);
  const union = (list: string[], add: string[]) => [...new Set([...list, ...add])];
  const names = (kinds: (kind: AudienceExpansionOption['kind']) => boolean) =>
    chosenOptions(plan)
      .filter((o) => kinds(o.kind))
      .map((o) => o.name);
  return {
    fromSpec: false,
    facets: {
      ...base,
      interests: union(
        base.interests,
        names((k) => k === 'interest'),
      ),
      behaviors: union(
        base.behaviors,
        names((k) => k === 'behavior'),
      ),
      seeds: union(
        base.seeds,
        names((k) => SEED_KINDS.has(k)),
      ),
      geo: union(
        base.geo,
        names((k) => k === 'geo'),
      ),
    },
  };
}

export type ProposedAudience = {
  /** The proposed targeting in words; never empty. */
  words: string;
  /** "1.2M" — the delivery estimate for the proposal, or null when none was made. */
  reach: string | null;
};

/** Qué audiencia: the proposal in words with its estimated reach. */
export function proposedAudience(plan: AudienceProposalPlan): ProposedAudience {
  const { facets } = proposedFacets(plan);
  return {
    words: wordsOf(facets) ?? 'La propuesta no trae una segmentación legible.',
    reach: estimateLabel(plan.reach.proposed),
  };
}

export type AudienceDiffRow = { label: string; value: string };

export type AudienceDiff = {
  /** Whether the row recorded the ad set's targeting before the proposal. */
  hasPrevious: boolean;
  /** Audiencia actual — one row per facet the current spec sets. */
  current: AudienceDiffRow[];
  /** Qué cambia — one row per facet the proposal changes; plain facets when nothing was
   *  recorded to compare against. */
  changes: AudienceDiffRow[];
};

const listLine = (
  noun: { one: string; many: string },
  before: string[],
  after: string[],
): string | null => {
  const added = after.filter((name) => !before.includes(name));
  const removed = before.filter((name) => !after.includes(name));
  if (added.length === 0 && removed.length === 0) return null;
  const parts: string[] = [];
  if (added.length > 0) {
    const count = added.length === 1 ? noun.one : `${added.length} ${noun.many}`;
    parts.push(`Se ${added.length === 1 ? 'suma' : 'suman'} ${count}: ${added.join(', ')}`);
  }
  if (removed.length > 0) {
    parts.push(`Se ${removed.length === 1 ? 'quita' : 'quitan'} ${removed.join(', ')}`);
  }
  return parts.join(' · ');
};

const scalarLine = (after: string | null, before: string | null): string | null => {
  if (after == null || after === before) return null;
  return before == null ? after : `${after} (antes ${before})`;
};

const advantageWord = (value: boolean | null): string | null =>
  value == null ? null : value ? 'activo' : 'apagado';

/** Audiencia actual / Qué cambia, from previous_spec against the proposal. */
export function audienceDiff(plan: AudienceProposalPlan): AudienceDiff {
  const before = facetsOf(plan.previous_spec);
  const { facets: after } = proposedFacets(plan);
  const hasPrevious = hasFacets(before);

  const current: AudienceDiffRow[] = [];
  if (hasPrevious) {
    current.push({
      label: 'Audiencias',
      value: before.seeds.join(', ') || 'Sin audiencias guardadas',
    });
    current.push({ label: 'Ubicación', value: before.geo.join(', ') || 'Sin ubicación' });
    current.push({ label: 'Edad', value: before.age ?? 'Cualquier edad' });
    current.push({ label: 'Género', value: GENDER_WORD[before.gender ?? 'all'] });
    current.push({ label: 'Intereses', value: before.interests.join(', ') || 'Sin intereses' });
    if (before.behaviors.length > 0) {
      current.push({ label: 'Comportamientos', value: before.behaviors.join(', ') });
    }
    if (before.excludedSeeds.length > 0) {
      current.push({ label: 'Exclusiones', value: before.excludedSeeds.join(', ') });
    }
    const advantage = advantageWord(before.advantage);
    if (advantage) current.push({ label: 'Advantage+', value: advantage });
  }

  const changes: AudienceDiffRow[] = [];
  if (!hasPrevious) {
    if (after.seeds.length > 0)
      changes.push({ label: 'Audiencias', value: after.seeds.join(', ') });
    if (after.geo.length > 0) changes.push({ label: 'Ubicación', value: after.geo.join(', ') });
    if (after.age) changes.push({ label: 'Edad', value: after.age });
    if (after.gender) changes.push({ label: 'Género', value: GENDER_WORD[after.gender] });
    if (after.interests.length > 0) {
      changes.push({ label: 'Intereses', value: after.interests.join(', ') });
    }
    if (after.behaviors.length > 0) {
      changes.push({ label: 'Comportamientos', value: after.behaviors.join(', ') });
    }
    const advantage = advantageWord(after.advantage);
    if (advantage) changes.push({ label: 'Advantage+', value: advantage });
    return { hasPrevious, current, changes };
  }

  const seeds = listLine({ one: 'una audiencia', many: 'audiencias' }, before.seeds, after.seeds);
  if (seeds) changes.push({ label: 'Audiencias', value: seeds });
  const geo = listLine({ one: 'una ubicación', many: 'ubicaciones' }, before.geo, after.geo);
  if (geo) changes.push({ label: 'Ubicación', value: geo });
  const age = scalarLine(after.age, before.age);
  if (age) changes.push({ label: 'Edad', value: age });
  const gender = scalarLine(
    after.gender ? GENDER_WORD[after.gender] : null,
    before.gender ? GENDER_WORD[before.gender] : null,
  );
  if (gender) changes.push({ label: 'Género', value: gender });
  const interests = listLine(
    { one: 'un interés', many: 'intereses' },
    before.interests,
    after.interests,
  );
  if (interests) changes.push({ label: 'Intereses', value: interests });
  const behaviors = listLine(
    { one: 'un comportamiento', many: 'comportamientos' },
    before.behaviors,
    after.behaviors,
  );
  if (behaviors) changes.push({ label: 'Comportamientos', value: behaviors });
  const exclusions = listLine(
    { one: 'una exclusión', many: 'exclusiones' },
    before.excludedSeeds,
    after.excludedSeeds,
  );
  if (exclusions) changes.push({ label: 'Exclusiones', value: exclusions });
  const advantage = scalarLine(advantageWord(after.advantage), advantageWord(before.advantage));
  if (advantage) changes.push({ label: 'Advantage+', value: advantage });
  return { hasPrevious, current, changes };
}

// ── Qué es nuevo ───────────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<AudienceExpansionOption['kind'], string> = {
  interest: 'interés',
  behavior: 'comportamiento',
  demographic: 'demografía',
  geo: 'ubicación',
  custom_audience: 'audiencia personalizada',
  lookalike: 'lookalike',
  saved_audience: 'audiencia guardada',
};

export type AudienceNovelty = {
  /** Other enrolled ad sets whose spec was available to compare against. */
  comparedAdsets: number;
  /** Chosen options and seeds no ad set of the portfolio targets today. */
  fresh: Array<{ name: string; kindLabel: string }>;
  /** Chosen options and seeds some other ad set of the portfolio already targets. */
  reused: Array<{ name: string; kindLabel: string; usedIn: string[] }>;
  /** Options the brand rules crossed out, with the rule. */
  excludedByRule: Array<{ name: string; rule: string }>;
};

/** Every platform id a spec targets: interests, behaviours and custom audiences. */
function targetedIds(spec: MetaTargetingSpec): Set<string> {
  const ids = new Set<string>();
  for (const ref of interestRefsOf(spec)) ids.add(ref.id);
  for (const ref of behaviorRefsOf(spec)) ids.add(ref.id);
  for (const ref of spec.custom_audiences ?? []) ids.add(ref.id);
  return ids;
}

/** Qué es nuevo: what the proposal adds that no ad set of the portfolio targets today —
 *  the chosen options and the seeds of the proposed spec, each checked against previous_spec
 *  and every OTHER enrolled ad set's spec. An option the current ad set already targets is
 *  neither new nor reused, so it is not listed. */
export function audienceNovelty(
  plan: AudienceProposalPlan,
  portfolioSpecs: readonly PortfolioAdsetSpec[],
): AudienceNovelty {
  const others = portfolioSpecs
    .filter((entry) => entry.adsetId !== plan.source.adset_id)
    .map((entry) => ({ name: entry.adsetName ?? entry.adsetId, ids: targetedIds(entry.spec) }));
  const live = targetedIds(plan.previous_spec);
  const fresh: AudienceNovelty['fresh'] = [];
  const reused: AudienceNovelty['reused'] = [];
  const seen = new Set<string>();
  const place = (id: string, name: string, kindLabel: string) => {
    if (seen.has(id) || live.has(id)) return;
    seen.add(id);
    const usedIn = others.filter((other) => other.ids.has(id)).map((other) => other.name);
    if (usedIn.length > 0) reused.push({ name, kindLabel, usedIn });
    else fresh.push({ name, kindLabel });
  };
  for (const option of chosenOptions(plan)) {
    if (option.id) place(option.id, option.name, KIND_LABEL[option.kind]);
  }
  for (const seed of plan.targeting_spec.custom_audiences ?? []) {
    place(seed.id, seed.name ?? seed.id, KIND_LABEL.custom_audience);
  }
  return {
    comparedAdsets: others.length,
    fresh,
    reused,
    excludedByRule: plan.options
      .filter((option) => option.blocked_by != null)
      .map((option) => ({ name: option.name, rule: option.blocked_by as string })),
  };
}

// ── Por qué / cómo ─────────────────────────────────────────────────────────────────────

const TRIGGER_LABEL: Record<string, string> = {
  F2_audience_saturation: 'Frecuencia saturada',
  F3_audience_exhausted: 'Alcance agotado',
};

export function triggerLabel(trigger: string): string {
  return TRIGGER_LABEL[trigger] ?? trigger;
}

export type ImplementationLine = { label: string; value: string };

/** Cómo se implementa: the new paused ad set beside the current one, its budget and the
 *  creatives it carries — from the plan, before anything is written. */
export function implementationLines(
  plan: AudienceProposalPlan,
  currency: string | null,
): ImplementationLine[] {
  const code = currency ?? plan.budget.currency;
  const source = plan.source.adset_name ?? plan.source.adset_id;
  const lines: ImplementationLine[] = [
    {
      label: 'Conjunto nuevo',
      value: `"${plan.adset_name}", pausado, junto a "${source}"${
        plan.mode === 'add'
          ? '; los dos siguen corriendo'
          : '; el actual se pausa cuando el nuevo esté activo'
      }`,
    },
    {
      label: 'Presupuesto',
      value: `${formatCurrency(majorUnits(plan.budget.suggested_minor_units), code)}/día · entre ${formatCurrency(
        majorUnits(plan.budget.bounds.min_minor_units),
        code,
      )} y ${formatCurrency(majorUnits(plan.budget.bounds.max_minor_units), code)}${
        plan.budget.note ? ` · ${plan.budget.note}` : ''
      }`,
    },
    {
      label: 'Anuncios',
      value:
        plan.creatives.length > 0
          ? `${plan.creatives.length} con resultados: ${plan.creatives
              .map((creative) => creative.ad_name ?? creative.ad_id)
              .join(', ')}`
          : 'Ninguno con resultados suficientes',
    },
    {
      label: 'Advantage+',
      value: `${plan.advantage_audience.enabled ? 'activo' : 'apagado'} · ${plan.advantage_audience.rationale}`,
    },
  ];
  if (plan.source.campaign_name) {
    lines.push({ label: 'Campaña', value: plan.source.campaign_name });
  }
  return lines;
}

// ── Figures ────────────────────────────────────────────────────────────────────────────

const compact = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${Math.round(n / 1_000)}K`
      : String(Math.round(n));

export function estimateLabel(estimate: AudienceSizeEstimate | null | undefined): string | null {
  if (!estimate) return null;
  if (estimate.lower === estimate.upper) return compact(estimate.lower);
  return `${compact(estimate.lower)}–${compact(estimate.upper)}`;
}

/** "120K → 1.4M (+11×)" or null when either side is missing. */
export function reachDeltaLabel(plan: AudienceProposalPlan): string | null {
  const current = plan.reach.current;
  const proposed = plan.reach.proposed;
  if (!current || !proposed) return null;
  const from = (current.lower + current.upper) / 2;
  const to = (proposed.lower + proposed.upper) / 2;
  if (from <= 0) return `${estimateLabel(current)} → ${estimateLabel(proposed)}`;
  const ratio = to / from;
  const delta =
    ratio >= 2
      ? `×${ratio.toFixed(1)}`
      : `${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%`;
  return `${estimateLabel(current)} → ${estimateLabel(proposed)} (${delta})`;
}

export function majorUnits(minor: number): number {
  return Math.round(minor) / 100;
}
export function minorUnits(major: number): number {
  return Math.round(major * 100);
}

export type ImplementedRow = { label: string; value: string };

/** "Qué se implementó" — from the read-back, never from the intent. */
export function implementedRows(
  result: AudienceProposalResult,
  plan: AudienceProposalPlan | null,
): ImplementedRow[] {
  const rows: ImplementedRow[] = [];
  if (result.campaign)
    rows.push({
      label: 'Campaña',
      value: `${result.campaign.name ?? ''} (${result.campaign.id})`.trim(),
    });
  if (result.adset) {
    const a = result.adset;
    rows.push({ label: 'Conjunto', value: `${a.name ?? ''} (${a.id})`.trim() });
    rows.push({ label: 'Estado', value: a.effective_status ?? a.status ?? '—' });
    if (a.daily_budget)
      rows.push({
        label: 'Presupuesto diario',
        value: `${majorUnits(Number(a.daily_budget))} (menor ${a.daily_budget})`,
      });
    if (a.optimization_goal) rows.push({ label: 'Objetivo', value: a.optimization_goal });
    if (a.billing_event) rows.push({ label: 'Evento de cobro', value: a.billing_event });
    if (a.bid_strategy) rows.push({ label: 'Puja', value: a.bid_strategy });
    if (a.targeting) {
      const spec = a.targeting as MetaTargetingSpec;
      rows.push({ label: 'Segmentación', value: audienceWords(spec) ?? '—' });
      const s = summarizeTargetingSpec(spec);
      if (s.interests.length) rows.push({ label: 'Intereses', value: s.interests.join(', ') });
      if (s.behaviors.length)
        rows.push({ label: 'Comportamientos', value: s.behaviors.join(', ') });
      if (s.customAudienceCount)
        rows.push({ label: 'Audiencias personalizadas', value: String(s.customAudienceCount) });
      rows.push({
        label: 'Advantage+',
        value:
          s.advantageAudience == null ? 'sin fijar' : s.advantageAudience ? 'activo' : 'apagado',
      });
    }
    if (a.promoted_object)
      rows.push({ label: 'Objeto promocionado', value: JSON.stringify(a.promoted_object) });
  }
  for (const ad of result.ads) {
    const source = ad.source_adset_name ?? ad.source_adset_id;
    rows.push({
      label: 'Anuncio',
      value: `${ad.name ?? ad.id} (${ad.id}) · ${ad.effective_status ?? ad.status ?? '—'} · creativo ${ad.creative_id ?? '?'}${source ? ` · de ${source}` : ''}`,
    });
  }
  if (result.source_adset) {
    rows.push({
      label: 'Conjunto origen',
      value: `${result.source_adset.name ?? result.source_adset.id} · ${result.source_adset.paused ? `pausado (antes ${result.source_adset.prior_status ?? '?'})` : `sigue ${result.source_adset.status_after ?? result.source_adset.prior_status ?? 'como estaba'}`}${result.source_adset.note ? ` · ${result.source_adset.note}` : ''}`,
    });
  }
  if (result.activation) {
    rows.push({
      label: 'Activación',
      value: result.activation.requested
        ? `pedida · conjunto ${result.activation.adset_status_after ?? '?'} · anuncios ${result.activation.ads_status_after.join(', ') || '—'}`
        : 'no pedida (creado pausado)',
    });
  }
  if (plan)
    rows.push({
      label: 'Modo',
      value: plan.mode === 'replace' ? 'Reemplaza la audiencia actual' : 'Suma una audiencia nueva',
    });
  return rows;
}
