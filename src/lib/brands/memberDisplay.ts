import type { BrandMember } from '@/lib/onboarding/state';

const NO_EMAIL_ON_FILE = 'No email on file';

export function formatMemberEmail(email: string | null): string {
  return email ?? NO_EMAIL_ON_FILE;
}

export function getMemberDisplayName(
  members: BrandMember[],
  userId: string | null | undefined,
): string {
  if (!userId) return 'a teammate';
  const member = members.find((m) => m.id === userId);
  if (!member) return 'a former member';
  if (!member.email) return NO_EMAIL_ON_FILE;
  const handle = member.email.split('@')[0];
  return handle || member.email;
}
