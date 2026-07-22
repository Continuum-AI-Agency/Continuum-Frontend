function firstHeaderValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const [first] = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return first ?? null;
}

function normalizeOrigin(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  try {
    return new URL(candidate).origin;
  } catch {
    try {
      return new URL(`https://${candidate}`).origin;
    } catch {
      return null;
    }
  }
}

function parseForwardedOrigin(request: Request): string | null {
  const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'));
  if (forwardedHost) {
    const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto'));
    const protocol = forwardedProto ?? (forwardedHost.startsWith('localhost') ? 'http' : 'https');
    return normalizeOrigin(`${protocol}://${forwardedHost}`);
  }

  const forwardedHeader = request.headers.get('forwarded');
  if (!forwardedHeader) return null;

  const segments = forwardedHeader.split(';');
  let proto: string | null = null;
  let host: string | null = null;

  for (const segment of segments) {
    const [rawKey, rawValue] = segment.split('=').map((part) => part.trim());
    if (!rawValue) continue;
    if (rawKey === 'proto') {
      proto = rawValue;
    } else if (rawKey === 'host') {
      host = rawValue;
    }
    if (proto && host) break;
  }

  if (!host) return null;
  const protocol = proto ?? (host.startsWith('localhost') ? 'http' : 'https');
  return normalizeOrigin(`${protocol}://${host}`);
}

function parseHostOrigin(headerStore: Headers): string | null {
  const host = firstHeaderValue(headerStore.get('host'));
  if (!host) return null;

  const forwardedProto = firstHeaderValue(headerStore.get('x-forwarded-proto'));
  const protocol = forwardedProto ?? (host.startsWith('localhost') ? 'http' : 'https');
  return normalizeOrigin(`${protocol}://${host}`);
}

function parseRefererOrigin(headerStore: Headers): string | null {
  return normalizeOrigin(firstHeaderValue(headerStore.get('referer')));
}

function hostnameFromOrigin(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function baseDomain(hostname: string): string | null {
  const labels = hostname.split('.').filter(Boolean);
  if (labels.length < 2) return null;
  return labels.slice(-2).join('.');
}

function isSameAppDomain(candidateOrigin: string, knownOrigins: string[]): boolean {
  const candidateHost = hostnameFromOrigin(candidateOrigin);
  if (!candidateHost) return false;

  for (const knownOrigin of knownOrigins) {
    const knownHost = hostnameFromOrigin(knownOrigin);
    if (!knownHost) continue;
    if (candidateHost === knownHost) return true;

    const knownBaseDomain = baseDomain(knownHost);
    if (knownBaseDomain && candidateHost.endsWith(`.${knownBaseDomain}`)) {
      return true;
    }
  }

  return false;
}

function collectEnvOrigins(): string[] {
  const rawValues: Array<string | null | undefined> = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
  ];

  const listEnvKeys = ['OAUTH_ALLOWED_ORIGINS', 'NEXT_PUBLIC_OAUTH_ALLOWED_ORIGINS'];
  for (const key of listEnvKeys) {
    const raw = process.env[key];
    if (!raw) continue;
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => rawValues.push(entry));
  }

  const normalized: string[] = [];
  for (const value of rawValues) {
    const origin = normalizeOrigin(value ?? undefined);
    if (origin) {
      normalized.push(origin);
    }
  }
  return normalized;
}

function isLocalhostOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return (
    origin.startsWith('http://localhost') ||
    origin.startsWith('https://localhost') ||
    origin.startsWith('http://127.0.0.1') ||
    origin.startsWith('https://127.0.0.1')
  );
}

function normalizeFallbackOrigin(origin: string): string {
  return normalizeOrigin(origin) ?? origin;
}

export function resolveHeadersOrigin(headerStore: Headers, fallbackOrigin: string): string {
  const normalizedFallback = normalizeFallbackOrigin(fallbackOrigin);
  const envOrigins = collectEnvOrigins();

  const allowedOrigins = new Set<string>([normalizedFallback, ...envOrigins]);

  const headerOrigin = normalizeOrigin(firstHeaderValue(headerStore.get('origin')));
  const forwardedOrigin = parseForwardedOrigin({ headers: headerStore } as unknown as Request);
  const hostOrigin = parseHostOrigin(headerStore);
  const refererOrigin = parseRefererOrigin(headerStore);
  const requestTargetOrigin = forwardedOrigin ?? hostOrigin;
  const knownAppOrigins = [normalizedFallback, ...envOrigins];

  for (const candidateOrigin of [headerOrigin, requestTargetOrigin, refererOrigin]) {
    if (candidateOrigin && isSameAppDomain(candidateOrigin, knownAppOrigins)) {
      allowedOrigins.add(candidateOrigin);
    }
  }

  if (process.env.NODE_ENV !== 'production' && isLocalhostOrigin(headerOrigin)) {
    return headerOrigin!;
  }

  if (headerOrigin && allowedOrigins.has(headerOrigin)) {
    return headerOrigin;
  }

  if (!headerOrigin && requestTargetOrigin && allowedOrigins.has(requestTargetOrigin)) {
    return requestTargetOrigin;
  }

  if (!headerOrigin && refererOrigin && allowedOrigins.has(refererOrigin)) {
    return refererOrigin;
  }

  return normalizedFallback;
}

export function resolveRequestOrigin(request: Request, url: URL, override?: string | null): string {
  const fallbackOrigin = normalizeOrigin(url.origin) ?? url.origin;
  const forwardedOrigin = parseForwardedOrigin(request);
  const allowedOrigins = new Set<string>([fallbackOrigin]);
  const envOrigins = collectEnvOrigins();

  if (forwardedOrigin) {
    allowedOrigins.add(forwardedOrigin);
  }

  for (const envOrigin of envOrigins) {
    allowedOrigins.add(envOrigin);
  }

  const requestedOrigin = normalizeOrigin(override);
  const knownAppOrigins = [fallbackOrigin, ...envOrigins];
  if (requestedOrigin && isSameAppDomain(requestedOrigin, knownAppOrigins)) {
    allowedOrigins.add(requestedOrigin);
  }

  if (requestedOrigin && allowedOrigins.has(requestedOrigin)) {
    return requestedOrigin;
  }

  if (forwardedOrigin && allowedOrigins.has(forwardedOrigin)) {
    return forwardedOrigin;
  }

  return fallbackOrigin;
}
