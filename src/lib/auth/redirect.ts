type ResolveAuthRedirectOptions = {
  requestedRedirect?: string;
  siteUrl: string;
  fallbackPath?: string;
};

export function resolveAuthRedirect({
  requestedRedirect,
  siteUrl,
  fallbackPath = "/dashboard",
}: ResolveAuthRedirectOptions): string {
  if (!requestedRedirect) {
    return `${siteUrl}${fallbackPath}`;
  }

  const trimmed = requestedRedirect.trim();
  if (trimmed.length === 0) {
    return `${siteUrl}${fallbackPath}`;
  }

  if (trimmed.startsWith("/")) {
    return `${siteUrl}${trimmed}`;
  }

  if (trimmed.startsWith(siteUrl)) {
    return trimmed;
  }

  return `${siteUrl}${fallbackPath}`;
}
