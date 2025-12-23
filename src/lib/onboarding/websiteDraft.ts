export function resolveWebsiteDraftUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length < 5) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const hasProtocolRelative = /^\/\//.test(trimmed);
  const withScheme = hasScheme
    ? trimmed
    : hasProtocolRelative
      ? `https:${trimmed}`
      : `https://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
