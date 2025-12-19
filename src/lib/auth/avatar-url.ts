const GOOGLE_AVATAR_HOST_REGEX = /^lh\d+\.googleusercontent\.com$/i;

function isGoogleHostedAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && GOOGLE_AVATAR_HOST_REGEX.test(url.hostname);
  } catch {
    return false;
  }
}

export function proxyAvatarUrlIfNeeded(value: string): string {
  if (!isGoogleHostedAvatarUrl(value)) return value;
  return `/api/avatar?src=${encodeURIComponent(value)}`;
}

