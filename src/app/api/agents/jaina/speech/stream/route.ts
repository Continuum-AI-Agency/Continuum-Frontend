import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type SpeechProxyRequest = {
  audioBase64: string;
  mimeType?: string;
  languageCode?: string;
  stream?: boolean;
  model?: string;
};

function relayResponseBody(response: Response): ReadableStream<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      if (value) controller.enqueue(value);
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
}

export async function POST(request: Request) {
  let payload: SpeechProxyRequest;
  try {
    payload = (await request.json()) as SpeechProxyRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload?.audioBase64?.trim()) {
    return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 });
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Missing Supabase URL' }, { status: 500 });
  }

  const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/jaina-speech-to-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: payload.stream === false ? 'application/json' : 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!edgeResponse.ok) {
    const message = await edgeResponse.text().catch(() => 'Speech service unavailable');
    return NextResponse.json(
      { error: message || 'Speech service unavailable' },
      { status: edgeResponse.status || 500 },
    );
  }

  if (payload.stream === false) {
    const json = await edgeResponse.json().catch(() => null);
    return NextResponse.json(json ?? { error: 'Invalid speech payload' }, {
      status: edgeResponse.status,
    });
  }

  const headers = new Headers(edgeResponse.headers);
  headers.set('Content-Type', 'text/event-stream');
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('Connection', 'keep-alive');
  headers.set('X-Accel-Buffering', 'no');
  headers.delete('content-length');

  return new Response(relayResponseBody(edgeResponse), {
    headers,
    status: edgeResponse.status,
  });
}
