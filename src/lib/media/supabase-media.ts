// Thin helper to access the `media` schema via the Supabase client.
// The generated Database type does not include `media`, so we cast once here.
// All callers import from this module — never spread the cast across the codebase.

import type { SupabaseClient } from "@supabase/supabase-js";

// Returns a schema-scoped query builder for `media` tables.
export function mediaSchema(client: SupabaseClient) {
  return (client as unknown as { schema: (s: string) => SupabaseClient }).schema("media");
}
