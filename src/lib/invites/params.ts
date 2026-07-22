const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export function normalizeInviteToken(token: string | null): string | null {
  if (!token) return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeInviteBrandId(brand: string | null): string | null {
  if (!brand) return null;
  const trimmed = brand.trim();
  const match = trimmed.match(UUID_PATTERN);
  return match ? match[0].toLowerCase() : null;
}
