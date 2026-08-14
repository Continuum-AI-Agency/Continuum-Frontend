import {
  type BrandInviteRecord,
  brandInviteSchema as contractsInviteSchema,
  deriveInviteStatus,
} from '@continuum/contracts';
import {
  type BrandInvite,
  type BrandMember,
  brandInviteSchema,
  brandMemberSchema,
} from '@/lib/onboarding/state';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function fetchBrandMembers(brandId: string): Promise<BrandMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .schema('brand_profiles')
    .from('permissions')
    .select('user_id, role, email, created_at, acknowledged_at')
    .eq('brand_profile_id', brandId)) as any;

  if (error) {
    console.error(`[members] Failed to fetch members for brand ${brandId}`, error);
    return [];
  }

  const RECENTLY_ACCEPTED_WINDOW_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const members: BrandMember[] = [];
  for (const row of data ?? []) {
    const createdAt = row.created_at as string | null;
    const acknowledged = row.acknowledged_at as string | null;
    const isRecentlyAccepted =
      acknowledged === null &&
      typeof createdAt === 'string' &&
      now - new Date(createdAt).getTime() < RECENTLY_ACCEPTED_WINDOW_MS;

    const parsed = brandMemberSchema.safeParse({
      id: row.user_id,
      email: row.email,
      role: row.role,
      isRecentlyAccepted,
    });

    if (!parsed.success) {
      console.error(`[members] Skipping malformed member row for brand ${brandId}`, parsed.error);
      continue;
    }

    members.push(parsed.data);
  }

  return members;
}

export async function acknowledgeOwnMembership(brandId: string, userId: string): Promise<void> {
  if (!brandId || !userId) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('brand_profiles')
    .from('permissions')
    .update({ acknowledged_at: new Date().toISOString() } as never)
    .eq('brand_profile_id', brandId)
    .eq('user_id', userId)
    .is('acknowledged_at', null);

  if (error) {
    console.warn('[members] Failed to acknowledge membership', error);
  }
}

export async function fetchBrandInvites(brandId: string): Promise<BrandInvite[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .schema('brand_profiles')
    .from('invites')
    .select('id, email, role, created_at, expires_at')
    .eq('brand_profile_id', brandId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())) as any;

  if (error) {
    console.error(`[members] Failed to fetch invites for brand ${brandId}`, error);
    return [];
  }

  const invites: BrandInvite[] = [];
  for (const row of data ?? []) {
    const parsed = brandInviteSchema.safeParse({
      id: row.id,
      email: row.email,
      role: row.role,
      token: '',
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    });

    if (!parsed.success) {
      console.error(`[members] Skipping malformed invite row for brand ${brandId}`, parsed.error);
      continue;
    }

    invites.push(parsed.data);
  }

  return invites;
}

/**
 * Every invite for a brand, in every state, with what we know about delivery.
 *
 * `fetchBrandInvites` above is structurally pending-only, which is why an
 * inviter could never tell an ignored invite from a bounced one, or see that 27
 * of 79 had quietly expired. This is the settings view; that one still backs the
 * onboarding state shape.
 */
export async function fetchBrandInviteLedger(brandId: string): Promise<BrandInviteRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .schema('brand_profiles')
    .from('invites')
    .select(
      'id, email, role, created_at, expires_at, accepted_at, revoked_at, last_emailed_at, last_email_message_id, last_email_error',
    )
    .eq('brand_profile_id', brandId)
    .order('created_at', { ascending: false })) as any;

  if (error) {
    console.error(`[members] Failed to fetch invite ledger for brand ${brandId}`, error);
    return [];
  }

  const invites: BrandInviteRecord[] = [];
  for (const row of data ?? []) {
    const timestamps = {
      acceptedAt: (row.accepted_at as string | null) ?? null,
      revokedAt: (row.revoked_at as string | null) ?? null,
      expiresAt: (row.expires_at as string | null) ?? null,
    };
    const parsed = contractsInviteSchema.safeParse({
      id: row.id,
      email: row.email,
      role: row.role,
      status: deriveInviteStatus(timestamps),
      createdAt: row.created_at,
      ...timestamps,
      delivery: {
        lastEmailedAt: (row.last_emailed_at as string | null) ?? null,
        lastEmailMessageId: (row.last_email_message_id as string | null) ?? null,
        lastEmailError: (row.last_email_error as string | null) ?? null,
      },
    });

    if (!parsed.success) {
      console.error(`[members] Skipping malformed invite row for brand ${brandId}`, parsed.error);
      continue;
    }

    invites.push(parsed.data);
  }

  return invites;
}
