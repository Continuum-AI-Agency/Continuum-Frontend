import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

// Thin helper to access the `brand_profiles` schema via the Supabase client, mirroring
// `mediaSchema` for `media`. The generated Database type does not include `brand_profiles`,
// so the cast lives here once instead of at every call site.
export function brandProfilesSchema(client: SupabaseClient) {
  return (client as unknown as { schema: (s: string) => SupabaseClient }).schema('brand_profiles');
}
