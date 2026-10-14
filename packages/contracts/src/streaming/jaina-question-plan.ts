import { z } from 'zod';

/**
 * The vocabulary of Jaina's question plan (jaina-prism PRD §3.2–§3.3, Prism's method in our
 * words). Depth comes from what a question ASKS — a cause, a consequence, a recommendation —
 * read by a model, never from phrases like "breve" or "en detalle" (Ramiro, decision 2). The
 * depth rubric that grades an answer and the planner that will produce the plan read the
 * same lists, so the grade and the plan cannot drift.
 */

/** When unsure the planner chooses `diagnostic`: the intent of a question beats its wording. */
export const JAINA_QUESTION_CLASSES = ['lookup', 'compare', 'diagnostic', 'optimization'] as const;
export const jainaQuestionClassSchema = z.enum(JAINA_QUESTION_CLASSES);
export type JainaQuestionClass = z.infer<typeof jainaQuestionClassSchema>;

/** What a question asks for; one question may ask several. */
export const JAINA_ASKS = [
  'figure',
  'comparison',
  'cause',
  'consequence',
  'motive',
  'recommendation',
  'steps',
  'projection',
  'list',
  'ranking',
  'trend',
] as const;
export const jainaAskSchema = z.enum(JAINA_ASKS);
export type JainaAsk = z.infer<typeof jainaAskSchema>;

/** The layers of an account a plan reads, top down (§3.3). */
export const JAINA_LAYERS = [
  'account_totals',
  'campaign_scoreboard',
  'top_movers',
  'adset_audience',
  'placement_device_geo',
  'creative_tier',
  'waste',
  'pacing',
  'change_history',
  'conversion_settling',
] as const;
export const jainaLayerSchema = z.enum(JAINA_LAYERS);
export type JainaLayer = z.infer<typeof jainaLayerSchema>;

/**
 * Whether a class reads a layer: always, only when the question names an entity at that
 * level (`named`), only when it is about budget (`budget`), or never. The §3.3 table.
 */
type LayerRule = 'always' | 'named' | 'budget' | 'never';

const LAYER_RULES: Record<JainaLayer, Record<JainaQuestionClass, LayerRule>> = {
  account_totals: {
    lookup: 'always',
    compare: 'always',
    diagnostic: 'always',
    optimization: 'always',
  },
  campaign_scoreboard: {
    lookup: 'named',
    compare: 'always',
    diagnostic: 'always',
    optimization: 'always',
  },
  top_movers: { lookup: 'never', compare: 'always', diagnostic: 'always', optimization: 'always' },
  adset_audience: {
    lookup: 'never',
    compare: 'named',
    diagnostic: 'always',
    optimization: 'always',
  },
  placement_device_geo: {
    lookup: 'never',
    compare: 'never',
    diagnostic: 'always',
    optimization: 'always',
  },
  creative_tier: {
    lookup: 'never',
    compare: 'never',
    diagnostic: 'always',
    optimization: 'always',
  },
  waste: { lookup: 'never', compare: 'never', diagnostic: 'always', optimization: 'always' },
  pacing: { lookup: 'never', compare: 'never', diagnostic: 'budget', optimization: 'always' },
  change_history: {
    lookup: 'never',
    compare: 'never',
    diagnostic: 'always',
    optimization: 'always',
  },
  conversion_settling: {
    lookup: 'never',
    compare: 'never',
    diagnostic: 'always',
    optimization: 'always',
  },
};

/** The entity levels a question names, and whether it is about budget: the table's conditions. */
export interface LayerConditions {
  namedLevels?: ReadonlyArray<'campaign' | 'adset' | 'ad'>;
  aboutBudget?: boolean;
}

const NAMED_LEVEL_OF: Partial<Record<JainaLayer, 'campaign' | 'adset'>> = {
  campaign_scoreboard: 'campaign',
  adset_audience: 'adset',
};

/** The layers a class must read before its evidence is sufficient (§3.3, §3.5). */
export const mandatedLayersOf = (
  questionClass: JainaQuestionClass,
  conditions: LayerConditions = {},
): JainaLayer[] =>
  JAINA_LAYERS.filter((layer) => {
    const rule = LAYER_RULES[layer][questionClass];
    if (rule === 'always') return true;
    if (rule === 'budget') return conditions.aboutBudget === true;
    if (rule === 'named') {
      const level = NAMED_LEVEL_OF[layer];
      return level !== undefined && (conditions.namedLevels ?? []).includes(level);
    }
    return false;
  });

/**
 * The hypotheses a movement in cost per result opens (§3.3). Cost per result =
 * CPM ÷ (1000 × CTR × CVR); each one ends confirmed, rejected or waived with its reason.
 */
export const JAINA_HYPOTHESES = [
  'mix_vs_efficiency',
  'cpm',
  'ctr',
  'cvr',
  'settling',
  'recent_edit',
  'fatigue',
] as const;
export const jainaHypothesisSchema = z.enum(JAINA_HYPOTHESES);
export type JainaHypothesis = z.infer<typeof jainaHypothesisSchema>;

/** The classes whose answers must close the hypotheses: a why or a what-to-do. */
export const classOpensHypotheses = (questionClass: JainaQuestionClass): boolean =>
  questionClass === 'diagnostic' || questionClass === 'optimization';

/** A question's hand label in an eval corpus: the ground truth the planner is graded against. */
export const jainaDepthLabelSchema = z.object({
  class: jainaQuestionClassSchema,
  asks: z.array(jainaAskSchema).min(1),
  named_levels: z.array(z.enum(['campaign', 'adset', 'ad'])).default([]),
  about_budget: z.boolean().default(false),
});
export type JainaDepthLabel = z.infer<typeof jainaDepthLabelSchema>;
