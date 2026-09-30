// OWNED BY the spend_results_balance agent — only that agent edits this file. See
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md for the recipe.
/**
 * `spend_results_balance` (approved idea 15, "Balanza de gasto contra resultados") — "¿estamos
 * repartiendo bien el presupuesto?", "¿dónde se va el dinero y dónde salen los resultados?".
 *
 * The hero is two 100% stacked bars joined by bands: the share of spend each campaign takes,
 * over the share of results it brings. There is no stacked chart kind, so the pair travels as a
 * `bar_horizontal` whose points are the spend shares first and the result shares second, in the
 * same order and under the same labels — a renderer that does not know the design still draws
 * every share as a bar. The justification's `found` carries the table (spend share, results
 * share, index = results share ÷ spend share); `why` carries two panels: whether the campaign
 * type is ruled out, and the size of the gap.
 */

import type { z } from 'zod';
import {
  type AnswerTemplatePayload,
  STEP_SECTION_KINDS,
  type TemplateSpec,
  templatePayloadSchemaFor,
} from './core';

/** Fewer campaigns than this and there is no split to judge. */
export const SPEND_RESULTS_BALANCE_MIN_ROWS = 3;

const base = templatePayloadSchemaFor({
  id: 'spend_results_balance',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: ['bar_horizontal'],
});

export const spendResultsBalancePayloadSchema: z.ZodType<AnswerTemplatePayload> = base.superRefine(
  (payload, ctx) => {
    const hero = payload.executive.hero_chart;
    if (hero) {
      const half = hero.points.length / 2;
      const spendLabels = hero.points.slice(0, half).map((point) => point.label);
      const resultLabels = hero.points.slice(half).map((point) => point.label);
      if (
        !Number.isInteger(half) ||
        half < SPEND_RESULTS_BALANCE_MIN_ROWS ||
        spendLabels.some((label, index) => label !== resultLabels[index])
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['executive', 'hero_chart', 'points'],
          message: `spend_results_balance plots ${SPEND_RESULTS_BALANCE_MIN_ROWS}+ spend shares, then the result shares of the same rows in the same order`,
        });
      }
    }
    const found = payload.justification.sections.find((section) => section.kind === 'found');
    if (found && (found.table?.rows.length ?? 0) < SPEND_RESULTS_BALANCE_MIN_ROWS) {
      ctx.addIssue({
        code: 'custom',
        path: ['justification', 'sections'],
        message: `spend_results_balance needs the share table in "found" (${SPEND_RESULTS_BALANCE_MIN_ROWS}+ rows)`,
      });
    }
    const why = payload.justification.sections.find((section) => section.kind === 'why');
    if (why && why.items.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['justification', 'sections'],
        message: 'spend_results_balance needs the rule-out and the gap panels in "why"',
      });
    }
  },
);

export const spendResultsBalanceSpec: TemplateSpec = {
  id: 'spend_results_balance',
  title: 'Balanza de gasto contra resultados',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: ['bar_horizontal'],
  payloadSchema: spendResultsBalancePayloadSchema,
};
