// OWNED BY the three_numbers agent — only that agent edits this file. See
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md for the recipe.
/**
 * `three_numbers` (approved idea 13, "Tres números que importan"). STUB: the shared shape and the `steps`
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

export const threeNumbersPayloadSchema: z.ZodType<AnswerTemplatePayload> = templatePayloadSchemaFor({
  id: 'three_numbers',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: null,
});

export const threeNumbersSpec: TemplateSpec = {
  id: 'three_numbers',
  title: 'Tres números que importan',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: null,
  payloadSchema: threeNumbersPayloadSchema,
};
