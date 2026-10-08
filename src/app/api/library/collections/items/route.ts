import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mutateCollectionMembershipOperation } from '@/lib/library/creativeOperations';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { operationFailure, refuseViewer } from '../operationFailure';

const itemSchema = z.object({
  brandId: z.string().uuid(),
  collectionId: z.string().uuid(),
  assetId: z.string().uuid(),
});

// Membership changes go through the Library dispatcher on the caller's own session, like
// every other collection write: the dispatcher checks that the collection and asset belong
// to the brand, that the collection is manual and not someone else's private one, and —
// through authorize_operation — that the caller is not a viewer.
async function mutate(request: Request, mode: 'add' | 'remove'): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = itemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, collectionId, assetId } = parsed.data;

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const refused = await refuseViewer(supabase, brandId, collectionId);
  if (refused) return refused;

  try {
    await mutateCollectionMembershipOperation(supabase, {
      brandId,
      collectionId,
      assetIds: [assetId],
      mode,
    });
    return NextResponse.json({ ok: true }, { status: mode === 'add' ? 201 : 200 });
  } catch (error) {
    return operationFailure(mode === 'add' ? 'add' : 'remove', error);
  }
}

export function POST(request: Request) {
  return mutate(request, 'add');
}

export function DELETE(request: Request) {
  return mutate(request, 'remove');
}
