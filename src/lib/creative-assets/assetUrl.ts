const SAFE_URL_PATTERN = /^(https?:|data:|blob:)/i;

export function sanitizeCreativeAssetUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return SAFE_URL_PATTERN.test(trimmed) ? trimmed : null;
}
