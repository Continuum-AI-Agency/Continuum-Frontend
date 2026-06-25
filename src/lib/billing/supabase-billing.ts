// Thin helper to access the `billing` schema via the Supabase client.
// The generated Database type does not include `billing`, so we cast once here.
// All callers import from this module — never spread the cast across the codebase.

import type { SupabaseClient } from "@supabase/supabase-js";

// Returns a schema-scoped query builder for `billing` tables + RPCs.
export function billingSchema(client: SupabaseClient) {
  return (client as unknown as { schema: (s: string) => SupabaseClient }).schema("billing");
}
