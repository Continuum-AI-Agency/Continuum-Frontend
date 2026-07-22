// Meta ad-account "role" derivation — frontend twin of
// Continuum-Backend/App/integrations-ts/src/metaRole.ts.
//
// Kept as a small duplicated pure function rather than a shared
// `@continuum/contracts` type: the two sides start from different raw shapes
// (backend derives from a Graph API payload / `meta_ad_accounts.permissions`
// column; frontend derives from `integration_accounts_assets.raw_payload`
// fetched directly via supabase-js for the onboarding "Path A" picker), so
// there's no single wire schema to share. If Meta's task vocabulary changes,
// update both.

export type MetaAccountRole = 'admin' | 'advertiser' | 'analyst' | 'unknown';

const ROLE_RANK: Record<MetaAccountRole, number> = {
  admin: 3,
  advertiser: 2,
  analyst: 1,
  unknown: 0,
};

export function deriveMetaAccountRole(rawPermissions: unknown): MetaAccountRole {
  const values = Array.isArray(rawPermissions)
    ? rawPermissions.map((value) => String(value).toUpperCase())
    : [];
  if (values.some((value) => value === 'ADMIN' || value === 'MANAGE')) return 'admin';
  if (values.includes('ADVERTISE')) return 'advertiser';
  if (values.includes('ANALYZE')) return 'analyst';
  return 'unknown';
}

export function isHigherPrivilegeRole(
  candidate: MetaAccountRole,
  current: MetaAccountRole,
): boolean {
  return ROLE_RANK[candidate] > ROLE_RANK[current];
}

export function isReadOnlyMetaRole(role: MetaAccountRole | null | undefined): boolean {
  return role === 'analyst';
}
