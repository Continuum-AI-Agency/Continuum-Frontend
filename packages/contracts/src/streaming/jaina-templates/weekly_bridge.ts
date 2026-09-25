// OWNED BY the weekly_bridge agent — only that agent edits this file. See
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md for the recipe.
/**
 * `weekly_bridge` (approved idea 8, "Puente de la semana") — "¿cómo cambió la semana contra la
 * anterior?". A waterfall carries the week before's results to this week's, one step per
 * campaign; the justification splits every step into spending more or less (volume) and
 * paying more or less per result (efficiency).
 *
 * What the schema holds beyond the shared shape: the hero is a `bridge` whose first point is
 * the week before's total, whose last point is this week's, and whose steps in between — at
 * least two campaigns — SUM EXACTLY to the change; "found" carries the per-campaign table and
 * one row per step. A bridge that does not add up is refused, never drawn.
 */

import type { z } from 'zod';
import {
  type AnswerTemplatePayload,
  STEP_SECTION_KINDS,
  type TemplateSpec,
  templatePayloadSchemaFor,
} from './core';

const base = templatePayloadSchemaFor({
  id: 'weekly_bridge',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: ['bridge'],
});

/** Counts are whole and the steps are counts: anything past this is a bridge that does not add up. */
const SUM_TOLERANCE = 1e-6;

export const weeklyBridgePayloadSchema: z.ZodType<AnswerTemplatePayload> = base.superRefine(
  (payload, ctx) => {
    const hero = payload.executive.hero_chart;
    if (hero && hero.kind === 'bridge') {
      if (hero.points.length < 4) {
        ctx.addIssue({
          code: 'custom',
          path: ['executive', 'hero_chart', 'points'],
          message: 'weekly_bridge needs the week before, at least two steps and this week',
        });
      } else {
        const valueOf = (id: string): number | null => {
          const value = payload.figures.find((figure) => figure.id === id)?.value;
          return typeof value === 'number' && Number.isFinite(value) ? value : null;
        };
        const start = valueOf(hero.points[0].figure_id);
        const end = valueOf(hero.points[hero.points.length - 1].figure_id);
        const steps = hero.points.slice(1, -1).map((point) => valueOf(point.figure_id));
        if (start === null || end === null || steps.some((step) => step === null)) {
          ctx.addIssue({
            code: 'custom',
            path: ['executive', 'hero_chart', 'points'],
            message: 'every weekly_bridge point needs a figure with a value',
          });
        } else {
          const sum = steps.reduce<number>((total, step) => total + (step ?? 0), 0);
          if (Math.abs(sum - (end - start)) > SUM_TOLERANCE) {
            ctx.addIssue({
              code: 'custom',
              path: ['executive', 'hero_chart', 'points'],
              message: `weekly_bridge steps sum to ${sum}, not to the change ${end - start}`,
            });
          }
        }
      }
    }
    const found = payload.justification.sections.find((section) => section.kind === 'found');
    if (found && (found.table === null || found.items.length < 2)) {
      ctx.addIssue({
        code: 'custom',
        path: ['justification', 'sections'],
        message: 'weekly_bridge "found" needs the per-campaign table and one row per step',
      });
    }
  },
);

export const weeklyBridgeSpec: TemplateSpec = {
  id: 'weekly_bridge',
  title: 'Puente de la semana',
  requiredSections: STEP_SECTION_KINDS,
  heroChartKinds: ['bridge'],
  payloadSchema: weeklyBridgePayloadSchema,
};
