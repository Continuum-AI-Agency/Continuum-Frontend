import { z } from 'zod';
import {
  classOpensHypotheses,
  JAINA_HYPOTHESES,
  type JainaDepthLabel,
  type JainaLayer,
  jainaAskSchema,
  jainaHypothesisSchema,
  mandatedLayersOf,
} from './jaina-question-plan';

/**
 * The depth rubric (jaina-prism PRD §5.0). An answer is as deep as the question calls for when:
 *
 *   1. every `asks` item is answered            — judged by a reader
 *   2. every hypothesis a why opens is closed   — judged, diagnostic and optimization only
 *   3. every mandated layer was read            — scoped receipt proof in Phase 2
 *   4. every action is fully specified          — from the actions block rows
 *
 * Each part is a fraction in [0, 1]; a part that does not apply is null and the score is the
 * mean of the parts that do. Depth is graded from the question's hand label, never from its
 * words. It lives here so the golden grader and the Performance+ grader read one rubric, and
 * the planner reads the same layer map.
 */

/**
 * Candidate sources for each layer of the §3.3 table. Phase 2 validates actual read scope,
 * windows and datasets before supplying scoped proof; a successful name is insufficient. Only tools the strategist can call are listed (the
 * registry in `Jaina/src/tools/tools.ts` plus the Optimizer core band): a name nobody can call
 * would make a layer unreadable by construction. `change_history` is read from the platforms'
 * own logs — Meta's ad-account activity log, Google's change_event (jaina-prism Phase 2); the
 * Optimizer's applied actions are provenance beside them, never a substitute for either.
 */
export const LAYER_TOOLS: Record<JainaLayer, readonly string[]> = {
  account_totals: [
    'get_key_metrics',
    'get_ad_account_insights',
    'get_meta_overview_summary',
    'get_google_ads_overview',
  ],
  campaign_scoreboard: [
    'get_campaigns',
    'get_campaign_batch_analysis',
    'get_key_metrics',
    'get_top_google_campaigns',
  ],
  top_movers: [
    'get_campaign_daily_trends',
    'get_trend_metrics_summary',
    'get_top_google_campaigns',
  ],
  adset_audience: ['get_ad_sets', 'get_top_adsets', 'get_top_google_ad_groups'],
  placement_device_geo: [
    'get_breakdown_insights_summary',
    'get_audience_demographics',
    'get_google_breakdown_insights',
  ],
  creative_tier: [
    'get_ads',
    'get_top_ads',
    'get_top_ads_batch',
    'get_paid_creative_intel',
    'get_ad_creative_details',
    'get_ad_creative_details_batch',
    'get_live_creative_audience_matrix',
    'get_top_google_ads',
  ],
  waste: [
    'get_ad_sets',
    'get_top_adsets',
    'get_ads',
    'get_top_ads',
    'get_top_ads_batch',
    'get_top_google_ad_groups',
    'get_top_google_ads',
  ],
  // A daily-pool preview has no flight; only actual persisted pacing can evidence this layer.
  pacing: ['get_optimizer_performance'],
  change_history: ['get_meta_change_history', 'get_google_change_history'],
  // Repeated as-of observations, not a single daily snapshot or an attribution horizon.
  conversion_settling: ['get_conversion_settling'],
};

/** Frozen Phase 1 measurement for recorded-baseline comparison only. It is deliberately
 * separate from the current read surface; Phase 2 never falls back to this map. */
const LEGACY_LAYER_TOOLS: Record<JainaLayer, readonly string[]> = {
  account_totals: ['get_key_metrics', 'get_ad_account_insights', 'get_meta_overview_summary'],
  campaign_scoreboard: ['get_campaigns'],
  top_movers: ['get_campaign_daily_trends', 'get_trend_metrics_summary'],
  adset_audience: ['get_ad_sets', 'get_top_adsets'],
  placement_device_geo: ['get_breakdown_insights_summary', 'get_audience_demographics'],
  creative_tier: [
    'get_ads',
    'get_top_ads',
    'get_top_ads_batch',
    'get_paid_creative_intel',
    'get_ad_creative_details',
    'get_ad_creative_details_batch',
    'get_live_creative_audience_matrix',
  ],
  // Waste is zero results above the spend threshold, read off the ad set and ad rows.
  waste: ['get_ad_sets', 'get_top_adsets', 'get_ads', 'get_top_ads', 'get_top_ads_batch'],
  pacing: ['preview_optimizer_cycle', 'get_optimizer_performance'],
  change_history: ['get_meta_change_history', 'get_google_change_history'],
  // Settling needs the last days one by one: are recent conversions still arriving?
  conversion_settling: ['get_campaign_daily_trends'],
};

