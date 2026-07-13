// Resolving who wrote a comment. media.comments only stores created_by (a user
// id); the display identity lives in brand_profiles.permissions, which carries
// an email and nothing else, so a name is derived from it.
//
// Shared by the authenticated comments route (user-scoped client) and the
// public share page (admin client, because share tokens have no session). The
// share page must render the NAME only — never the email.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommentAuthor } from './comments';

export async function fetchBrandAuthors(
  supabase: SupabaseClient,
  brandId: string,
): Promise<Map<string, CommentAuthor>> {
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('permissions')
    .select('user_id, email')
    .eq('brand_profile_id', brandId);

  const authors = new Map<string, CommentAuthor>();
  if (error) {
    console.error('[library/commentAuthors] permissions lookup failed', error);
    return authors;
  }
  for (const row of (data ?? []) as { user_id: string; email: string | null }[]) {
    authors.set(row.user_id, { name: null, email: row.email });
  }
  return authors;
}
