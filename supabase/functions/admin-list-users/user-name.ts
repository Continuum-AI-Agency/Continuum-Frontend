type AuthUserMetadata = Record<string, unknown> | null | undefined;

function getStringValue(input: unknown) {
  return typeof input === "string" ? input.trim() : "";
}

export function resolveAuthUserName(metadata: AuthUserMetadata): string | null {
  const name = getStringValue(metadata?.name);
  if (name) return name;

  const fullName = getStringValue(metadata?.full_name);
  if (fullName) return fullName;

  return null;
}
