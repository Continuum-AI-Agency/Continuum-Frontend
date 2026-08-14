import 'server-only';

import { setActiveBrandPreference } from '@/lib/brands/preferences';
import { buildInviteLoginRedirect } from '@/lib/invites/urls';
import { getPostHogClient } from '@/lib/posthog-server';
import { getFunctionsInvokeErrorMessage } from '@/lib/supabase/functions-errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type FinalizeInviteResult =
  | { status: 'redirect'; path: string }
  | { status: 'accepted'; path: string };

/**
 * `team_member_invited` fires on create and nothing fired on accept, so the
 * funnel had a top and no bottom. That is why acceptances falling from ~8/month
 * to 1 went unnoticed for six weeks, and why 27 expired invites had to be found
 * by hand-written SQL.
 */
function trackInviteOutcome(
  userId: string | undefined,
  brandId: string,
  outcome: 'accepted' | 'failed',
  reason?: string,
): void {
  if (!userId) return;
  try {
    getPostHogClient().capture({
      distinctId: userId,
      event: outcome === 'accepted' ? 'team_member_accepted' : 'team_member_accept_failed',
      properties: { brand_id: brandId, ...(reason ? { reason } : {}) },
    });
  } catch {
    // Telemetry must never be what stops someone joining a brand.
  }
}

function inviteAcceptedPath(brandId: string): string {
  return `/dashboard?invite=accepted&welcome=brand:${brandId}`;
}

function inviteErrorPath(message: string): string {
  return `/dashboard?invite=error&message=${encodeURIComponent(message)}`;
}

async function persistInvitedBrand(brandId: string): Promise<FinalizeInviteResult> {
  try {
    await setActiveBrandPreference(brandId);
    return { status: 'accepted', path: inviteAcceptedPath(brandId) };
  } catch (error) {
    return {
      status: 'redirect',
      path: inviteErrorPath(
        error instanceof Error ? error.message : 'Unable to activate invited brand.',
      ),
    };
  }
}

export async function finalizeInviteAcceptance(
  token: string,
  brandId: string,
): Promise<FinalizeInviteResult> {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  const session = sessionData.session;
  if (sessionError || !session?.access_token) {
    return { status: 'redirect', path: buildInviteLoginRedirect(token, brandId) };
  }

  const { error } = await supabase.functions.invoke('brand_invite', {
    body: { action: 'accept', token, brandId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const userId = session.user?.id;

  if (!error) {
    trackInviteOutcome(userId, brandId, 'accepted');
    return persistInvitedBrand(brandId);
  }

  if (userId) {
    const { data: membership } = await supabase
      .schema('brand_profiles')
      .from('permissions')
      .select('id')
      .eq('brand_profile_id', brandId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membership) {
      trackInviteOutcome(userId, brandId, 'accepted');
      return persistInvitedBrand(brandId);
    }
  }

  const detailedMessage = await getFunctionsInvokeErrorMessage(error);
  trackInviteOutcome(userId, brandId, 'failed', detailedMessage ?? error.message);
  return {
    status: 'redirect',
    path: inviteErrorPath(detailedMessage ?? error.message ?? 'invite_failed'),
  };
}
