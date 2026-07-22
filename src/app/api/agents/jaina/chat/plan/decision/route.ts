import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/api/config';
import { type PlanDecisionAnyCommand, planDecisionAnyCommandSchema } from '@/lib/jaina/schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type ParsedCommandBody = {
  primary?: unknown;
  compatibility?: unknown;
  legacy?: unknown;
};

function extractCommands(body: unknown): unknown[] {
  if (body && typeof body === 'object' && 'type' in body) {
    return [body];
  }

  if (!body || typeof body !== 'object') {
    return [];
  }

  const candidate = body as ParsedCommandBody;
  return [candidate.primary, candidate.compatibility, candidate.legacy].filter(
    (item) => item !== undefined,
  );
}

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

  const commands: PlanDecisionAnyCommand[] = [];

  for (const payload of extractCommands(body)) {
    const parsed = planDecisionAnyCommandSchema.safeParse(payload);
    if (parsed.success) {
      commands.push(parsed.data);
    }
  }

  if (commands.length === 0) {
    return NextResponse.json({ error: 'Invalid plan decision payload.' }, { status: 400 });
  }

  const baseUrl = getApiBaseUrl();
  const upstreamUrls = [
    `${baseUrl}/api/agents/jaina/chat/plan/decision`,
    `${baseUrl}/api/agents/jaina/chat/plan/approval`,
  ];

  let lastErrorStatus = 500;
  let lastErrorMessage = 'Failed to submit plan decision.';

  for (const upstreamUrl of upstreamUrls) {
    for (const command of commands) {
      try {
        const backendResponse = await fetch(upstreamUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(command),
          cache: 'no-store',
        });

        if (backendResponse.ok) {
          const payload = await backendResponse.json().catch(() => ({}));
          return NextResponse.json(payload);
        }

        const detail = await backendResponse.text().catch(() => 'Failed to submit plan decision.');
        lastErrorStatus = backendResponse.status || 500;
        lastErrorMessage = detail || 'Failed to submit plan decision.';
      } catch (error) {
        lastErrorStatus = 500;
        lastErrorMessage =
          error instanceof Error ? error.message : 'Failed to submit plan decision.';
      }
    }
  }

  return NextResponse.json({ error: lastErrorMessage }, { status: lastErrorStatus });
}
