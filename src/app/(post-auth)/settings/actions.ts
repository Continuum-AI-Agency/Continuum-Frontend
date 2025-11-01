"use server";

import { redirect } from "next/navigation";
import { createBrandProfileRepository } from "@/lib/repositories/brandProfile";
import type { BrandRole } from "@/lib/onboarding/state";

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

export async function createBrandProfileAction(name?: string): Promise<void> {
  const repo = createBrandProfileRepository();
  const result = await repo.createBrand(name?.trim());
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
): Promise<{ link: string }> {
  if (!email.trim()) {
    throw new Error("Email is required");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const repo = createBrandProfileRepository();
  const { link } = await repo.createMagicLink(brandId, email.trim(), role, siteUrl);
  return { link };
}

export async function revokeInviteAction(brandId: string, inviteId: string): Promise<void> {
  const repo = createBrandProfileRepository();
  await repo.revokeInvite(brandId, inviteId);
}
