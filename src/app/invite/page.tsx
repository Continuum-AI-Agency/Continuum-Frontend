import { redirect } from 'next/navigation';
import { normalizeInviteBrandId, normalizeInviteToken } from '@/lib/invites/params';
import { buildInviteCallbackPath } from '@/lib/invites/urls';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type InvitePageProps = {
  searchParams?: Promise<{ token?: string; brand?: string; otp?: string; type?: string }>;
};

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const params = searchParams ? await searchParams : {};
  const token = normalizeInviteToken(params.token ?? null);
  const brandId = normalizeInviteBrandId(params.brand ?? null);

  if (!token || !brandId) {
    redirect('/dashboard?invite=missing_params');
  }

  redirect(buildInviteCallbackPath(token, brandId, { otp: params.otp, type: params.type }));
}
