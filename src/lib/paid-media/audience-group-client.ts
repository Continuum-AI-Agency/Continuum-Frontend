'use client';

/**
 * The ONLY place an audience-group Supabase call lives.
 *
 * Same reasoning as `scaffold-tree-client.ts`: the approval card renders inside a
 * client-only streaming transcript with no server boundary available, and RLS already
 * grants exactly this read to brand members. A route handler could only re-implement a
 * check the database already makes — root AGENTS.md §5 names that a thin
 * auth-forwarding proxy. One wrapper module, never a query inside a component.
 *
 * The approval frame carries `group_version_id` and nothing human-readable, so the
 * card would otherwise ask someone to approve a uuid. Refused or missing reads return
 * null and the card falls back to the raw input — never a blocked approval.
 */

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type AudienceGroupVersionSummary = {
  name: string;
  memberCount: number;
};

/**
 * Name + member count for one `brand_profiles.audience_group_versions` row.
 *
 * Null when RLS filters the row away (a read the caller may not make returns zero
 * rows rather than an error), or when the manifest has no readable name.
 */
export async function fetchAudienceGroupVersionSummary(params: {
  groupVersionId: string;
}): Promise<AudienceGroupVersionSummary | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('audience_group_versions')
    .select('id,manifest')
    .eq('id', params.groupVersionId)
    .maybeSingle();

  if (error) throw new Error(`Could not load the audience group: ${error.message}`);

  const manifest = data?.manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;

  const record = manifest as Record<string, unknown>;
  const name = typeof record.name === 'string' && record.name.length > 0 ? record.name : null;
  if (!name) return null;

  return {
    name,
    memberCount: Array.isArray(record.members) ? record.members.length : 0,
  };
}
