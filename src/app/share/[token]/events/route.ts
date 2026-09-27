// Browser beacon for what only the page sees: the link opened, an asset came
// into view, a video started playing. The edge function checks the link, the
// session and that the asset is on the link before it records anything.

import { shareBeaconEventRequestSchema } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { recordShareEvent } from '../shareEvents.server';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = shareBeaconEventRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_event' }, { status: 422 });
  const result = await recordShareEvent(token, parsed.data);
  return result.ok
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json({ error: 'not_recorded' }, { status: result.status });
}
