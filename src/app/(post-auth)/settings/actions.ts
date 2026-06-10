"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { tags } from "@/lib/cache/tags";
import { createBrandProfileRepository } from "@/lib/repositories/brandProfile";
import type { BrandRole } from "@/lib/onboarding/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFunctionsInvokeErrorMessage } from "@/lib/supabase/functions-errors";
import { getPostHogClient } from "@/lib/posthog-server";
import { normalizeBrandDocumentStoragePath } from "@/lib/brands/document-download";
import { getClaimsIdentity } from "@/lib/auth/claims";

export async function switchActiveBrandAction(brandId: string): Promise<void> {
  if (!brandId) return;
  const repo = createBrandProfileRepository();
  await repo.switchActiveBrand(brandId);
  revalidatePath("/", "layout");
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

export async function createBrandProfileAction(name?: string): Promise<void> {
  const user = await getClaimsIdentity();
  const repo = createBrandProfileRepository();
  const result = await repo.createBrand(name?.trim());

  if (user?.id) {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "brand_profile_created",
      properties: { brand_id: result.brandId, brand_name: name?.trim() ?? null },
    });
    await posthog.shutdown();
  }

  revalidatePath("/", "layout");
  redirect(`/onboarding?brand=${result.brandId}`);
}

export async function removeMemberAction(
  brandId: string,
  memberId: string,
  email?: string
): Promise<void> {
  const repo = createBrandProfileRepository();
  await repo.removeMember(brandId, { userId: memberId, email });
}

export async function changeMemberRoleAction(
  brandId: string,
  userId: string,
  role: Exclude<BrandRole, "owner">,
): Promise<void> {
  if (!brandId) throw new Error("brandId is required");
  if (!userId) throw new Error("userId is required");

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { error } = await supabase.functions.invoke<{ ok: true } | { error: string }>(
    "brand_invite",
    {
      body: { action: "change_role", brandId, userId, role },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    },
  );

  if (error) {
    const message = await getFunctionsInvokeErrorMessage(error);
    throw new Error(message ?? error.message ?? "Unable to change role");
  }
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
    const message = await getFunctionsInvokeErrorMessage(error);
    throw new Error(message ?? error?.message ?? "Unable to create invite");
  }

  const invitingUserId = session?.user?.id;
  if (invitingUserId) {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: invitingUserId,
      event: "team_member_invited",
      properties: {
        brand_id: brandId,
        invited_email: email.trim(),
        role,
        email_sent: data.emailSent,
        existing_user: data.existingUser ?? false,
      },
    });
    await posthog.shutdown();
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
  const user = await getClaimsIdentity();
  const repo = createBrandProfileRepository();
  const nextBrandId = await repo.deleteBrand(brandId);

  if (user?.id) {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "brand_profile_deleted",
      properties: { brand_id: brandId },
    });
    await posthog.shutdown();
  }

  return { nextBrandId };
}

export async function createSignedDocumentUrlAction(storagePath: string): Promise<string> {
  const normalizedStoragePath = normalizeBrandDocumentStoragePath(storagePath);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("brand-docs")
    .createSignedUrl(normalizedStoragePath, 60, { download: true });

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to generate signed URL");
  }

  return data.signedUrl;
}

// Inline disposition (no forced download) so the URL renders natively in a browser
// tab or an <img> tag. Used by the document preview card's "Open" action and thumbnails.
export async function createInlineDocumentUrlAction(storagePath: string): Promise<string> {
  const normalizedStoragePath = normalizeBrandDocumentStoragePath(storagePath);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("brand-docs")
    .createSignedUrl(normalizedStoragePath, 120);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to generate signed URL");
  }

  return data.signedUrl;
}

export async function regenerateBrandGuidelineAction(
  brandId: string,
  purpose: string = "general",
): Promise<{ guidelineId?: string; version?: number; skipped?: string }> {
  if (!brandId) throw new Error("brandId required");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke<{
    guidelineId?: string;
    version?: number;
    skipped?: string;
  }>("generate_brand_guideline", {
    body: { brandId, trigger: "manual", purpose },
  });
  if (error) {
    const message = await getFunctionsInvokeErrorMessage(error);
    throw new Error(message ?? "Failed to regenerate brand guideline");
  }
  updateTag(tags.brandGuidelines(brandId));
  revalidatePath("/settings", "page");
  return data ?? {};
}
