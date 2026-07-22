'use server';

import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Fire-and-forget warm: invokes the warm-brand-now Edge Function, which populates
// the same dashboard caches (organic analytics -> insights, paid metrics + insights,
// trend signals) that the value-report email reads. Calling this at onboarding
// completion means the report is full without waiting for the user to open the
// dashboard. warm-brand-now is lease-guarded and idempotent, so this is purely a
// lead-time optimization over the email worker's own defensive warm.
export async function warmBrandNowServer(brandId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  let headers: Record<string, string> | undefined;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers = { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // Best-effort: warm-brand-now also accepts a service-role bearer, and the
    // caller runs this inside after() with its own error handling.
  }

  const { error } = await supabase.functions.invoke('warm-brand-now', {
    body: { brandId },
    headers,
  });

  if (error) {
    throw new Error(`warm-brand-now invoke failed: ${error.message}`);
  }
}
