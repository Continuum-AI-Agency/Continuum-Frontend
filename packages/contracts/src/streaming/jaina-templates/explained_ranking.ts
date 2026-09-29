/**
 * `explained_ranking` (approved idea 7, "Ranking que se explica") — "¿qué campaña rinde
 * mejor?", "mejores / peores", "top". The order goes on top as a horizontal bar chart of
 * cost per result against the account average; the justification is one expandable row per
 * ranked entity saying why it sits where it does, and the method (what the order is by, the
 * minimum volume to be ranked, whether ordering by volume changes the winner).
 */

import { z } from 'zod';
import {
  type AnswerTemplatePayload,
  STEP_SECTION_KINDS,
  type TemplateSpec,
  templatePayloadSchemaFor,
} from './core';

const base = templatePayloadSchemaFor({
  id: 'explained_ranking',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: ['bar_horizontal'],
});

/** A ranking needs at least two ranked rows, and the hero chart plots them against a reference. */
export const explainedRankingPayloadSchema: z.ZodType<AnswerTemplatePayload> = base.superRefine(
  (payload, ctx) => {
    const found = payload.justification.sections.find((section) => section.kind === 'found');
    if (found && found.items.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['justification', 'sections'],
        message: 'explained_ranking needs at least two ranked rows in "found"',
      });
    }
    const hero = payload.executive.hero_chart;
    if (hero && hero.reference === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['executive', 'hero_chart', 'reference'],
        message: 'explained_ranking plots the rows against the account average',
      });
    }
  },
);

export const explainedRankingSpec: TemplateSpec = {
  id: 'explained_ranking',
  title: 'Ranking que se explica',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: ['bar_horizontal'],
  payloadSchema: explainedRankingPayloadSchema,
};

