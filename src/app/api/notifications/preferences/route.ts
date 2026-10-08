// The signed-in user's notification preferences (brand_profiles.notification_preferences).
// RLS scopes every row to auth.uid(), so the user-scoped client is the whole boundary;
// the body is validated against the contract before anything is written.

import {
  notificationChannelSchema,
  notificationFrequencySchema,
  notificationPreferenceSchema,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const putSchema = z
  .object({
    preferences: z
      .array(
        z
          .object({
            kind: notificationPreferenceSchema.shape.kind,
            channel: notificationChannelSchema,
            frequency: notificationFrequencySchema,
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

async function signedIn() {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return user ? { client, userId: user.id } : null;
}

export async function GET() {
  const session = await signedIn();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await session.client
    .schema('brand_profiles')
    .from('notification_preferences')
    .select('user_id, kind, channel, frequency, updated_at');
  if (error) {
    console.error('[notifications/preferences] list failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  const preferences = (data ?? []).flatMap((row) => {
    const parsed = notificationPreferenceSchema.safeParse({
      userId: row.user_id,
      kind: row.kind,
      channel: row.channel,
      frequency: row.frequency,
      updatedAt: row.updated_at,
    });
    return parsed.success ? [parsed.data] : [];
  });
  return NextResponse.json({ preferences });
}

export async function PUT(request: Request) {
  const session = await signedIn();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 422 });

  const updatedAt = new Date().toISOString();
  const { error } = await session.client
    .schema('brand_profiles')
    .from('notification_preferences')
    .upsert(
      parsed.data.preferences.map((preference) => ({
        user_id: session.userId,
        ...preference,
        updated_at: updatedAt,
      })),
      { onConflict: 'user_id,kind,channel' },
    );
  if (error) {
    console.error('[notifications/preferences] save failed', error);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
  return NextResponse.json({ saved: parsed.data.preferences.length });
}
