// OWNED BY the weekly_bridge agent — only that agent edits this file. See
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md for the recipe.
/**
 * `weekly_bridge` (approved idea 8, "Puente de la semana"). STUB: the shared shape and the `steps`
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

export const weeklyBridgePayloadSchema: z.ZodType<AnswerTemplatePayload> = templatePayloadSchemaFor({
  id: 'weekly_bridge',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: null,
});

export const weeklyBridgeSpec: TemplateSpec = {
  id: 'weekly_bridge',
  title: 'Puente de la semana',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: null,
  payloadSchema: weeklyBridgePayloadSchema,
};
