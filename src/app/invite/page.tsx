import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type InvitePageProps = {
  searchParams?: Promise<{ token?: string; brand?: string }>;
};

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const params = searchParams ? await searchParams : {};
  const token = params.token;
  const brandId = params.brand;

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If not signed in, redirect to login with return path
  if (!session) {
    const url = new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
    if (token) url.searchParams.set("token", token);
    if (brandId) url.searchParams.set("brand", brandId);
    redirect(url.toString());
  }

  if (!token || !brandId) {
    redirect("/dashboard?invite=missing_params");
  }

  const { error } = await supabase.functions.invoke("brand_invite", {
    body: { action: "accept", token, brandId },
    headers: session.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });

  if (error) {
    redirect(`/dashboard?invite=error&message=${encodeURIComponent(error.message ?? "invite_failed")}`);
  }

  redirect("/dashboard?invite=accepted");
}

