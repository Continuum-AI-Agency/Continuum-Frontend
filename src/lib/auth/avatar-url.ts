const GOOGLE_AVATAR_HOST_REGEX = /^lh\d+\.googleusercontent\.com$/i;

function isGoogleHostedAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && GOOGLE_AVATAR_HOST_REGEX.test(url.hostname);
  } catch {
    return false;
  }
}

function getBrowserOrigin(): string | null {
  if (typeof window === "undefined") return null;
  const origin = window.location?.origin;
  return typeof origin === "string" && origin.length > 0 ? origin : null;
}

export function proxyAvatarUrlIfNeeded(value: string, baseOrigin?: string): string {
  if (!isGoogleHostedAvatarUrl(value)) return value;

  const proxyPath = `/api/avatar?src=${encodeURIComponent(value)}`;
  const origin = baseOrigin ?? getBrowserOrigin();
  if (!origin) return proxyPath;

  return new URL(proxyPath, origin).toString();
}
