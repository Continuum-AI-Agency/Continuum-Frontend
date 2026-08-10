export type UserLike =
  | {
      app_metadata?: unknown | null;
    }
  | null
  | undefined;

export type BrandSummaryLike = {
  id: string;
  name?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function getUserRoles(user: UserLike): string[] {
  const metadata = isRecord(user?.app_metadata) ? user.app_metadata : null;
  const roles = metadata?.roles;
  return isStringArray(roles) ? roles : [];
}

export function isAdminUser(user: UserLike): boolean {
  const metadata = isRecord(user?.app_metadata) ? user.app_metadata : null;
  const isAdminFlag = Boolean(metadata?.is_admin);
  if (isAdminFlag) return true;
  return getUserRoles(user).includes('admin');
}

export function getActiveBrandLabel(
  brandSummaries: BrandSummaryLike[],
  activeBrandId: string,
): string {
  return brandSummaries.find((brand) => brand.id === activeBrandId)?.name || 'Brands';
}

/**
 * A brand's name is derived from the scraped site title at onboarding, so re-running
 * onboarding mints a second, genuinely distinct row with the identical name — the
 * switcher then shows what looks like the same brand twice with no way to tell them
 * apart. Same idiom as the admin console's `formatBrandDisambiguationLabel`: append a
 * short id tail, and only for the names that actually collide, so the common case
 * stays clean.
 *
 * `siblings` is the full list the label is shown alongside; omit it when the label
 * stands alone and no collision is possible.
 */
export function getBrandMenuItemLabel(
  brand: BrandSummaryLike,
  siblings?: readonly BrandSummaryLike[],
): string {
  const name = brandDisplayName(brand);
  if (!siblings) return name;
  const collides = siblings.some(
    (other) => other.id !== brand.id && brandDisplayName(other) === name,
  );
  return collides ? `${name} — …${brand.id.slice(-6)}` : name;
}

function brandDisplayName(brand: BrandSummaryLike): string {
  return brand.name?.trim() || 'Untitled brand';
}
