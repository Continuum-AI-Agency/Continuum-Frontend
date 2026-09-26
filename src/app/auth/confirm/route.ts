import { type NextRequest, NextResponse } from 'next/server';
import { resolveAuthRedirectPath } from '@/lib/auth/redirect';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const redirectTo = request.nextUrl.searchParams.get('redirect_to');
  let next = '/dashboard';

  if (redirectTo) {
    try {
      const callback = new URL(redirectTo);
      if (callback.origin === origin && callback.pathname === '/auth/callback') {
        next = resolveAuthRedirectPath({
          requestedRedirect: callback.searchParams.get('next') ?? undefined,
          siteUrl: origin,
        });
      }
    } catch {
      // An invalid or unrelated redirect falls back to the dashboard.
    }
  }

  if (tokenHash) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    console.error('[AUTH_CONFIRM] Failed to verify email link:', error.message);
  }

  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin));
}
