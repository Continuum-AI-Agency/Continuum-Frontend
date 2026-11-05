import 'server-only';

import { cache } from 'react';
import { requireClaimsIdentity } from '@/lib/auth/claims';
import type { AuthIdentity } from '@/lib/auth/identity';
import { type BrandAccessClient, readBrandAccess } from '@/lib/billing/brandAccess.server';
import type { BrandAccess } from '@/lib/billing/productAccess';
import { setActiveBrandPreference } from '@/lib/brands/preferences';
import { resolveActiveBrandId } from '@/lib/brands/resolve-active-brand';
import { reusableSignedUrl, rememberSignedUrl } from '@/lib/media/signed-urls';
import { claimPendingInvite } from '@/lib/onboarding/claimInvite';
import type { BrandSummary } from '@/lib/repositories/brandProfile';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const value = error as { message?: string; code?: string; hint?: string; details?: string };
    const parts = [
      value.message,
      value.code ? `code=${value.code}` : null,
      value.details ? `details=${value.details}` : null,
      value.hint ? `hint=${value.hint}` : null,
    ].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' | ');
    }
  }

  return 'Unknown error';
}

export type ActiveBrandContext = {
  activeBrandId: string | null;
  brandSummaries: BrandSummary[];
  permissions: Array<{
    brand_profile_id: string;
    role: string | null;
  }>;
  /**
   * What the active brand may open: its billing products, whether billing is live, and (until
   * the go-live cutover) the tier that decides access while it is not.
   */
  brandAccess: BrandAccess;
  user: AuthIdentity | null;
};

const NO_BRAND_ACCESS: BrandAccess = {
  billingLive: false,
  products: [],
  entitlements: null,
  legacyTier: 0,
};

type BrandPermissionRow = {
  brand_profile_id: string;
  role: string | null;
};

type BrandInviteRow = {
  brand_profile_id: string;
  role: string | null;
};

type AccessibleBrandRows = {
  permissions: BrandPermissionRow[];
  invites: BrandInviteRow[];
};

function isStatementTooComplex(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as { code?: string }).code === '54001';
}

