import { registerVersionRequestSchema, rollbackVersionRequestSchema } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  CreativeOperationError,
  listAssetVersions,
  registerAssetVersion,
  rollbackAssetVersion,
} from '@/lib/library/creativeOperations';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const listQuerySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
});

type Caller = { supabase: SupabaseClient; userId: string };

async function authorizeCaller(brandId: string): Promise<Caller | NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { supabase: supabase as unknown as SupabaseClient, userId: user.id };
}

function operationError(error: unknown): NextResponse {
  console.error('[library/versions] Creative Operations request failed', error);
  const status = error instanceof CreativeOperationError ? error.status : null;
  return NextResponse.json(
    { error: error instanceof CreativeOperationError ? error.message : 'Query failed' },
    { status: status && status >= 400 ? status : 502 },
  );
}

// The Creative Operations Edge Function owns the durable version workflow and
// all privileged writes. This thin boundary only authenticates the browser
// session and preserves the established REST shape for existing callers.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 422 });

  const caller = await authorizeCaller(parsed.data.brandId);
  if (caller instanceof NextResponse) return caller;
  try {
    return NextResponse.json(await listAssetVersions(caller.supabase, parsed.data));
  } catch (error) {
    return operationError(error);
  }
}

export async function POST(request: Request) {
  const parsed = registerVersionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 422 });

  const caller = await authorizeCaller(parsed.data.brandId);
  if (caller instanceof NextResponse) return caller;
  try {
    return NextResponse.json(await registerAssetVersion(caller.supabase, parsed.data));
  } catch (error) {
    return operationError(error);
  }
}

export async function PATCH(request: Request) {
  const parsed = rollbackVersionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 422 });

  const caller = await authorizeCaller(parsed.data.brandId);
  if (caller instanceof NextResponse) return caller;
  try {
    return NextResponse.json(await rollbackAssetVersion(caller.supabase, parsed.data));
  } catch (error) {
    return operationError(error);
  }
}
