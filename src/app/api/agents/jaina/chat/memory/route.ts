import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/api/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const adAccountId = searchParams.get('ad_account_id');

  if (!adAccountId) {
    return NextResponse.json({ error: 'Missing ad_account_id' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = getApiBaseUrl();
  const upstreamUrl = `${baseUrl}/api/agents/jaina/chat/memory?ad_account_id=${encodeURIComponent(
    adAccountId,
  )}`;

  try {
    const backendResponse = await fetch(upstreamUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });

    if (!backendResponse.ok) {
      const detail = await backendResponse.text().catch(() => 'Failed to clear memory.');
      return NextResponse.json(
        { error: detail || 'Failed to clear memory.' },
        { status: backendResponse.status || 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing Jaina memory:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
