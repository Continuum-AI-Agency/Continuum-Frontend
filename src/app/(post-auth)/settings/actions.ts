"use server";

import { redirect } from "next/navigation";
import {
  createBrandProfile,
  createMagicLinkInvite,
  removeMemberFromBrand,
  renameBrandProfile,
  revokeInvite,
  setActiveBrand,
} from "@/lib/onboarding/storage";
import type { BrandRole } from "@/lib/onboarding/state";

export async function switchActiveBrandAction(brandId: string): Promise<void> {
  if (!brandId) return;
  await setActiveBrand(brandId);
}

export async function renameBrandProfileAction(brandId: string, name: string): Promise<void> {
  if (!name.trim()) {
    throw new Error("Brand name is required");
  }
  await renameBrandProfile(brandId, name.trim());
}

export async function createBrandProfileAction(name?: string): Promise<void> {
  const result = await createBrandProfile(name?.trim());
  redirect(`/onboarding?brand=${result.brandId}`);
}

export async function removeMemberAction(brandId: string, email: string): Promise<void> {
  await removeMemberFromBrand(brandId, email);
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
  const { link } = await createMagicLinkInvite(brandId, email.trim(), role, siteUrl);
  return { link };
}

export async function revokeInviteAction(brandId: string, inviteId: string): Promise<void> {
  await revokeInvite(brandId, inviteId);
}
