import 'server-only';

import { setActiveBrandPreference } from '@/lib/brands/preferences';
import { buildInviteLoginRedirect } from '@/lib/invites/urls';
import { getFunctionsInvokeErrorMessage } from '@/lib/supabase/functions-errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type FinalizeInviteResult =
  | { status: 'redirect'; path: string }
  | { status: 'accepted'; path: string };

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

  if (!error) {
    return persistInvitedBrand(brandId);
  }

  const userId = session.user?.id;
  if (userId) {
    const { data: membership } = await supabase
      .schema('brand_profiles')
      .from('permissions')
      .select('id')
      .eq('brand_profile_id', brandId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membership) {
      return persistInvitedBrand(brandId);
    }
  }

  const detailedMessage = await getFunctionsInvokeErrorMessage(error);
  return {
    status: 'redirect',
    path: inviteErrorPath(detailedMessage ?? error.message ?? 'invite_failed'),
  };
}
