import 'server-only';

// The caller gate the Library routes share: a signed-in user with access to the brand,
// and the RLS-scoped client that user's reads run on. Vercel has no service-role key, so
// dispatcher writes go through the Library edge functions (library-creative-operations,
// library-review, library-share), never through this file.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
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
