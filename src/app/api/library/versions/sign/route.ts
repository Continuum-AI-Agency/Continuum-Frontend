import { versionSignUploadRequestSchema } from '@continuum/contracts';
import { NextResponse } from 'next/server';

import { CreativeOperationError, signVersionUpload } from '@/lib/library/creativeOperations';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Storage signing is part of creating a version, so it shares the same
// Edge-owned boundary as registration and rollback. The Vercel route never
// constructs a service-role client.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = versionSignUploadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  if (!(await callerHasBrandAccess(supabase, parsed.data.brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    return NextResponse.json(await signVersionUpload(supabase, parsed.data));
  } catch (error) {
    console.error('[library/versions/sign] Creative Operations request failed', error);
    const status = error instanceof CreativeOperationError ? error.status : null;
    return NextResponse.json(
      { error: error instanceof CreativeOperationError ? error.message : 'Sign failed' },
      { status: status && status >= 400 ? status : 502 },
    );
  }
}
