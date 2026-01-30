"use server";

import { redirect } from "next/navigation";
import { createBrandProfileRepository } from "@/lib/repositories/brandProfile";
import type { BrandRole } from "@/lib/onboarding/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function switchActiveBrandAction(brandId: string): Promise<void> {
  if (!brandId) return;
  const repo = createBrandProfileRepository();
  await repo.switchActiveBrand(brandId);
}

export async function renameBrandProfileAction(brandId: string, name: string): Promise<void> {
  if (!name.trim()) {
    throw new Error("Brand name is required");
  }
  const repo = createBrandProfileRepository();
  await repo.renameBrand(brandId, name.trim());
}

export async function updateBrandLogoAction(brandId: string, logoPath: string | null): Promise<void> {
  const repo = createBrandProfileRepository();
  await repo.updateLogo(brandId, logoPath);
  revalidatePath("/", "layout");
}

import { revalidatePath } from "next/cache";

export async function createBrandProfileAction(name?: string): Promise<void> {
  const repo = createBrandProfileRepository();
  const result = await repo.createBrand(name?.trim());
  revalidatePath("/", "layout");
  redirect(`/onboarding?brand=${result.brandId}`);
}

export async function removeMemberAction(brandId: string, email: string): Promise<void> {
  const repo = createBrandProfileRepository();
  await repo.removeMember(brandId, email);
}

export async function createMagicLinkAction(
  brandId: string,
  email: string,
  role: BrandRole
): Promise<{
  link: string;
  inviteId: string | null;
  emailSent: boolean;
  warning?: string;
  info?: string;
  code?: string;
  existingUser?: boolean;
  resent?: boolean;
}> {
  if (!email.trim()) {
    throw new Error("Email is required");
  }

  const supabase = await createSupabaseServerClient();
  // forward user JWT so edge function can authorize owner/admin
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.functions.invoke<{
    link: string;
    inviteId: string | null;
    emailSent: boolean;
    warning?: string;
    info?: string;
    code?: string;
    existingUser?: boolean;
    resent?: boolean;
  }>("brand_invite", {
    body: {
      action: "create",
      brandId,
      email: email.trim(),
      role,
      siteUrl,
      forceResend: true,
    },
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });

  if (error || !data?.link) {
    throw new Error(error?.message ?? "Unable to create invite");
  }

  return data;
}

export async function revokeInviteAction(brandId: string, inviteId: string): Promise<void> {
  const repo = createBrandProfileRepository();
  await repo.revokeInvite(brandId, inviteId);
}

export async function deleteBrandProfileAction(brandId: string): Promise<{ nextBrandId: string | null }> {
  if (!brandId) {
    throw new Error("Brand id is required");
  }
  const repo = createBrandProfileRepository();
  const nextBrandId = await repo.deleteBrand(brandId);
  return { nextBrandId };
}
