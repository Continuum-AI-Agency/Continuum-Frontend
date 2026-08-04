import { z } from 'zod';
import { hexColorSchema, httpUrlSchema } from './_shared';

/**
 * Frontend-supplied scrape: deterministic source-of-truth for colors and typography.
 * When present, downstream agents must echo these values rather than invent new ones.
 *
 * Phase 16a — rich-scrape priming fields (hero_copy, nav_labels, cta_text,
 * body_sample, meta, language) are pre-extracted from the page so prompts can
 * present labeled facts instead of asking the model to re-extract from raw HTML.
 */
export const scrapeSchema = z
  .object({
    url: httpUrlSchema,
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    colors: z.array(hexColorSchema).max(8).default([]),
    typography: z
      .object({
        primary: z.string().nullable().optional(),
        secondary: z.string().nullable().optional(),
      })
      .partial()
      .nullable()
      .optional(),
    colorScheme: z.enum(['light', 'dark']).nullable().optional(),
    hero_copy: z
      .object({
        headline: z.string().max(400).nullable().optional(),
        subhead: z.string().max(600).nullable().optional(),
      })
      .nullable()
      .optional(),
    nav_labels: z.array(z.string().min(1).max(60)).max(12).nullable().optional(),
    cta_text: z.array(z.string().min(1).max(80)).max(6).nullable().optional(),
    body_sample: z.string().max(2000).nullable().optional(),
    meta: z
      .object({
        og_title: z.string().max(300).nullable().optional(),
        og_description: z.string().max(600).nullable().optional(),
        twitter_card_description: z.string().max(600).nullable().optional(),
      })
      .nullable()
      .optional(),
    language: z.string().max(20).nullable().optional(),
  })
  .loose();
export type Scrape = z.infer<typeof scrapeSchema>;
