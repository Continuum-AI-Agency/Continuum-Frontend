import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/api/config';
import { planApprovalCommandSchema } from '@/lib/jaina/schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsedBody = planApprovalCommandSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Invalid plan approval payload.' }, { status: 400 });
  }

  const baseUrl = getApiBaseUrl();
  const upstreamUrl = `${baseUrl}/api/agents/jaina/chat/plan/approval`;

  try {
    const backendResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(parsedBody.data),
      cache: 'no-store',
    });

    if (!backendResponse.ok) {
      const detail = await backendResponse.text().catch(() => 'Failed to submit plan approval.');
      return NextResponse.json(
        { error: detail || 'Failed to submit plan approval.' },
        { status: backendResponse.status || 500 },
      );
    }

    const payload = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error submitting Jaina plan approval:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
