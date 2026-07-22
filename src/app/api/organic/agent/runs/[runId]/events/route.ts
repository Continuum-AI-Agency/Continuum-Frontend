import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/api/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
] as const;

function createStreamResponseHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers(upstreamHeaders);
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
  headers.set('Content-Type', 'application/x-ndjson');
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('X-Accel-Buffering', 'no');
  return headers;
}

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
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

  const { runId } = await params;
  const url = new URL(request.url);
  const afterSeq = url.searchParams.get('after_seq') ?? '0';

  const baseUrl = getApiBaseUrl();
  const upstreamUrl = `${baseUrl}/api/organic/agent/runs/${encodeURIComponent(runId)}/events?after_seq=${encodeURIComponent(afterSeq)}`;

  const backendResponse = await fetch(upstreamUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/x-ndjson',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!backendResponse.ok || !backendResponse.body) {
    const detail = await backendResponse.text().catch(() => 'Failed to fetch run events.');
    return NextResponse.json(
      { error: detail || 'Failed to fetch run events.' },
      { status: backendResponse.status || 500 },
    );
  }

  const headers = createStreamResponseHeaders(backendResponse.headers);
  return new Response(backendResponse.body, {
    headers,
    status: backendResponse.status,
    statusText: backendResponse.statusText,
  });
}
