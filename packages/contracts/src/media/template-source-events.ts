// A template's ingest trail — what happened to it between the drop and a renderable template.
//
// One row per step that spoke: the parse (and why it failed, including the failures that used
// to leave no trace), fonts healed from the package or Google Fonts, forge submissions and run
// state changes. The Frontend lists it under the checks table; "Investigate" opens it.

import { z } from 'zod';

export const templateSourceEventStageSchema = z.enum(['parse', 'fonts', 'forge', 'mapping']);
export type TemplateSourceEventStage = z.infer<typeof templateSourceEventStageSchema>;

export const templateSourceEventLevelSchema = z.enum(['info', 'warn', 'error']);
export type TemplateSourceEventLevel = z.infer<typeof templateSourceEventLevelSchema>;

export const templateSourceEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  stage: templateSourceEventStageSchema,
  level: templateSourceEventLevelSchema,
  message: z.string(),
  detail: z.record(z.string(), z.unknown()).nullable(),
});
export type TemplateSourceEvent = z.infer<typeof templateSourceEventSchema>;

export const templateSourceEventsResponseSchema = z.object({
  events: z.array(templateSourceEventSchema),
});
export type TemplateSourceEventsResponse = z.infer<typeof templateSourceEventsResponseSchema>;

/** What the heal step did for one template, returned to the Fix button and logged as events. */
export const templateFontHealResultSchema = z.object({
  /** PostScript names found inside the uploaded package and stored for this brand. */
  fromPackage: z.array(z.string()),
  /** PostScript names fetched from Google Fonts into the shared house tier. */
  fromGoogle: z.array(z.string()),
  /** Still missing after both — only a person with the file can fix these. */
  stillMissing: z.array(z.string()),
});
export type TemplateFontHealResult = z.infer<typeof templateFontHealResultSchema>;
