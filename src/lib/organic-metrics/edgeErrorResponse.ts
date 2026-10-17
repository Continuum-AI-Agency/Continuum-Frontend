// How an organic-analytics route answers when the organic-reporting edge refused the request.
//
// The edge names what went wrong: a 4xx is the CALLER's (an account not linked to the brand, a
// session it would not accept, a body it would not parse) and goes back with its own status and
// code, so the surface can name it; a provider failure stays a 502 carrying its code. Every route
// used to answer any coded refusal with 502 and an uncoded one with 500, which made a Home asking
// for another brand's Facebook account read as a server outage
// (PP-L1-organic-analytics-facebook-500-from-home).

import { NextResponse } from 'next/server';

type EdgeErrorBody = { error?: string; errorCode?: string; retryAfter?: number; platform?: string };

function contextOf(error: unknown): Response | null {
  const context = (error as { context?: unknown } | null)?.context;
  return context instanceof Response ? context : null;
}

export async function organicEdgeErrorResponse(
  error: unknown,
  fallbackMessage: string,
): Promise<NextResponse> {
  const context = contextOf(error);
  const body = context
    ? ((await context
        .clone()
        .json()
        .catch(() => null)) as EdgeErrorBody | null)
    : null;
  const status = context?.status ?? null;

  if (status !== null && status >= 400 && status < 500) {
    return NextResponse.json({ ...body, error: body?.error ?? fallbackMessage }, { status });
  }
  if (body?.errorCode) return NextResponse.json(body, { status: 502 });
  return NextResponse.json({ error: body?.error ?? fallbackMessage }, { status: 502 });
}
