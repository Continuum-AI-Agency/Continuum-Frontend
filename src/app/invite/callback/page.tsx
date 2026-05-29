import { redirect } from "next/navigation";
import { normalizeInviteBrandId, normalizeInviteToken } from "@/lib/invites/params";
import { finalizeInviteAcceptance } from "@/lib/invites/finalize";

type InviteCallbackPageProps = {
  searchParams?: Promise<{ token?: string; brand?: string }>;
};

export default async function InviteCallbackPage({ searchParams }: InviteCallbackPageProps) {
  const params = searchParams ? await searchParams : {};
  const token = normalizeInviteToken(params.token ?? null);
  const brandId = normalizeInviteBrandId(params.brand ?? null);

  if (!token || !brandId) {
    redirect("/dashboard?invite=missing_params");
  }

  const result = await finalizeInviteAcceptance(token, brandId);
  redirect(result.path);
}