/** Every read that can evidence one of `layers`, de-duplicated: the plan's tool surface (§3.3). */
export const toolsForLayers = (layers: readonly JainaLayer[]): string[] => [
  ...new Set(layers.flatMap((layer) => LAYER_TOOLS[layer])),
];

/** Counts are produced by the trusted runtime/evaluator after validating each required read. */
export interface ScopedLayerProof {
  layer: JainaLayer;
  required_reads: number;
  satisfied_reads: number;
}
export type DepthLayerMethod = 'phase2_scoped_receipts' | 'legacy_tool_names';

/** Supplying scoped proof, including [], prevents any fallback to tool names. */
export const layersReadBy = (
  layers: readonly JainaLayer[],
  okToolNames: ReadonlySet<string>,
  scopedLayerProof?: readonly ScopedLayerProof[],
): JainaLayer[] =>
  scopedLayerProof === undefined
    ? layers.filter((layer) => LEGACY_LAYER_TOOLS[layer].some((tool) => okToolNames.has(tool)))
    : layers.filter((layer) => {
        const proof = scopedLayerProof.filter((entry) => entry.layer === layer);
        return (
          proof.length === 1 &&
          Number.isSafeInteger(proof[0]!.required_reads) &&
          proof[0]!.required_reads > 0 &&
          proof[0]!.satisfied_reads === proof[0]!.required_reads
        );
      });

/** What a reader says about the two parts only a reader can see. Flat, string enums only. */
export const depthJudgementSchema = z.object({
  asks: z.array(z.object({ ask: jainaAskSchema, answered: z.boolean() })),
  hypotheses: z.array(
    z.object({
      hypothesis: jainaHypothesisSchema,
      status: z.enum(['confirmed', 'rejected', 'waived', 'not_tested']),
    }),
  ),
});
export type DepthJudgement = z.infer<typeof depthJudgementSchema>;

