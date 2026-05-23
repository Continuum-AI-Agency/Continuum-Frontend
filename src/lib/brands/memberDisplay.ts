import type { BrandMember } from "@/lib/onboarding/state";

export function getMemberDisplayName(
  members: BrandMember[],
  userId: string | null | undefined,
): string {
  if (!userId) return "a teammate";
  const member = members.find((m) => m.id === userId);
  if (!member) return "a former member";
  const handle = member.email.split("@")[0];
  return handle || member.email;
}
