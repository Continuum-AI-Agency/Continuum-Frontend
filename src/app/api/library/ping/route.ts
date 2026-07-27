import { reviewPingRequestSchema, reviewPingResponseSchema } from '@continuum/contracts';
import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchBrandMembers } from '@/lib/brands/members';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// GET /api/library/ping?brandId= — brand members the caller may ping.
// RequestReviewButton uses this to populate the recipient picker; the
// server-only fetchBrandMembers cannot run in the client component.
export async function GET(request: Request) {
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
}

// POST /api/library/ping — write one review_request notification per selected
// brand member, then fan out email via the send-library-ping edge function.
// Email is fail-soft: a send failure never fails the ping.
export async function POST(request: Request) {
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

  const admin = createSupabaseAdminClient();

  const { data: assetData, error: assetError } = await mediaSchema(admin)
    .from('assets')
    .select('id, title, file_name')
    .eq('id', input.assetId)
    .eq('brand_id', input.brandId)
    .maybeSingle();
  if (assetError) {
    console.error('[library-ping] asset lookup failed', { error: assetError.message });
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
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

  // Only actual brand members receive notifications; the same rows carry the
  // emails for the edge-function fan-out.
  const { data: memberData, error: membersError } = await admin
    .schema('brand_profiles')
    .from('permissions')
    .select('user_id, email')
    .eq('brand_profile_id', input.brandId)
    .in('user_id', recipientIds);
  if (membersError) {
    console.error('[library-ping] member lookup failed', { error: membersError.message });
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  const recipients = (memberData ?? []) as Array<{ user_id: string; email: string | null }>;
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No matching brand members' }, { status: 400 });
  }

  const actorName = resolveActorName(user);
  const message = input.message?.trim() ? input.message.trim() : null;
  const pingId = crypto.randomUUID();
  const payload = { pingId, assetId: asset.id, assetName, message, actorName };

  const { data: inserted, error: insertError } = await admin
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
    )
    .select('id');
  if (insertError) {
    console.error('[library-ping] notification insert failed', { error: insertError.message });
    return NextResponse.json({ error: 'Failed to write notifications' }, { status: 500 });
  }
  const notified = (inserted ?? []).length;

  const recipientEmails = [
    ...new Set(recipients.map((r) => r.email).filter((email): email is string => Boolean(email))),
  ];
  const emailed = await sendPingEmails({
    pingId,
    brandId: input.brandId,
    assetId: asset.id,
    assetName,
    recipientEmails,
    actorName,
    message,
  });

  return NextResponse.json(reviewPingResponseSchema.parse({ notified, emailed }));
}

function resolveActorName(user: User): string {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  for (const key of ['name', 'full_name']) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return user.email ?? 'A teammate';
}

// Fail-soft edge invoke: any failure logs and reports 0 emails sent. Mirrors
// the register-canvas → analyze_media service-key invocation pattern.
async function sendPingEmails(params: {
  pingId: string;
  brandId: string;
  assetId: string;
  assetName: string;
  recipientEmails: string[];
  actorName: string;
  message: string | null;
}): Promise<number> {
  if (params.recipientEmails.length === 0) return 0;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn('[library-ping] email skipped: missing Supabase env');
    return 0;
  }
  const appUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? 'http://localhost:3000';

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-library-ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        pingId: params.pingId,
        brandId: params.brandId,
        assetId: params.assetId,
        assetName: params.assetName,
        recipientEmails: params.recipientEmails,
        actorName: params.actorName,
        ...(params.message ? { message: params.message } : {}),
        appUrl,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      emailed?: number;
      skipped?: string;
      error?: string;
    } | null;
    if (!response.ok) {
      console.warn('[library-ping] send-library-ping failed', {
        status: response.status,
        error: body?.error,
      });
      return 0;
    }
    if (body?.skipped) {
      console.warn('[library-ping] email skipped by edge function', { reason: body.skipped });
    }
    return typeof body?.emailed === 'number' ? body.emailed : 0;
  } catch (error) {
    console.warn('[library-ping] send-library-ping invoke failed', { error: String(error) });
    return 0;
  }
}
