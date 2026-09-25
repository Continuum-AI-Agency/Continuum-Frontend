// OWNED BY the three_numbers agent — only that agent edits this file. See
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md for the recipe.
/**
 * `three_numbers` (approved idea 13, "Tres números que importan") — "¿cómo vamos este mes?",
 * "¿cuánto gastamos?", "¿cuántos leads llevamos?". The answer is three numbers for the account
 * over the asked window — spend, results (the kind the objective buys) and cost per result —
 * each with its change against the same-length window before it when that window was read.
 * The hero is the daily spend (a line), or the three numbers as bars when no daily series was
 * read; "found" derives each number (one item per number, badged with it) over a table of the
 * campaigns behind them.
 */

import type { z } from 'zod';
import {
  type AnswerTemplatePayload,
  STEP_SECTION_KINDS,
  type TemplateSpec,
  templatePayloadSchemaFor,
} from './core';

const HERO_CHART_KINDS = ['line', 'bar'] as const;

/** The three figures the answer is about, in the order the reader sees them. */
export const THREE_NUMBERS_FIGURE_IDS = ['spend', 'results', 'cpr'] as const;

const base = templatePayloadSchemaFor({
  id: 'three_numbers',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: HERO_CHART_KINDS,
});

export const threeNumbersPayloadSchema: z.ZodType<AnswerTemplatePayload> = base.superRefine(
  (payload, ctx) => {
    const ids = new Set(payload.figures.map((figure) => figure.id));
    for (const id of THREE_NUMBERS_FIGURE_IDS) {
      if (!ids.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['figures'],
          message: `three_numbers needs the figure "${id}"`,
        });
      }
    }
    const found = payload.justification.sections.find((section) => section.kind === 'found');
    if (!found) return;
    const badges = found.items.map((item) => item.badge_figure_id);
    if (THREE_NUMBERS_FIGURE_IDS.some((id, index) => badges[index] !== id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['justification', 'sections'],
        message: 'three_numbers derives spend, results and cpr in "found", one item each, in order',
      });
    }
    if (found.table === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['justification', 'sections'],
        message: 'three_numbers shows the campaigns behind the numbers as a table in "found"',
      });
    }
  },
);

export const threeNumbersSpec: TemplateSpec = {
  id: 'three_numbers',
  title: 'Tres números que importan',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: HERO_CHART_KINDS,
  payloadSchema: threeNumbersPayloadSchema,
};
