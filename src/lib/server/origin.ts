function firstHeaderValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const [first] = value.split(",").map(part => part.trim()).filter(Boolean);
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
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  if (forwardedHost) {
    const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
    const protocol = forwardedProto ?? (forwardedHost.startsWith("localhost") ? "http" : "https");
    return normalizeOrigin(`${protocol}://${forwardedHost}`);
  }

  const forwardedHeader = request.headers.get("forwarded");
  if (!forwardedHeader) return null;

  const segments = forwardedHeader.split(";");
  let proto: string | null = null;
  let host: string | null = null;

  for (const segment of segments) {
    const [rawKey, rawValue] = segment.split("=").map(part => part.trim());
    if (!rawValue) continue;
    if (rawKey === "proto") {
      proto = rawValue;
    } else if (rawKey === "host") {
      host = rawValue;
    }
    if (proto && host) break;
  }

  if (!host) return null;
  const protocol = proto ?? (host.startsWith("localhost") ? "http" : "https");
  return normalizeOrigin(`${protocol}://${host}`);
}

function collectEnvOrigins(): string[] {
  const rawValues: Array<string | null | undefined> = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
  ];

  const listEnvKeys = ["OAUTH_ALLOWED_ORIGINS", "NEXT_PUBLIC_OAUTH_ALLOWED_ORIGINS"];
  for (const key of listEnvKeys) {
    const raw = process.env[key];
    if (!raw) continue;
    raw
      .split(",")
      .map(entry => entry.trim())
      .filter(Boolean)
      .forEach(entry => rawValues.push(entry));
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

export function resolveRequestOrigin(request: Request, url: URL, override?: string | null): string {
  const fallbackOrigin = normalizeOrigin(url.origin) ?? url.origin;
  const forwardedOrigin = parseForwardedOrigin(request);
  const allowedOrigins = new Set<string>([fallbackOrigin]);

  if (forwardedOrigin) {
    allowedOrigins.add(forwardedOrigin);
  }

  for (const envOrigin of collectEnvOrigins()) {
    allowedOrigins.add(envOrigin);
  }

  const requestedOrigin = normalizeOrigin(override);
  if (requestedOrigin && allowedOrigins.has(requestedOrigin)) {
    return requestedOrigin;
  }

  if (forwardedOrigin && allowedOrigins.has(forwardedOrigin)) {
    return forwardedOrigin;
  }

  return fallbackOrigin;
}
