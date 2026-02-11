import { redirect } from "next/navigation";
import { buildInviteCallbackPath } from "@/lib/invites/urls";

type InvitePageProps = {
  searchParams?: Promise<{ token?: string; brand?: string }>;
};

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const params = searchParams ? await searchParams : {};
  const token = params.token;
  const brandId = params.brand;

  if (!token || !brandId) {
    redirect("/dashboard?invite=missing_params");
  }

  redirect(buildInviteCallbackPath(token, brandId));
}
