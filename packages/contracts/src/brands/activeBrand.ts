// Shared active-brand resolution used by both the Frontend (web app active-brand
// context) and the Backend MCP connector (session auto-default). Keeping it here
// guarantees the connector defaults to the exact same brand the web app would.

export type ResolveActiveBrandInput = {
  candidateBrandId?: string | null;
  permittedBrandIds: string[];
};

export type ActiveBrandResolution = {
  activeBrandId: string | null;
  shouldPersist: boolean;
};

export function resolveActiveBrandId({
  candidateBrandId,
  permittedBrandIds,
}: ResolveActiveBrandInput): ActiveBrandResolution {
  if (permittedBrandIds.length === 0) {
    return { activeBrandId: null, shouldPersist: false };
  }

  const normalizedCandidate =
    typeof candidateBrandId === "string" && candidateBrandId.trim().length > 0
      ? candidateBrandId
      : null;

  if (normalizedCandidate && permittedBrandIds.includes(normalizedCandidate)) {
    return { activeBrandId: normalizedCandidate, shouldPersist: false };
  }

  return {
    activeBrandId: permittedBrandIds[0] ?? null,
    shouldPersist: true,
  };
}
