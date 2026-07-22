import { NextResponse } from 'next/server';
import { buildOAuthCallbackUrl } from '@/lib/oauth';
import { resolveRequestOrigin } from '@/lib/server/origin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const SUPABASE_PROVIDERS = new Set(['google']);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');
  const context = url.searchParams.get('context') ?? 'onboarding';
  const isPopup = url.searchParams.get('popup') === 'true';

  const resolvedOrigin = resolveRequestOrigin(request, url, url.searchParams.get('origin'));

  if (!provider) {
    return NextResponse.json({ error: 'provider is required' }, { status: 400 });
  }

  if (!SUPABASE_PROVIDERS.has(provider)) {
    const fallback = new URL('/oauth/mock', resolvedOrigin);
    fallback.searchParams.set('provider', provider);
    fallback.searchParams.set('context', context);
    if (isPopup) {
      fallback.searchParams.set('popup', 'true');
    }
    return NextResponse.redirect(fallback);
  }

  const supabase = await createSupabaseServerClient();
  const redirectTo = buildOAuthCallbackUrl(resolvedOrigin, provider, context, { popup: isPopup });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as 'google',
    options: { redirectTo },
  });

  if (error || !data?.url) {
    const errorMessage = error?.message ?? 'Unable to start OAuth flow.';
    const fallback = new URL('/oauth/mock', resolvedOrigin);
    fallback.searchParams.set('provider', provider);
    fallback.searchParams.set('context', context);
    fallback.searchParams.set('error', errorMessage);
    return NextResponse.redirect(fallback);
  }

  return NextResponse.redirect(data.url);
}
