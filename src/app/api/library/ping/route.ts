import { reviewPingRequestSchema, reviewPingResponseSchema } from '@continuum/contracts';
import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchBrandMembers } from '@/lib/brands/members';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function asFailure(error: unknown): string {
  return error instanceof Error ? error.message : 'Internal server error';
}

function serviceUnavailable(message: string) {
  return NextResponse.json({ error: message }, { status: 503 });
}

// GET /api/library/ping?brandId= — brand members the caller may ping.
// RequestReviewButton uses this to populate the recipient picker; the
// server-only fetchBrandMembers cannot run in the client component.
export async function GET(request: Request) {
  try {
    const brandId = new URL(request.url).searchParams.get('brandId');
    if (!brandId) {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await callerHasBrandAccess(supabase, brandId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const members = await fetchBrandMembers(brandId);
    return NextResponse.json({
      members: members.map((member) => ({
        id: member.id,
        email: member.email,
        role: member.role,
      })),
    });
  } catch (error) {
    console.error('[library-ping] GET failed', {
      error: asFailure(error),
    });
    return serviceUnavailable('Service temporarily unavailable while loading recipients');
  }
}

// POST /api/library/ping — write one review_request notification per selected
// brand member, then fan out email + Slack via the send-library-ping edge function.
// Email is fail-soft: a send failure never fails the ping.
export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = reviewPingRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 422 });
    }
    const input = parsed.data;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await callerHasBrandAccess(supabase, input.brandId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: assetData, error: assetError } = await mediaSchema(supabase)
      .from('assets')
      .select('id, title, file_name')
      .eq('id', input.assetId)
      .eq('brand_id', input.brandId)
      .maybeSingle();
    if (assetError) {
      console.error('[library-ping] asset lookup failed', { error: assetError.message });
      return serviceUnavailable('Service temporarily unavailable while loading the asset');
    }
    const asset = assetData as { id: string; title: string | null; file_name: string } | null;
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    const assetName = asset.title ?? asset.file_name;

    const recipientIds = [...new Set(input.recipientUserIds)].filter((id) => id !== user.id);
    if (recipientIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one other teammate' }, { status: 400 });
    }

    // Only actual brand members receive notifications.
    const { data: memberData, error: membersError } = await supabase
      .schema('brand_profiles')
      .from('permissions')
      .select('user_id')
      .eq('brand_profile_id', input.brandId)
      .in('user_id', recipientIds);
    if (membersError) {
      console.error('[library-ping] member lookup failed', { error: membersError.message });
      return serviceUnavailable('Service temporarily unavailable while loading members');
    }
    const recipients = (memberData ?? []) as Array<{ user_id: string }>;
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No matching brand members' }, { status: 400 });
    }

    const actorName = resolveActorName(user);
    const message = input.message?.trim() ? input.message.trim() : null;
    const pingId = crypto.randomUUID();
    const payload = { pingId, assetId: asset.id, assetName, message, actorName };

    // No RETURNING: the SELECT policy shows a notification only to its recipient, so a
    // sender reading back the rows it wrote is refused (42501) and the whole insert fails.
    const { error: insertError } = await supabase
      .schema('brand_profiles')
      .from('notifications')
      .insert(
        recipients.map((recipient) => ({
          brand_id: input.brandId,
          recipient_user_id: recipient.user_id,
          actor_user_id: user.id,
          kind: 'review_request',
          payload,
        })),
      );
    if (insertError) {
      console.error('[library-ping] notification insert failed', { error: insertError.message });
      return serviceUnavailable('Service temporarily unavailable while writing notifications');
    }
    const notified = recipients.length;

    const emailed = await sendPingFanOut(supabase, { pingId, brandId: input.brandId });

    return NextResponse.json(reviewPingResponseSchema.parse({ notified, emailed }));
  } catch (error) {
    console.error('[library-ping] POST failed', { error: asFailure(error) });
    return serviceUnavailable('Service temporarily unavailable while sending ping');
  }
}

function resolveActorName(user: User): string {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  for (const key of ['name', 'full_name']) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return user.email ?? 'A teammate';
}

// Email + Slack fan-out through send-library-ping, on the CALLER's session: Vercel holds no
// service-role key. The edge function checks the caller's brand access and reads the
// recipients and content back from the notification rows written above, so this sends only
// the ping id. Fail-soft: a delivery failure never fails the ping, it reports 0 emails.
async function sendPingFanOut(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  params: { pingId: string; brandId: string },
): Promise<number> {
  const appUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? 'http://localhost:3000';
  const { data, error } = await supabase.functions.invoke<{
    emailed?: number;
    skipped?: string;
  }>('send-library-ping', { body: { ...params, appUrl } });
  if (error) {
    console.warn('[library-ping] send-library-ping failed', { error: error.message });
    return 0;
  }
  if (data?.skipped) {
    console.warn('[library-ping] email skipped by edge function', { reason: data.skipped });
  }
  return typeof data?.emailed === 'number' ? data.emailed : 0;
}
