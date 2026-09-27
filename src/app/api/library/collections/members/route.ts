import {
  type CollectionMember,
  collectionAccessSchema,
  collectionRoleSchema,
  setCollectionMemberRequestSchema,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Collection-scoped roles (media.collection_members). Everything runs on the caller's own
// session: RLS decides who can read a member list (a restricted collection's list is its
// members' and the brand owners'/admins' only), and media.set_collection_member /
// set_collection_access decide who can change one (owner, admin, or the collection's
// manager). No service role — the database is the gate, this route only relays.

type MemberRow = { user_id: string; role: string; added_by: string | null; created_at: string };

function rpcFailure(error: { code?: string; message: string }): Response {
  const status =
    error.code === '42501'
      ? 403
      : error.code === 'P0002'
        ? 404
        : error.code === '22023'
          ? 422
          : 500;
  if (status === 500) console.error('[library/collections/members] write failed', error);
  const message =
    status === 403
      ? 'Only a brand owner, admin or the collection manager can change access'
      : status === 404
        ? 'Collection not found'
        : status === 422
          ? 'That person is not a member of this brand'
          : 'Could not change access';
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const collectionId = new URL(request.url).searchParams.get('collectionId');
  if (!z.string().uuid().safeParse(collectionId).success) {
    return NextResponse.json({ error: 'Missing collectionId' }, { status: 400 });
  }

  const media = mediaSchema(supabase);
  const [collection, members, role] = await Promise.all([
    media.from('collections').select('access').eq('id', collectionId).maybeSingle(),
    media
      .from('collection_members')
      .select('user_id, role, added_by, created_at')
      .eq('collection_id', collectionId)
      .order('created_at', { ascending: true }),
    media.rpc('collection_role', { p_collection: collectionId }),
  ]);
  if (collection.error || members.error) {
    console.error('[library/collections/members] read failed', collection.error ?? members.error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  // RLS hides a restricted collection from a non-member: same answer as a missing one.
  if (!collection.data)
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

  const access = collectionAccessSchema.safeParse((collection.data as { access?: unknown }).access);
  const myRole = collectionRoleSchema.safeParse(role.data);
  return NextResponse.json({
    access: access.success ? access.data : 'brand',
    myRole: myRole.success ? myRole.data : null,
    members: ((members.data as MemberRow[] | null) ?? []).flatMap((row): CollectionMember[] => {
      const memberRole = collectionRoleSchema.safeParse(row.role);
      return memberRole.success
        ? [
            {
              userId: row.user_id,
              role: memberRole.data,
              addedBy: row.added_by,
              createdAt: row.created_at,
            },
          ]
        : [];
    }),
  });
}

// One verb for every change: { access } flips the flag, { userId, role } adds or re-roles,
// { userId, role: null } removes.
export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = setCollectionMemberRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { collectionId, userId, role, access } = parsed.data;
  const media = mediaSchema(supabase);

  if (access) {
    const { error } = await media.rpc('set_collection_access', {
      p_collection: collectionId,
      p_access: access,
    });
    if (error) return rpcFailure(error);
  }
  if (userId) {
    const { error } = await media.rpc('set_collection_member', {
      p_collection: collectionId,
      p_user: userId,
      p_role: role ?? null,
    });
    if (error) return rpcFailure(error);
  }
  return NextResponse.json({ ok: true });
}