async function fetchAccessibleBrandRows(
  user: AuthIdentity,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const [{ data: perms, error: permsError }, { data: invites, error: invitesError }] =
    await Promise.all([
      supabase
        .schema('brand_profiles')
        .from('permissions')
        .select('brand_profile_id, role')
        .eq('user_id', user.id),
      supabase
        .schema('brand_profiles')
        .from('invites')
        .select('brand_profile_id, role')
        .eq('email', user.email ?? '')
        .is('accepted_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString()),
    ]);

  if (permsError) {
    console.error('[activeBrand] permissions query failed', permsError);
  }
  if (invitesError) {
    console.error('[activeBrand] invites query failed', invitesError);
  }

  if (!isStatementTooComplex(permsError) && !isStatementTooComplex(invitesError)) {
    return {
      permissions: (perms ?? []) as BrandPermissionRow[],
      invites: (invites ?? []) as BrandInviteRow[],
    };
  }

  try {
    const admin = createSupabaseAdminClient();
    const [
      { data: adminPerms, error: adminPermsError },
      { data: adminInvites, error: adminInvitesError },
    ] = await Promise.all([
      admin
        .schema('brand_profiles')
        .from('permissions')
        .select('brand_profile_id, role')
        .eq('user_id', user.id),
      admin
        .schema('brand_profiles')
        .from('invites')
        .select('brand_profile_id, role')
        .eq('email', user.email ?? '')
        .is('accepted_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString()),
    ]);

    if (adminPermsError) {
      console.error('[activeBrand] admin fallback permissions query failed', adminPermsError);
    }
    if (adminInvitesError) {
      console.error('[activeBrand] admin fallback invites query failed', adminInvitesError);
    }

    return {
      permissions: (adminPerms ?? []) as BrandPermissionRow[],
      invites: (adminInvites ?? []) as BrandInviteRow[],
    };
  } catch (error) {
    console.error('[activeBrand] admin fallback failed', describeError(error));
    return {
      permissions: (perms ?? []) as BrandPermissionRow[],
      invites: (invites ?? []) as BrandInviteRow[],
    };
  }
}

/**
 * A pending invite grants nothing until it is redeemed, and only the emailed link redeems it.
 * An invitee who signs in any other way (password, Google) was shown the brand and refused
 * every read of it. Onboarding could not rescue them: `has_brand_access` hides the brand row
 * from a non-member, so its claim branch never ran. The dashboard layout and the onboarding
 * page both pass through here first, so this is where the invite gets redeemed.
 */
export async function redeemPendingInvites(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  rows: AccessibleBrandRows,
  refetch: () => Promise<AccessibleBrandRows>,
): Promise<AccessibleBrandRows> {
  const permitted = new Set(rows.permissions.map((p) => p.brand_profile_id));
  const unredeemed = new Set(
    rows.invites.map((i) => i.brand_profile_id).filter((id) => !permitted.has(id)),
  );
  if (unredeemed.size === 0) return rows;

  // ponytail: an invite that keeps refusing (unverified email) is retried on every render; add a backoff if that shows up in edge logs.
  await Promise.all([...unredeemed].map((id) => claimPendingInvite(supabase, id, userId)));
  return refetch();
}

// A week: the shell keeps these URLs for as long as a tab stays open.
const LOGO_URL_TTL_SECONDS = 604800;
// The largest logo box is 36 px; 160 px covers it at DPR 2 whatever the logo's aspect.
const LOGO_EDGE = 160;
// What Supabase can resize; an SVG or GIF logo keeps its original.
const RESIZABLE_LOGO = /\.(png|jpe?g|webp)$/i;

export const getActiveBrandContext = cache(async (): Promise<ActiveBrandContext> => {
  const supabase = await createSupabaseServerClient();
  const user = await requireClaimsIdentity();

  const { permissions: perms, invites } = await redeemPendingInvites(
    supabase,
    user.id,
    await fetchAccessibleBrandRows(user, supabase),
    () => fetchAccessibleBrandRows(user, supabase),
  );

  const permittedIds = (perms ?? []).map((p) => p.brand_profile_id);
  const invitedIds = (invites ?? []).map((i) => i.brand_profile_id);

  const allBrandIds = Array.from(new Set([...permittedIds, ...invitedIds])).filter(
    (id): id is string => Boolean(id),
  );

  let brandMap = new Map<
    string,
    { name: string; logoPath: string | null; completedAt: string | null; updatedAt: string | null }
  >();

  // Run brand_profiles lookup and get_active_brand_id RPC in parallel — both only need
  // allBrandIds / permittedIds from the previous step, with no dependency on each other.
  const [brandsResult, activeBrandResult] = await Promise.all([
    allBrandIds.length > 0
      ? supabase
          .schema('brand_profiles')
          .from('brand_profiles')
          .select('id, brand_name, logo_path, completed_at, updated_at')
          .in('id', allBrandIds)
          // Exclude soft-deleted brands (delete_brand_profile sets active=false).
          // Without this, a deleted brand reappears because its permissions row
          // is retained. `active` is non-nullable, so eq(true) is safe.
          .eq('active', true)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            brand_name: string | null;
            logo_path: string | null;
            completed_at: string | null;
            updated_at: string | null;
          }>,
          error: null,
        }),
    permittedIds.length > 0
      ? // Session-scoped: resolves this session's own brand above the account-level
        // pointer, and pins the session on first read. get_active_brand_id() — which
        // this calls for tiers 2 and 3 — is account-global, and trusting it alone is
        // what let two sessions on one login render each other's brand (Airtable #272).
        supabase.schema('brand_profiles').rpc('resolve_active_brand_for_session')
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (brandsResult.error) {
    console.error('[activeBrand] brand_profiles lookup failed', brandsResult.error);
  } else {
    brandMap = new Map(
      (brandsResult.data ?? []).map((brand) => [
        brand.id,
        {
          name: brand.brand_name ?? 'Untitled brand',
          logoPath: brand.logo_path ?? null,
          completedAt: brand.completed_at ?? null,
          updatedAt: brand.updated_at ?? null,
        },
      ]),
    );
  }

  // Permissions can outlive a soft-deleted brand, so resolve "what the user can
  // see" against the brands that actually came back active (brandMap). This keeps
  // a deleted brand from lingering as the active pointer or blocking the
  // onboarding redirect when it was the user's only brand.
  const visiblePermittedIds = permittedIds.filter((id) => brandMap.has(id));

  const { data: activeBrandData, error: activeBrandError } = activeBrandResult;
  if (activeBrandError && visiblePermittedIds.length > 0) {
    console.error('[activeBrand] active brand rpc failed', activeBrandError);
  }
  const { activeBrandId, shouldPersist } =
    visiblePermittedIds.length > 0
      ? resolveActiveBrandId({
          candidateBrandId: typeof activeBrandData === 'string' ? activeBrandData : null,
          permittedBrandIds: visiblePermittedIds,
        })
      : { activeBrandId: null, shouldPersist: false };

  // Started now so the entitlements read overlaps logo signing instead of queueing behind it.
  const brandAccessPromise = activeBrandId
    ? readBrandAccess(activeBrandId, supabase as unknown as BrandAccessClient)
    : Promise.resolve(NO_BRAND_ACCESS);

  // Logos draw at 16–36 px, so each is signed as a small still rather than the uploaded original
  // (a scraped logo is often a 300 KB banner). The shell re-renders on every navigation, and a
  // fresh token is a fresh download of the same picture, so the URL minted for this person is
  // reused while it has half its week left; the brand row's updated_at moves it on a new logo.
  const signedUrlMap = new Map<string, string>();
  await Promise.all(
    allBrandIds.map(async (id) => {
      const brand = brandMap.get(id);
      const path = brand?.logoPath;
      if (!path) return;
      const key = ['logo', user.id, path, brand.updatedAt ?? ''].join('\n');
      const reused = reusableSignedUrl(key);
      if (reused) {
        signedUrlMap.set(path, reused);
        return;
      }
      try {
        const { data, error } = await supabase.storage
          .from('brand-profile-assets')
          .createSignedUrl(
            path,
            LOGO_URL_TTL_SECONDS,
            RESIZABLE_LOGO.test(path)
              ? { transform: { width: LOGO_EDGE, height: LOGO_EDGE, resize: 'contain' } }
              : undefined,
          );
        if (error || !data?.signedUrl) {
          console.error('[activeBrand] logo sign failed', { path, error });
          return;
        }
        signedUrlMap.set(path, data.signedUrl);
        rememberSignedUrl(key, data.signedUrl, LOGO_URL_TTL_SECONDS);
      } catch (e) {
        console.error('[activeBrand] logo sign failed', { path, error: describeError(e) });
      }
    }),
  );

  const brandSummaries: BrandSummary[] = allBrandIds.flatMap((id) => {
    const brandData = brandMap.get(id);
    if (!brandData) return [];

    const logoPath = brandData.logoPath;
    const isPending = !permittedIds.includes(id);

    return [
      {
        id,
        name: brandData.name,
        completed: brandData.completedAt !== null,
        logoPath,
        logoUrl: logoPath ? (signedUrlMap.get(logoPath) ?? null) : null,
        isPending,
      },
    ];
  });

  if (activeBrandId && shouldPersist) {
    try {
      await setActiveBrandPreference(activeBrandId);
    } catch (e) {
      console.error('[activeBrand] Failed to persist active brand preference:', describeError(e));
    }
  }

  return {
    activeBrandId,
    brandSummaries,
    permissions: perms ?? [],
    brandAccess: await brandAccessPromise,
    user,
  };
});
