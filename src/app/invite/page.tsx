import { redirect } from 'next/navigation';
import { normalizeInviteBrandId, normalizeInviteToken } from '@/lib/invites/params';
import { buildInviteCallbackPath } from '@/lib/invites/urls';

type InvitePageProps = {
  searchParams?: Promise<{ token?: string; brand?: string }>;
};

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const params = searchParams ? await searchParams : {};
  const token = normalizeInviteToken(params.token ?? null);
  const brandId = normalizeInviteBrandId(params.brand ?? null);

  if (!token || !brandId) {
    redirect('/dashboard?invite=missing_params');
  }

  redirect(buildInviteCallbackPath(token, brandId));
}
