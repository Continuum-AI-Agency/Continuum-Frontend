type ResolveWorkflowInitUrlParams = {
  path: string;
  hasWindow: boolean;
  windowOrigin?: string;
  clientApiBase?: string;
  getApiUrl: (path: string) => string;
};

const normalizePath = (path: string) => (path.startsWith("/") ? path : `/${path}`);

const basePathHasApiPrefix = (pathname: string) =>
  pathname === "/api" || pathname.startsWith("/api/");

export function resolveWorkflowInitUrl({
  path,
  hasWindow,
  windowOrigin,
  clientApiBase,
  getApiUrl,
}: ResolveWorkflowInitUrlParams): string {
  const normalizedPath = normalizePath(path);

  if (!clientApiBase) {
    return hasWindow ? `/api${normalizedPath}` : getApiUrl(normalizedPath);
  }

  if (hasWindow && windowOrigin) {
    try {
      const parsedBase = new URL(clientApiBase, windowOrigin);
      const isSameOrigin = parsedBase.origin === windowOrigin;
      const pathAlreadyPrefixed = normalizedPath.startsWith("/api/");

      if (isSameOrigin && !basePathHasApiPrefix(parsedBase.pathname) && !pathAlreadyPrefixed) {
        return getApiUrl(`/api${normalizedPath}`);
      }
    } catch {
      // Fall through to raw API URL when the configured base is not a parseable URL.
    }
  }

  return getApiUrl(normalizedPath);
}
