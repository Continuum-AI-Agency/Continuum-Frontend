import { addCommentReactionRequestSchema, commentReactionSchema } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Emoji reactions on Library comments (media.comment_reactions). Every handler runs
// on the caller's own client: the table's RLS — the comment's brand, restricted
// collections, and "only your own" for insert/delete — is the boundary; the database
// stamps brand_id/asset_id from the comment and user_id from the caller.

const REACTION_SELECT = 'comment_id, brand_id, asset_id, user_id, emoji, created_at';

type ReactionRow = {
  comment_id: string;
  brand_id: string;
  asset_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

const listQuerySchema = z.object({ brandId: z.string().uuid(), assetId: z.string().uuid() });
const mutationSchema = addCommentReactionRequestSchema.extend({ brandId: z.string().uuid() });

function toReaction(row: ReactionRow) {
  return commentReactionSchema.parse({
    commentId: row.comment_id,
    brandId: row.brand_id,
    assetId: row.asset_id,
    userId: row.user_id,
    emoji: row.emoji,
    createdAt: row.created_at,
  });
}

type Caller = { supabase: SupabaseClient; userId: string };

async function caller(): Promise<Caller | NextResponse> {
  const supabase = (await createSupabaseServerClient()) as unknown as SupabaseClient;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return { supabase, userId: user.id };
}

async function readMutation(
  request: Request,
  supabase: SupabaseClient,
): Promise<z.infer<typeof mutationSchema> | NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = mutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });
  }
  if (!(await callerHasBrandAccess(supabase, parsed.data.brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return parsed.data;
}

export async function GET(request: Request) {
  const auth = await caller();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
  });
  if (!parsed.success) return NextResponse.json({ error: 'brandId and assetId' }, { status: 422 });
  const { data, error } = await mediaSchema(supabase)
    .from('comment_reactions')
    .select(REACTION_SELECT)
    .eq('brand_id', parsed.data.brandId)
    .eq('asset_id', parsed.data.assetId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[library/comments/reactions] list failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  return NextResponse.json({ reactions: ((data ?? []) as ReactionRow[]).map(toReaction) });
}

export async function POST(request: Request) {
  const auth = await caller();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const input = await readMutation(request, supabase);
  if (input instanceof NextResponse) return input;
  const { data, error } = await mediaSchema(supabase)
    .from('comment_reactions')
    .upsert(
      { comment_id: input.commentId, emoji: input.emoji },
      { onConflict: 'comment_id,user_id,emoji', ignoreDuplicates: true },
    )
    .select(REACTION_SELECT);
  if (error) {
    console.error('[library/comments/reactions] add failed', error);
    const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : 500;
    return NextResponse.json({ error: 'Could not add the reaction' }, { status });
  }
  const row = (data as ReactionRow[] | null)?.[0];
  return NextResponse.json({ reaction: row ? toReaction(row) : null }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await caller();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;
  const input = await readMutation(request, supabase);
  if (input instanceof NextResponse) return input;
  const { error } = await mediaSchema(supabase)
    .from('comment_reactions')
    .delete()
    .eq('comment_id', input.commentId)
    .eq('emoji', input.emoji)
    .eq('user_id', userId);
  if (error) {
    console.error('[library/comments/reactions] remove failed', error);
    return NextResponse.json({ error: 'Could not remove the reaction' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