export interface DepthVerdict {
  layer_method: DepthLayerMethod;
  mandated: JainaLayer[];
  read: JainaLayer[];
  missing: JainaLayer[];
  actions: { total: number; specified: number; unspecified: string[] };
  parts: {
    asks: number | null;
    hypotheses: number | null;
    layers: number | null;
    actions: number | null;
  };
  /** Mean of the parts that apply; null when none does. */
  score: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const filled = (value: unknown): boolean =>
  (typeof value === 'string' && value.trim().length > 0) || typeof value === 'number';

/**
 * Entity, metric, size and window: what an action needs before an Optimizer card can be made
 * from it. Returns the missing parts' names, empty when the row is fully specified.
 */
export const missingActionParts = (row: unknown): string[] => {
  if (!isRecord(row)) return ['entity', 'metric', 'size', 'window'];
  const entity = isRecord(row.entity) ? row.entity : {};
  const evidence = isRecord(row.evidence) ? row.evidence : {};
  const missing: string[] = [];
  if (!filled(entity.name) || entity.level === null || entity.level === undefined) {
    missing.push('entity');
  }
  if (!filled(evidence.metric) || !filled(evidence.value)) missing.push('metric');
  if (!filled(row.sizing)) missing.push('size');
  if (!filled(evidence.window)) missing.push('window');
  return missing;
};

const actionRowsOf = (blocks: readonly unknown[]): unknown[] =>
  blocks.flatMap((block) =>
    isRecord(block) && block.category === 'actions' && Array.isArray(block.rows) ? block.rows : [],
  );

const fraction = (part: number, whole: number): number | null =>
  whole === 0 ? null : part / whole;

const TERMINAL = new Set(['confirmed', 'rejected', 'waived']);

export const depthVerdictOf = (input: {
  label: JainaDepthLabel;
  okToolNames: ReadonlySet<string>;
  scopedLayerProof?: readonly ScopedLayerProof[];
  blocks: readonly unknown[];
  judgement: DepthJudgement | null;
}): DepthVerdict => {
  const { label, judgement } = input;
  const mandated = mandatedLayersOf(label.class, {
    namedLevels: label.named_levels,
    aboutBudget: label.about_budget,
  });
  const read = layersReadBy(mandated, input.okToolNames, input.scopedLayerProof);
  const missing = mandated.filter((layer) => !read.includes(layer));

  const rows = actionRowsOf(input.blocks);
  const gaps = rows.map(missingActionParts);
  const specified = gaps.filter((parts) => parts.length === 0).length;
  const unspecified = gaps.flatMap((parts, i) =>
    parts.length > 0 ? [`row ${i + 1}: no ${parts.join(', ')}`] : [],
  );
  // A recommendation with no action row is an action that was never specified.
  const actions = label.asks.includes('recommendation')
    ? rows.length === 0
      ? 0
      : specified / rows.length
    : fraction(specified, rows.length);

  const asked = new Set(label.asks);
  const asks = judgement
    ? fraction(judgement.asks.filter((a) => asked.has(a.ask) && a.answered).length, asked.size)
    : null;
  const hypotheses =
    judgement && classOpensHypotheses(label.class)
      ? judgement.hypotheses.filter((h) => TERMINAL.has(h.status)).length / JAINA_HYPOTHESES.length
      : null;

  const parts = { asks, hypotheses, layers: fraction(read.length, mandated.length), actions };
  const applicable = Object.values(parts).filter((part): part is number => part !== null);
  return {
    layer_method:
      input.scopedLayerProof === undefined ? 'legacy_tool_names' : 'phase2_scoped_receipts',
    mandated,
    read,
    missing,
    actions: { total: rows.length, specified, unspecified },
    parts,
    score:
      applicable.length === 0
        ? null
        : applicable.reduce((sum, p) => sum + p, 0) / applicable.length,
  };
};

const pct = (part: number | null): string => (part === null ? 'n/a' : `${Math.round(part * 100)}%`);

/** One line for a report: the score and what pulled it down. */
export const describeDepth = (verdict: DepthVerdict): string => {
  if (verdict.score === null) return 'depth: not graded';
  const { asks, hypotheses, layers, actions } = verdict.parts;
  return (
    `depth ${pct(verdict.score)} · asks ${pct(asks)} · hypotheses ${pct(hypotheses)} · ` +
    `layers ${pct(layers)} [${verdict.layer_method}]${verdict.missing.length ? ` (unread: ${verdict.missing.join(', ')})` : ''} · ` +
    `actions ${pct(actions)}${verdict.actions.unspecified.length ? ` (${verdict.actions.unspecified[0]})` : ''}`
  );
};

export interface DepthSummary {
  layer_methods: Partial<Record<DepthLayerMethod, number>>;
  graded: number;
  mean: number | null;
  byClass: Partial<Record<JainaDepthLabel['class'], { graded: number; mean: number }>>;
}

/** Mean depth over the graded tasks, overall and per class: the number each phase moves. */
export const depthSummaryOf = (
  runs: ReadonlyArray<{ label: JainaDepthLabel | undefined; depth: DepthVerdict | null }>,
): DepthSummary => {
  const scored = runs.flatMap((run) =>
    run.label && run.depth?.score != null
      ? [
          {
            cls: run.label.class,
            score: run.depth.score,
            method: run.depth.layer_method ?? ('legacy_tool_names' as DepthLayerMethod),
          },
        ]
      : [],
  );
  const mean = (scores: number[]): number => scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const byClass: DepthSummary['byClass'] = {};
  for (const cls of new Set(scored.map((s) => s.cls))) {
    const scores = scored.filter((s) => s.cls === cls).map((s) => s.score);
    byClass[cls] = { graded: scores.length, mean: mean(scores) };
  }
  const layerMethods: DepthSummary['layer_methods'] = {};
  for (const row of scored) layerMethods[row.method] = (layerMethods[row.method] ?? 0) + 1;
  return {
    layer_methods: layerMethods,
    graded: scored.length,
    mean: scored.length ? mean(scored.map((s) => s.score)) : null,
    byClass,
  };
};

export const describeDepthSummary = (summary: DepthSummary): string => {
  if (summary.mean === null) return 'depth n/a (no labelled task graded)';
  const classes = Object.entries(summary.byClass)
    .map(([cls, s]) => `${cls} ${pct(s.mean)} (${s.graded})`)
    .join(' · ');
  const methods = Object.entries(summary.layer_methods ?? {})
    .map(([method, count]) => `${method} (${count})`)
    .join(', ');
  return `depth ${pct(summary.mean)} over ${summary.graded} task(s) · ${classes}${methods ? ` · layer measurement: ${methods}` : ''}`;
};
