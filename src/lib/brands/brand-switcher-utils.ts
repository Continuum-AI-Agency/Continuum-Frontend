export type UserLike = {
  app_metadata?: unknown | null;
} | null | undefined;

export type BrandSummaryLike = {
  id: string;
  name?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
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
  return getUserRoles(user).includes("admin");
}

export function getActiveBrandLabel(
  brandSummaries: BrandSummaryLike[],
  activeBrandId: string
): string {
  return brandSummaries.find((brand) => brand.id === activeBrandId)?.name || "Brands";
}

export function getBrandMenuItemLabel(brand: BrandSummaryLike): string {
  return brand.name || "Untitled brand";
}
