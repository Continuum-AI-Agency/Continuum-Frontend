import { z } from "zod";
import { httpUrlSchema, hexColorSchema } from "./_shared";

export const brandPaletteSchema = z.object({
  primary: hexColorSchema.nullable().optional(),
  secondary: hexColorSchema.nullable().optional(),
  accent: hexColorSchema.nullable().optional(),
  background: hexColorSchema.nullable().optional(),
  text: hexColorSchema.nullable().optional(),
});
export type BrandPalette = z.infer<typeof brandPaletteSchema>;

// `primary` is heading/display, `secondary` is body.
export const brandTypographySchema = z.object({
  primary: z.string().max(240).nullable().optional(),
  secondary: z.string().max(240).nullable().optional(),
});
export type BrandTypography = z.infer<typeof brandTypographySchema>;

// Hero copy bounds prevent runaway generation; quality (formula adherence) is
// enforced at prompt time and audited by the section auditor.
export const websiteSummarySchema = z.object({
  website_url: httpUrlSchema.nullable(),
  hero_statement: z.string().max(330).nullable().optional(),
  hero_subhead: z.string().max(420).nullable().optional(),
  palette: brandPaletteSchema.nullable().optional(),
  typography: brandTypographySchema.nullable().optional(),
});
export type WebsiteSummary = z.infer<typeof websiteSummarySchema>;
