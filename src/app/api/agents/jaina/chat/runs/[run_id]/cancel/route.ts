import { NextResponse } from 'next/server';

import { getApiBaseUrl } from '@/lib/api/config';

export const runtime = 'nodejs';

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

function parseJsonOrNull(text: string): unknown {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type CancelRunRouteContext = {
  params: Promise<{ run_id: string }>;
};

export async function POST(request: Request, context: CancelRunRouteContext) {
  const authorization = resolveAuthorizationHeader(request);
  if (!authorization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { run_id: runId } = await context.params;
  const normalizedRunId = runId?.trim();
  if (!normalizedRunId) {
    return NextResponse.json({ error: 'Run id is required.' }, { status: 400 });
  }

  const baseUrl = getApiBaseUrl();
  const upstreamUrl = `${baseUrl}/api/agents/jaina/chat/runs/${encodeURIComponent(normalizedRunId)}/cancel`;

  try {
    const backendResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const text = await backendResponse.text().catch(() => '');
    const payload = parseJsonOrNull(text);

    if (payload !== null) {
      return NextResponse.json(payload, { status: backendResponse.status });
    }

    return NextResponse.json(
      { error: backendResponse.ok ? 'Empty cancel response.' : 'Failed to cancel run.' },
      { status: backendResponse.ok ? 502 : backendResponse.status || 500 },
    );
  } catch (error) {
    console.error('Error cancelling Jaina run:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
