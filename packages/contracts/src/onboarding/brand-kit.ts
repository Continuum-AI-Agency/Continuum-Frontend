// Deterministic brand-identity kit captured at onboarding. Persisted in two
// mirrored places (decided together): queryable columns on
// brand_profiles.brand_profiles (brand_colors, brand_typography, logo_path) AND
// a portable Storage object at <brandId>/branding/brand-kit.json. The brand icon
// lives at the deterministic Storage path <brandId>/branding/logo.<ext>.

import { z } from "zod";
import { brandTypographySchema } from "./website-summary";

// Canonical brand-kit.json shape. Reuses the shared brandTypographySchema.
export const brandKitSchema = z
  .object({
    brandId: z.string().min(1),
    colors: z.array(z.string()).default([]),
    typography: brandTypographySchema.default({ primary: null, secondary: null }),
    logoPath: z.string().nullable().default(null),
  })
  .strict();
export type BrandKit = z.infer<typeof brandKitSchema>;

// FE → BE request to persist the kit after approve. logoPath = an already-uploaded
// Storage path; logoSourceUrl = a scraped logo URL the Backend may download into
// the deterministic path when no uploaded logo exists.
export const onboardingBrandKitRequestSchema = z
  .object({
    brandId: z.string().min(1),
    colors: z.array(z.string()).default([]),
    typography: brandTypographySchema.default({ primary: null, secondary: null }),
    logoPath: z.string().nullable().optional(),
    logoSourceUrl: z.string().nullable().optional(),
  })
  .strict();
export type OnboardingBrandKitRequest = z.infer<typeof onboardingBrandKitRequestSchema>;
