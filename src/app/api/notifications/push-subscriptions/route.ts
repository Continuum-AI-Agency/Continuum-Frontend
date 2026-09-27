// Registers this browser's Push API subscription for the signed-in user
// (brand_profiles.web_push_subscriptions, RLS: own rows). The endpoint is the
// identity: re-subscribing the same browser refreshes its keys instead of adding a row.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const subscriptionSchema = z
  .object({
    endpoint: z
      .string()
      .url()
      .regex(/^https:\/\//),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  })
  .passthrough();

async function signedIn() {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return user ? { client, userId: user.id } : null;
}

export async function POST(request: Request) {
  const session = await signedIn();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 422 });

  const { data, error } = await session.client
    .schema('brand_profiles')
    .from('web_push_subscriptions')
    .upsert(
      {
        user_id: session.userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: request.headers.get('user-agent'),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
    .select('id')
    .single();
  if (error || !data) {
    console.error('[notifications/push-subscriptions] save failed', error);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await signedIn();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 422 });
  const { error } = await session.client
    .schema('brand_profiles')
    .from('web_push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
