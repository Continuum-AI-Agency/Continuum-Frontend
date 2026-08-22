import { NextResponse } from 'next/server';

import { getApiBaseUrl } from '@/lib/api/config';
import { jainaChatStopRequestSchema, jainaChatStopResponseSchema } from '@/lib/jaina/schemas';

function resolveAuthorizationHeader(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return null;
  }

  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  return authorization;
}

export async function POST(request: Request) {
  const authorization = resolveAuthorizationHeader(request);
  if (!authorization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsedBody = jainaChatStopRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Invalid stop payload' }, { status: 400 });
  }

  const baseUrl = getApiBaseUrl();
  const upstreamUrl = `${baseUrl}/api/agents/jaina/chat/stop`;

  try {
    const backendResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(parsedBody.data),
      cache: 'no-store',
    });

    if (!backendResponse.ok) {
      const detail = await backendResponse.text().catch(() => 'Failed to stop Jaina runs.');
      return NextResponse.json(
        { error: detail || 'Failed to stop Jaina runs.' },
        { status: backendResponse.status || 500 },
      );
    }

    const payload = await backendResponse.json().catch(() => null);
    const parsedPayload = jainaChatStopResponseSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return NextResponse.json({ error: 'Invalid stop response from backend.' }, { status: 502 });
    }

    return NextResponse.json(parsedPayload.data);
  } catch (error) {
    console.error('Error stopping Jaina runs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
