import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

// When onboarding metadata is empty, reuse an existing brand the user already
// has ACCESS to — as owner OR as an invited member (admin/operator/viewer) —
// instead of minting a fresh brand id. This used to only check `role ===
// "owner"`, so an invited member with empty onboarding metadata fell through
// to a new-brand INSERT even though they already had a permission row on
// their real brand, producing a duplicate "<name>'s Brand" row (ticket #162).
// Conservative + fail-safe: only active brands count, and any error returns
// null so the caller falls back to creating a new brand (the prior behavior).

type Client = SupabaseClient<Database>;

/**
 * Every `brand_profiles.permissions` row for this user, regardless of role.
 * Returns null (not []) on a lookup error so callers can fail safe/closed.
 */
async function listAccessibleBrandIds(supabase: Client, userId: string): Promise<string[] | null> {
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('permissions')
    .select('brand_profile_id')
    .eq('user_id', userId);
  if (error) return null;
  return ((data ?? []) as Array<{ brand_profile_id: string }>).map((p) => p.brand_profile_id);
}

export async function findReusableBrandId(
  supabase: Client,
  userId: string,
): Promise<string | null> {
  try {
    const ids = await listAccessibleBrandIds(supabase, userId);
    if (!ids || ids.length === 0) return null;

    const { data: brands, error: brandErr } = await supabase
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('id, created_at')
      .in('id', ids)
      .eq('active', true)
      .order('created_at', { ascending: true });
    if (brandErr) return null;

    const first = ((brands ?? []) as Array<{ id: string }>)[0];
    return first?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * A PENDING invite lives in `brand_profiles.invites` keyed by email and does NOT
 * create a `permissions` row until the user accepts — so findReusableBrandId
 * (which reads `permissions`) cannot see it. Without this, an invited user with
 * empty onboarding metadata falls through to a NEW-brand INSERT, producing a
 * junk "<name>'s Brand" instead of joining the brand they were invited to
 * (ticket #162 follow-up: invited members ending up with duplicate own-brands).
 * Reuse the invited brand id here so the user lands on the real brand; the
 * canPersistBrandRecord guard still blocks them from overwriting its name.
 * Fail-safe: any error / no pending invite returns null so the caller falls
 * back to its normal path.
 *
 * Returning a brand id is NOT the same as granting access to it — a caller that
 * only does this leaves the user on a brand `has_brand_access` says no to, and
 * every backend brand-scoped route 403s. `claimPendingInvite` in storage.ts is
 * the other half; keep them together.
 */
export async function findPendingInviteBrandId(
  supabase: Client,
  email: string | null | undefined,
): Promise<string | null> {
  const normalized = email?.trim();
  if (!normalized) return null;
  try {
    const { data, error } = await supabase
      .schema('brand_profiles')
      .from('invites')
      .select('brand_profile_id, created_at')
      .ilike('email', normalized)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) return null;
    const first = ((data ?? []) as Array<{ brand_profile_id: string }>)[0];
    return first?.brand_profile_id ?? null;
  } catch {
    return null;
  }
}

export interface BrandIdentityCandidate {
  brandName: string;
  websiteUrl?: string | null;
}

function normalizeBrandName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeWebsiteUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

/**
 * Defense-in-depth against duplicate brand creation (ticket #162): before a
 * caller inserts a brand new `brand_profiles` row, check whether the user
 * already has access to an ACTIVE brand whose name or `context.website_url`
 * matches this candidate, and reuse that brand instead of creating a
 * duplicate. Conservative + fail-safe: any error or no-match returns null so
 * the caller proceeds with its normal insert path.
 */
export async function findMatchingActiveBrandId(
  supabase: Client,
  userId: string,
  candidate: BrandIdentityCandidate,
): Promise<string | null> {
  try {
    const normalizedName = normalizeBrandName(candidate.brandName);
    const normalizedWebsite = candidate.websiteUrl
      ? normalizeWebsiteUrl(candidate.websiteUrl)
      : null;
    if (!normalizedName && !normalizedWebsite) return null;

    const ids = await listAccessibleBrandIds(supabase, userId);
    if (!ids || ids.length === 0) return null;

    const { data: brands, error: brandErr } = await supabase
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('id, brand_name, context')
      .in('id', ids)
      .eq('active', true);
    if (brandErr) return null;

    const match = (
      (brands ?? []) as Array<{
        id: string;
        brand_name: string | null;
        context: unknown;
      }>
    ).find((brand) => {
      const nameMatches =
        normalizedName.length > 0 &&
        typeof brand.brand_name === 'string' &&
        normalizeBrandName(brand.brand_name) === normalizedName;

      const brandWebsite =
        brand.context && typeof brand.context === 'object'
          ? (brand.context as { website_url?: unknown }).website_url
          : null;
      const websiteMatches =
        normalizedWebsite !== null &&
        typeof brandWebsite === 'string' &&
        normalizeWebsiteUrl(brandWebsite) === normalizedWebsite;

      return nameMatches || websiteMatches;
    });

    return match?.id ?? null;
  } catch {
    return null;
  }
}
