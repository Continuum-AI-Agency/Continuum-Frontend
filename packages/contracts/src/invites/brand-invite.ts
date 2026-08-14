import { z } from 'zod';

/**
 * Brand invite shapes, shared by the `brand_invite` edge function and the
 * settings/onboarding surfaces that call it.
 *
 * These were hand-mirrored on each side before: the create response was
 * declared twice inside `settings/actions.ts` alone, and the list shape carried
 * a `token` field the query never selected — stuffed with `''` to keep the
 * schema quiet.
 */

export const brandInviteRoleSchema = z.enum(['owner', 'admin', 'operator', 'viewer']);
export type BrandInviteRole = z.infer<typeof brandInviteRoleSchema>;

/**
 * Expiry is a clock comparison, not a stored flag, so it was never renderable —
 * "expired" simply did not exist as a state anywhere in the UI. 27 of 79
 * production invites are in it.
 */
export const brandInviteStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired']);
export type BrandInviteStatus = z.infer<typeof brandInviteStatusSchema>;

export const brandInviteDeliverySchema = z.object({
  lastEmailedAt: z.string().nullable(),
  lastEmailMessageId: z.string().nullable(),
  /** Sanitized provider error code; null means the provider accepted it. */
  lastEmailError: z.string().nullable(),
});
export type BrandInviteDelivery = z.infer<typeof brandInviteDeliverySchema>;

export const brandInviteSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: brandInviteRoleSchema,
  status: brandInviteStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  delivery: brandInviteDeliverySchema,
});
export type BrandInviteRecord = z.infer<typeof brandInviteSchema>;

export const brandInviteCreateRequestSchema = z.object({
  action: z.literal('create'),
  brandId: z.string().uuid(),
  email: z.string().email(),
  role: brandInviteRoleSchema,
  /**
   * Blanks the provider idempotency key, so only ever set it when a human
   * explicitly asked to resend. It used to be hardcoded true on every submit,
   * which turned a double-click into two real emails.
   */
  forceResend: z.boolean().optional(),
});
export type BrandInviteCreateRequest = z.infer<typeof brandInviteCreateRequestSchema>;

export const brandInviteCreateResponseSchema = z.object({
  link: z.string(),
  inviteId: z.string().nullable(),
  emailSent: z.boolean(),
  /** Resend message ids for the accepted sends; the handle for provider lookups. */
  messageIds: z.array(z.string()).default([]),
  existingUser: z.boolean().optional(),
  resent: z.boolean().optional(),
  warning: z.string().optional(),
});
export type BrandInviteCreateResponse = z.infer<typeof brandInviteCreateResponseSchema>;

type InviteTimestamps = {
  acceptedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
};

/**
 * One definition of what an invite row means, so the settings table, the
 * onboarding list and any future report agree.
 *
 * Order matters: an accepted invite that was later revoked (which is what
 * removing a member now writes) reads as revoked, and revocation outranks
 * expiry so a revoked-then-lapsed invite never reappears as merely stale.
 */
export function deriveInviteStatus(
  invite: InviteTimestamps,
  now: Date = new Date(),
): BrandInviteStatus {
  if (invite.revokedAt) return 'revoked';
  if (invite.acceptedAt) return 'accepted';
  if (invite.expiresAt && Date.parse(invite.expiresAt) <= now.getTime()) return 'expired';
  return 'pending';
}

/** True when a resend would produce a usable link rather than a dead one. */
export function inviteIsResendable(status: BrandInviteStatus): boolean {
  return status === 'pending' || status === 'expired';
}
