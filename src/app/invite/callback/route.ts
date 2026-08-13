import { type NextRequest, NextResponse } from 'next/server';
import { finalizeInviteAcceptance } from '@/lib/invites/finalize';
import { normalizeInviteBrandId, normalizeInviteToken } from '@/lib/invites/params';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Redeem an invite link.
 *
 * A ROUTE HANDLER, not a page, and that is the whole point: this has to establish a
 * session before it can accept anything, and only route handlers may write cookies.
 * `createSupabaseServerClient`'s `setAll` swallows writes from a Server Component,
 * so the page this replaced could never hold a session — it read `getSession()`,
 * found nothing, and bounced to `/login`. The invite was never redeemed; the user
 * just ended up signed in, and onboarding then minted her a NEW brand instead of
 * joining the one she was invited to.
 *
 * `otp` is Supabase's `hashed_token`, put on the link by the `brand_invite` edge
 * function. Redeeming it here keeps the session server-side. The alternative — the
 * `action_link` through `/auth/v1/verify` — returns the session in the URL fragment,
 * which a server never sees.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const token = normalizeInviteToken(params.get('token'));
  const brandId = normalizeInviteBrandId(params.get('brand'));
  const otp = normalizeInviteToken(params.get('otp'));
  const otpType = params.get('type');
  const origin = request.nextUrl.origin;

  if (!token || !brandId) {
    return NextResponse.redirect(new URL('/dashboard?invite=missing_params', origin));
  }

  if (otp) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: otp,
      type: otpType === 'magiclink' ? 'magiclink' : 'invite',
    });
    // A spent or expired otp is not fatal: the invite token is still good, so fall
    // through and let finalize decide between an existing session and /login.
    if (error) {
      console.warn('[invite/callback] could not redeem the sign-in token:', error.message);
    }
  }

  const result = await finalizeInviteAcceptance(token, brandId);
  return NextResponse.redirect(new URL(result.path, origin));
}
