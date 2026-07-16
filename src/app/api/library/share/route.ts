// Share-link management for library assets/collections. media.share_links has
// deny-all RLS (service-role only), so every operation authenticates the user,
// gates on has_brand_access, and then uses the admin client. The public
// consumption side lives at /share/[token] (RSC, no auth).

import { randomBytes } from 'node:crypto';
import { createShareLinkRequestSchema, revokeShareLinkRequestSchema } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  expiresAtFromDays,
  rowToShareLink,
  type ShareLinkRow,
} from '@/lib/library/shareValidation';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type AuthedCaller = { userId: string };

async function authorizeBrandCaller(brandId: string): Promise<AuthedCaller | NextResponse> {
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
  return { userId: user.id };
}

function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

// The share target must belong to the brand the caller was authorized for;
// otherwise a member of brand A could mint public links to brand B's assets.
async function shareTargetExists(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    scope: 'asset' | 'collection' | 'selection';
    brandId: string;
    assetId?: string;
    collectionId?: string;
  },
): Promise<boolean> {
  if (input.scope === 'asset') {
    const { data } = await mediaSchema(admin)
      .from('assets')
      .select('id')
      .eq('id', input.assetId ?? '')
      .eq('brand_id', input.brandId)
      .is('deleted_at', null)
      .maybeSingle();
    return Boolean(data);
  }
  if (input.scope === 'selection') return false;
  const { data } = await mediaSchema(admin)
    .from('collections')
    .select('id')
    .eq('id', input.collectionId ?? '')
    .eq('brand_id', input.brandId)
    .maybeSingle();
  return Boolean(data);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = createShareLinkRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }

  const caller = await authorizeBrandCaller(parsed.data.brandId);
  if (caller instanceof NextResponse) return caller;
  if (parsed.data.scope === 'selection') {
    return NextResponse.json(
      { error: 'Selection shares are available through Creative Operations.' },
      { status: 410 },
    );
  }

  const admin = createSupabaseAdminClient();
  if (!(await shareTargetExists(admin, parsed.data))) {
    return NextResponse.json({ error: 'Share target not found' }, { status: 404 });
  }

  const token = randomBytes(32).toString('base64url');
  const { data, error } = await mediaSchema(admin)
    .from('share_links')
    .insert({
      brand_id: parsed.data.brandId,
      token,
      scope: parsed.data.scope,
      asset_id: parsed.data.assetId ?? null,
      collection_id: parsed.data.collectionId ?? null,
      permissions: 'view',
      created_by: caller.userId,
      expires_at: expiresAtFromDays(parsed.data.expiresInDays),
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[library/share] create failed', error);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }

  return NextResponse.json(rowToShareLink(data as ShareLinkRow, requestOrigin(request)), {
    status: 201,
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const brandId = params.get('brandId');
  const assetId = params.get('assetId');
  if (!brandId || !z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: 'Missing brandId' }, { status: 400 });
  }
  if (!assetId || !z.string().uuid().safeParse(assetId).success) {
    return NextResponse.json({ error: 'Missing assetId' }, { status: 400 });
  }

  const caller = await authorizeBrandCaller(brandId);
  if (caller instanceof NextResponse) return caller;

  const admin = createSupabaseAdminClient();
  const { data, error } = await mediaSchema(admin)
    .from('share_links')
    .select('*')
    .eq('brand_id', brandId)
    .eq('asset_id', assetId)
    .order('revoked_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[library/share] list failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const origin = requestOrigin(request);
  const links = ((data as ShareLinkRow[] | null) ?? []).map((row) => rowToShareLink(row, origin));
  return NextResponse.json({ links });
}

export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = revokeShareLinkRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }

  const caller = await authorizeBrandCaller(parsed.data.brandId);
  if (caller instanceof NextResponse) return caller;

  const admin = createSupabaseAdminClient();
  const { data, error } = await mediaSchema(admin)
    .from('share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', parsed.data.shareLinkId)
    .eq('brand_id', parsed.data.brandId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[library/share] revoke failed', error);
    return NextResponse.json({ error: 'Revoke failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
  }

  return NextResponse.json(rowToShareLink(data as ShareLinkRow, requestOrigin(request)));
}
