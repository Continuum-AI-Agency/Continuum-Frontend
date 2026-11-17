import { claimsIdentityOf } from '@/lib/auth/claims';
import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/api/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// A chat turn streams for as long as the agent works — minutes when it retries a tool or
// delegates. Without this the platform default cut the proxy mid-answer, the browser saw the
// stream break, and the turn looked failed while the Backend kept running it. 300 s is the
// ceiling every Vercel plan allows; a longer turn is picked up by the client's replay poll.
export const maxDuration = 300;

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
  const user = await claimsIdentityOf(supabase);
  if (!user) {
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
