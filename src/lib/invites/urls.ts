type SignInHandoff = {
  // Supabase's `hashed_token`, put on the link by the brand_invite edge function.
  // The callback redeems it server-side; dropping it costs the recipient a
  // sign-in round trip they should never have needed.
  otp?: string | null;
  type?: string | null;
};

export function buildInviteCallbackPath(
  token: string,
  brandId: string,
  handoff: SignInHandoff = {},
): string {
  const params = new URLSearchParams({
    token,
    brand: brandId,
  });
  if (handoff.otp) params.set('otp', handoff.otp);
  if (handoff.type) params.set('type', handoff.type);
  return `/invite/callback?${params.toString()}`;
}

export function buildInviteLoginRedirect(token: string, brandId: string): string {
  const params = new URLSearchParams({
    token,
    brand: brandId,
  });
  return `/login?${params.toString()}`;
}
