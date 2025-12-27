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
