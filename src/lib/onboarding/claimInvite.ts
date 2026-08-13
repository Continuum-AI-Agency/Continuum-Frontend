import type { SupabaseClient } from '@supabase/supabase-js';
import { getFunctionsInvokeErrorMessage } from '@/lib/supabase/functions-errors';
import type { Database } from '@/lib/supabase/types';

type Client = SupabaseClient<Database>;

/**
 * Grants the caller access to a brand somebody else created, when a pending
 * invite says they were meant to have it.
 *
 * Onboarding routes an invited user onto the inviter's brand (see
 * `findPendingInviteBrandId`) but a pending invite creates NO `permissions` row —
 * so `brand_profiles.has_brand_access` was false and every backend brand-scoped
 * call answered 403 "Access denied to brand", which the onboarding design-system
 * card rendered as its error state. Resolving the brand and granting access to it
 * have to be the same act; splitting them is what produced the dead end.
 *
 * The grant itself belongs to the `brand_invite` edge function: `permissions` is
 * self-only under RLS so a service-role writer is required, and that function
 * already owns invite redemption end to end — including the email match that
 * authorizes it. Called without a token, it claims the pending invite for the
 * caller's own verified address.
 *
 * Fail-safe throughout: no invite, a failed invoke, or a thrown lookup all leave
 * the caller exactly where they were.
 */
export async function claimPendingInvite(
  supabase: Client,
  brandId: string,
  userId: string,
): Promise<void> {
  try {
    const { data: membership } = await supabase
      .schema('brand_profiles')
      .from('permissions')
      .select('id')
      .eq('brand_profile_id', brandId)
      .eq('user_id', userId)
      .maybeSingle();
    if (membership) return;

    // The bearer is passed explicitly rather than left to the functions client to
    // pick up: on a per-request SSR client the auth-state-change that would call
    // `functions.setAuth` has not fired, so the invoke goes out anonymous and the
    // edge function answers 401. Same reason `finalizeInviteAcceptance` does it.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const { error } = await supabase.functions.invoke('brand_invite', {
      body: { action: 'accept', brandId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      console.warn(
        `[claimPendingInvite] no invite claimed for user ${userId} on brand ${brandId}:`,
        await getFunctionsInvokeErrorMessage(error),
      );
    }
  } catch (error) {
    console.warn(`[claimPendingInvite] failed for user ${userId} on brand ${brandId}:`, error);
  }
}
