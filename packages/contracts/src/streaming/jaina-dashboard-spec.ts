// What a saved dashboard would need to be re-run for another window.
//
// Nothing a dashboard row used to carry was re-runnable: `dataset_id` is a hash of the tool
// call's inputs that only the run that made it can resolve, `provenance.period` is empty on
// blocks whose tool answered with a window label instead of dates, and no tool-call log is
// kept. This spec is the structured statement, per block, of the call that produced it —
// the tool, the entity it was asked about, the metric keys it carries and the window it was
// computed for — plus which blocks are DERIVED: severity judgements, pacing ratios and
// comparison baselines are computed against the old window, so re-dating them is a
// recompute, never a re-fetch of the numbers.
//
// It is derived from what the block already states about itself and never guessed: a block
// whose tool, entity or window is not on record is kept with `spec: null` and the reason.
// The picker that re-runs a spec is a later step; this is the prerequisite it reads.

import { z } from 'zod';
import {
  customRange,
  type RangePreset,
  type RangeSpec,
  rangeSpecSchema,
} from '../optimization/range';
import {
  actionEntityLevelSchema,
  type BlockCategory,
  blockCategorySchema,
  type CheckpointBlockV2Lenient,
} from './jaina-report';

export const DASHBOARD_SPEC_VERSION = 1;

/** Which part of a block is computed against its window rather than fetched for it. */
export const dashboardDerivedSchema = z.enum(['severity', 'pacing', 'comparison']);
export type DashboardDerived = z.infer<typeof dashboardDerivedSchema>;

export const dashboardBlockRunSpecSchema = z.object({
  /** The Jaina tool that fetched the block's data, e.g. "get_top_ads". */
  tool: z.string().min(1),
  entity: z.object({
    /** The id the tool takes: an ad account as `act_<id>`, or a Meta entity id. */
    id: z.string().min(1),
    level: actionEntityLevelSchema,
    name: z.string().min(1),
  }),
  /** The metric keys the block carries; empty on prose blocks. */
  metrics: z.array(z.string()),
  /** The window the block was computed for. */
  range: rangeSpecSchema,
  derived: dashboardDerivedSchema.nullable(),
});
export type DashboardBlockRunSpec = z.infer<typeof dashboardBlockRunSpecSchema>;

export const dashboardBlockSpecSchema = z
  .object({
    block_id: z.string().min(1),
    category: blockCategorySchema,
    spec: dashboardBlockRunSpecSchema.nullable(),
    /** Why the block could not be described; null exactly when `spec` is present. */
    reason: z.string().min(1).nullable(),
  })
  .refine((block) => (block.spec === null) !== (block.reason === null), {
    message: 'a block spec carries either a spec or the reason it has none',
  });
export type DashboardBlockSpec = z.infer<typeof dashboardBlockSpecSchema>;

export const dashboardSpecSchema = z.object({
  version: z.literal(DASHBOARD_SPEC_VERSION),
  blocks: z.array(dashboardBlockSpecSchema),
});
export type DashboardSpec = z.infer<typeof dashboardSpecSchema>;

// ---------------------------------------------------------------------------
// Jaina's window labels → the shared range vocabulary.
//
// Three vocabularies name a window today: the optimizer's RangeSpec presets, Jaina's
// `requested_label` (a Meta date preset such as `last_30d`, the engine's `d30`, or the
// legacy `7d`), and the Backend's Meta preset list. Only the trailing-day labels have a
// preset here; a calendar preset (`this_month`, `last_quarter`) is re-runnable only through
// the concrete dates the block recorded, and a lifetime read has no window at all.
// ---------------------------------------------------------------------------

const JAINA_WINDOW_LABELS: Readonly<Record<string, RangePreset>> = Object.freeze({
  d3: 'd3',
  d7: 'd7',
  d14: 'd14',
  d30: 'd30',
  '3d': 'd3',
  '7d': 'd7',
  '14d': 'd14',
  '30d': 'd30',
  last_3d: 'd3',
  last_7d: 'd7',
  last_14d: 'd14',
  last_30d: 'd30',
});

export function rangeFromJainaWindowLabel(label: string | null | undefined): RangeSpec | null {
  if (typeof label !== 'string') return null;
  const preset = JAINA_WINDOW_LABELS[label.trim().toLowerCase()];
  return preset ? { kind: 'preset', preset } : null;
}

/** A block's recorded period → the window it was computed for. Concrete dates win over the
 *  label, because they are what was actually read. */
export function rangeFromJainaPeriod(
  period:
    | { since?: string | null; until?: string | null; requested_label?: string | null }
    | null
    | undefined,
): RangeSpec | null {
  if (!period) return null;
  return (
    customRange(period.since, period.until) ?? rangeFromJainaWindowLabel(period.requested_label)
  );
}

// ---------------------------------------------------------------------------
// Derivation from a persisted block. Blocks are read leniently — a saved row keeps them
// verbatim — so every field is narrowed before it is trusted.
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Rec) : null;
const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** A block whose category is never a fetch: it is composed from the others, or asked. */
const NOT_A_FETCH: Partial<Record<BlockCategory, string>> = {
  data_scope: 'the scope frame is composed from the other blocks, not fetched',
  survey: 'a survey is a question to the reader, not a fetch',
};

