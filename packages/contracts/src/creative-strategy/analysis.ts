// Per-creative structured breakdown, produced Backend-side by a Gemini 3.1
// Flash-Lite `generateObject` pass over ONE of the brand's OWN top-performing
// organic posts or ads (caption/copy + the creative image when available).
//
// Parallel to — not a mutation of — competitor-spy's competitorAdAnalysisSchema
// (competitor-spy/analysis.ts): that indexes COMPETITORS' creatives; this indexes
// the brand's own top performers and adds an explicit strategic `angle` field.
// Reuses the shared hook-archetype taxonomy so first-party and competitor analysis
// speak one vocabulary of hook types.
//
// Plain object (not .strict()) so an LLM adding an extra key never fails parse —
// same rule as competitor-spy.

import { z } from 'zod';
import { competitorAdHookArchetypeSchema } from '../competitor-spy/analysis';

// The hook-archetype vocabulary is shared with competitor-spy; re-exported under a
// surface-neutral name so callers do not reach across into competitor-spy.
export const creativeHookArchetypeSchema = competitorAdHookArchetypeSchema;
export type CreativeHookArchetype = z.infer<typeof creativeHookArchetypeSchema>;

export const creativeSentimentLabelSchema = z.enum([
  'positive',
  'neutral',
  'negative',
  'aspirational',
  'urgent',
]);
export type CreativeSentimentLabel = z.infer<typeof creativeSentimentLabelSchema>;

export const firstPartyCreativeAnalysisSchema = z.object({
  // The strategic angle: the underlying selling idea / point of view (distinct
  // from the hook, which is the opening line that expresses it).
  angle: z.string().nullable(),
  hook: z.string().nullable(),
  hookArchetype: creativeHookArchetypeSchema.nullable(),
  primaryTheme: z.string().nullable(),
  themes: z.array(z.string()).max(8).default([]),
  valueProps: z.array(z.string()).default([]),
  copyTone: z.array(z.string()).max(6).default([]),
  format: z.string().nullable(),
  visualStyle: z.string().nullable(),
  targetAudienceSignal: z.string().nullable(),
  sentiment: creativeSentimentLabelSchema.nullable(),
  sentimentScore: z.number().min(-1).max(1).nullable(),
  // Whether the analysis saw the actual creative image (true) or degraded to
  // copy-only because media was unavailable (false).
  analyzedFromImage: z.boolean().default(false),
});
export type FirstPartyCreativeAnalysis = z.infer<typeof firstPartyCreativeAnalysisSchema>;
