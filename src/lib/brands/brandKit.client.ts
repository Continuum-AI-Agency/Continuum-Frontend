'use client';

// The brand kit (colours + typefaces) read straight from the browser.
//
// `brandStyle.server.ts` already reads these two columns, but it is a Server Action and the
// canvas resolves a brand mid-run on the client. `brand_profiles` is an exposed schema
// (supabase/config.toml) and the row is RLS-scoped to the caller, so this is the same read
// under the same policy — no round trip through a route handler that would only re-attach the
// token the browser client already carries.
//
// Null on ANY failure, including a brand the caller cannot see. This feeds the burn-in's type
// chain, where a missing rung is a step to the next one rather than an error.

import type { BrandTypography } from '@continuum/contracts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface BrandKitShapes {
  readonly colors: string[];
  readonly typography: BrandTypography;
}

export async function fetchBrandKit(brandId: string): Promise<BrandKitShapes | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('brand_colors, brand_typography')
    .eq('id', brandId)
    .maybeSingle();
  if (error || !data) return null;

  const typography = (data.brand_typography ?? {}) as Record<string, unknown>;
  return {
    colors: Array.isArray(data.brand_colors)
      ? (data.brand_colors as unknown[]).filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    typography: {
      primary: typeof typography.primary === 'string' ? typography.primary : null,
      secondary: typeof typography.secondary === 'string' ? typography.secondary : null,
    },
  };
}
