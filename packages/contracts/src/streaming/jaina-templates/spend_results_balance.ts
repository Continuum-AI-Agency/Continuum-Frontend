// OWNED BY the spend_results_balance agent — only that agent edits this file. See
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md for the recipe.
/**
 * `spend_results_balance` (approved idea 15, "Balanza de gasto contra resultados"). STUB: the shared shape and the `steps`
 * sections only. The owning agent tightens this schema to what the template renders (its
 * hero chart kind, the tables and items its sections need) in the same change that ships
 * its composer and renderer.
 */

import type { z } from 'zod';
import {
  type AnswerTemplatePayload,
  STEP_SECTION_KINDS,
  type TemplateSpec,
  templatePayloadSchemaFor,
} from './core';

export const spendResultsBalancePayloadSchema: z.ZodType<AnswerTemplatePayload> = templatePayloadSchemaFor({
  id: 'spend_results_balance',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: null,
});

export const spendResultsBalanceSpec: TemplateSpec = {
  id: 'spend_results_balance',
  title: 'Balanza de gasto contra resultados',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: null,
  payloadSchema: spendResultsBalancePayloadSchema,
};
