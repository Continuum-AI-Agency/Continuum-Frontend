// Browser beacon for what only the page sees: the link opened, an asset came
// into view, a video started playing. Everything else is recorded server-side
// where the action happens.

import { shareBeaconEventRequestSchema } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { resolveShareLink, shareHasAsset } from '../loadSharePayload';
import { recordShareEvent, reviewerSessionToken } from '../shareEvents.server';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = shareBeaconEventRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_event' }, { status: 422 });

  const resolved = await resolveShareLink(token, await reviewerSessionToken(token));
  if (!resolved.ok) return NextResponse.json({ error: resolved.reason }, { status: 404 });
  if (
    parsed.data.assetId &&
    !(await shareHasAsset(resolved.admin, resolved.link, parsed.data.assetId))
  ) {
    return NextResponse.json({ error: 'asset_not_shared' }, { status: 404 });
  }

  await recordShareEvent(
    {
      linkId: resolved.link.id,
      brandId: resolved.link.brand_id,
      sessionId: resolved.session?.id ?? null,
    },
    parsed.data,
  );
  return new NextResponse(null, { status: 204 });
}
