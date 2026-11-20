// Pure resolver for which brand an MCP connector binds to at consent time.
// Kept out of the "use server" actions module (which may only export async
// server actions) so it can be unit-tested directly. A user-selected brand is
// honored only when it is one the user can access; otherwise we fall back to the
// active brand. The backend confirm endpoint re-verifies access regardless.

export function resolveConfirmBrandId(
  requestedBrandId: string | null | undefined,
  accessibleBrandIds: readonly string[],
  activeBrandId: string | null,
): string | null {
  if (requestedBrandId && accessibleBrandIds.includes(requestedBrandId)) {
    return requestedBrandId;
  }
  return activeBrandId;
}
