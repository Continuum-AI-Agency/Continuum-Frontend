import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

const FUNCTION_NAME = 'planner-compositions';

function edgeUrl(request: Request): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return baseUrl ? `${baseUrl}/functions/v1/${FUNCTION_NAME}${new URL(request.url).search}` : null;
}

async function forwardToEdge(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const url = edgeUrl(request);
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    return NextResponse.json({ error: 'Supabase Edge Function is not configured.' }, { status: 500 });
  }

  const response = await fetch(url, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: publishableKey,
      ...(request.method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(request.method === 'GET' ? {} : { body: await request.text() }),
    cache: 'no-store',
  });

  const headers = new Headers();
  const contentType = response.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  return new Response(response.body, { status: response.status, headers });
}

export async function GET(request: Request) {
  return forwardToEdge(request);
}

export async function POST(request: Request) {
  return forwardToEdge(request);
}

export async function PATCH(request: Request) {
  return forwardToEdge(request);
}
