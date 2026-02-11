export function buildInviteCallbackPath(token: string, brandId: string): string {
  const params = new URLSearchParams({
    token,
    brand: brandId,
  });
  return `/invite/callback?${params.toString()}`;
}

export function buildInviteLoginRedirect(token: string, brandId: string): string {
  const params = new URLSearchParams({
    token,
    brand: brandId,
  });
  return `/login?${params.toString()}`;
}