const DERIVED_BY_CATEGORY: Record<BlockCategory, DashboardDerived | null> = {
  narrative: 'severity',
  insight_list: 'severity',
  actions: 'severity',
  comparison: 'comparison',
  goal_pacing: 'pacing',
  metric_grid: null,
  chart: null,
  data_table: null,
  data_scope: null,
  survey: null,
};

const ACCOUNT_LABEL = /^(?:act_|account-)(\d+)$/i;

type Derivation = { spec: DashboardBlockRunSpec } | { reason: string };

function toolOf(block: Rec, provenance: Rec | null): { tool: string } | { reason: string } {
  const fromProvenance = str(provenance?.tool);
  if (fromProvenance) return { tool: fromProvenance };
  const cited = [
    ...new Set(
      arr(block.citations)
        .map((citation) => str(rec(citation)?.tool))
        .filter((tool): tool is string => tool !== null),
    ),
  ];
  if (cited.length === 1) return { tool: cited[0] as string };
  if (cited.length > 1) return { reason: `cites ${cited.length} tools (${cited.join(', ')})` };
  return { reason: 'no tool recorded' };
}

/** The one ad account every per-row/per-point meta entry names, when they all agree. */
function accountFromMeta(block: Rec): string | null {
  const entries = [...arr(block.row_meta), ...arr(block.data_meta)].map(rec);
  if (entries.length === 0) return null;
  const ids = new Set(entries.map((entry) => str(entry?.ad_account_id)));
  if (ids.size !== 1) return null;
  const [only] = ids;
  return only ?? null;
}

function entityOf(
  block: Rec,
  provenance: Rec | null,
): { entity: DashboardBlockRunSpec['entity'] } | { reason: string } {
  const label = str(provenance?.entity_label);
  const account = label?.match(ACCOUNT_LABEL)?.[1];
  if (label && account) return { entity: { id: `act_${account}`, level: 'account', name: label } };
  const fromMeta = accountFromMeta(block);
  if (fromMeta) return { entity: { id: fromMeta, level: 'account', name: label ?? fromMeta } };
  if (label) return { reason: `entity "${label}" carries no id` };
  return { reason: 'no entity recorded' };
}

function rangeOf(block: Rec, provenance: Rec | null): { range: RangeSpec } | { reason: string } {
  const period = rec(provenance?.period);
  const fromPeriod = rangeFromJainaPeriod(
    period
      ? {
          since: str(period.since),
          until: str(period.until),
          requested_label: str(period.requested_label),
        }
      : null,
  );
  if (fromPeriod) return { range: fromPeriod };
  if (block.category === 'goal_pacing') {
    const flight = customRange(str(block.period_start), str(block.period_end));
    if (flight) return { range: flight };
  }
  const label = str(period?.requested_label);
  return {
    reason: label
      ? `window "${label}" has no dates on record and no trailing-day preset`
      : 'no window recorded',
  };
}

function metricsOf(block: Rec): string[] {
  switch (block.category) {
    case 'metric_grid':
      return arr(block.metrics)
        .map((metric) => str(rec(metric)?.label))
        .filter((label): label is string => label !== null);
    case 'chart':
      return Object.keys(rec(block.chart_config) ?? {});
    case 'data_table':
      return arr(block.columns)
        .map((column) => str(rec(column)?.key))
        .filter((key): key is string => key !== null);
    case 'comparison':
      return arr(block.pairs)
        .map((pair) => str(rec(pair)?.label))
        .filter((label): label is string => label !== null);
    default:
      return [];
  }
}

function derive(block: Rec, category: BlockCategory): Derivation {
  const notAFetch = NOT_A_FETCH[category];
  if (notAFetch) return { reason: notAFetch };
  const provenance = rec(block.provenance);
  const tool = toolOf(block, provenance);
  if ('reason' in tool) return tool;
  const entity = entityOf(block, provenance);
  if ('reason' in entity) return entity;
  const range = rangeOf(block, provenance);
  if ('reason' in range) return range;
  // A model-authored block cannot be re-fetched whatever its category: its figures were
  // written against the old window and must be recomputed.
  const derived = provenance?.source === 'model' ? 'severity' : DERIVED_BY_CATEGORY[category];
  return {
    spec: {
      tool: tool.tool,
      entity: entity.entity,
      metrics: metricsOf(block),
      range: range.range,
      derived,
    },
  };
}

/**
 * The spec for a report's blocks as they are about to be saved. Every block gets an entry,
 * in order, so a reopen can pair each rendered block with what it would take to re-run it.
 */
export function deriveDashboardSpec(blocks: readonly CheckpointBlockV2Lenient[]): DashboardSpec {
  return {
    version: DASHBOARD_SPEC_VERSION,
    blocks: blocks.map((block, index) => {
      const record = block as Rec;
      const category = block.category;
      const blockId = str(record.block_id) ?? `block_${index}`;
      const derivation = derive(record, category);
      return 'spec' in derivation
        ? { block_id: blockId, category, spec: derivation.spec, reason: null }
        : { block_id: blockId, category, spec: null, reason: derivation.reason };
    }),
  };
}
