import 'server-only';

// The caller gate the Library routes share (requireBrandCaller: a signed-in user
// with access to the brand, and the RLS-scoped client that user's reads run on),
// plus a server door to media.library_execute_operation.
//
// executeLibraryOperation needs SUPABASE_SERVICE_ROLE_KEY, which Vercel deliberately
// does not have: in production it fails. Review writes therefore go through the
// library-review edge function instead; any remaining caller should move the same
// way. The dispatcher trusts `actor`, so when this is used the actor is ALWAYS the
// user the request authenticated — never a value from the request body.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type BrandCaller = { supabase: SupabaseClient; user: User };

export async function requireBrandCaller(brandId: string): Promise<BrandCaller | NextResponse> {
  const supabase = (await createSupabaseServerClient()) as unknown as SupabaseClient;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { supabase, user };
}

// Postgres error codes the dispatcher raises, as the HTTP status a caller can act on.
const STATUS_BY_SQLSTATE: Record<string, number> = {
  '42501': 403,
  P0002: 404,
  '22023': 422,
  '40001': 409,
};

export async function executeLibraryOperation(
  action: string,
  payload: Record<string, unknown>,
  actor: string,
): Promise<{ data: unknown } | NextResponse> {
  const { data, error } = await mediaSchema(createSupabaseAdminClient()).rpc(
    'library_execute_operation',
    {
      p_action: action,
      p_payload: { ...payload, actor, idempotencyKey: crypto.randomUUID() },
    },
  );
  if (error) {
    const status = STATUS_BY_SQLSTATE[error.code ?? ''] ?? 500;
    if (status === 500) console.error(`[library/${action}] dispatcher failed`, error);
    return NextResponse.json(
      { error: status === 500 ? 'Operation failed' : error.message },
      { status },
    );
  }
  return { data };
}
