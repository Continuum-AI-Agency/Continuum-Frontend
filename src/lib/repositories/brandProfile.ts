import type { BrandRole, BrandInvite, BrandMember } from "@/lib/onboarding/state";
import {
  createBrandProfile,
  createMagicLinkInvite,
  deleteBrandFromMetadata,
  removeMemberFromBrand,
  renameBrandProfile,
  updateBrandLogo,
  revokeInvite,
  setActiveBrand,
} from "@/lib/onboarding/storage";
import { z } from "zod";
import { httpServer } from "@/lib/api/http.server";
import { invokeDeleteBrandProfile, fetchBrandProfileDetails, type BrandProfileDetails } from "@/lib/brands/profile";

export type BrandSummary = {
  id: string;
  name: string;
  completed: boolean;
  logoPath?: string | null;
  logoUrl?: string | null;
};

export type BrandSettingsData = {
  activeBrandId: string;
  brandSummaries: BrandSummary[];
  brandName: string;
  members: BrandMember[];
  invites: BrandInvite[];
};

export interface BrandProfileRepository {
  switchActiveBrand(brandId: string): Promise<void>;
  renameBrand(brandId: string, name: string): Promise<void>;
  updateLogo(brandId: string, logoPath: string | null): Promise<void>;
  createBrand(name?: string): Promise<{ brandId: string }>;
  removeMember(brandId: string, email: string): Promise<void>;
  createMagicLink(brandId: string, email: string, role: BrandRole, siteUrl: string): Promise<{ link: string }>;
  revokeInvite(brandId: string, inviteId: string): Promise<void>;
  deleteBrand(brandId: string): Promise<string | null>;
  fetchProfile(brandId: string): Promise<BrandProfileDetails | null>;
}

// Default implementation leveraging existing Supabase-backed onboarding storage.
export function createSupabaseBrandProfileRepository(): BrandProfileRepository {
  return {
    async switchActiveBrand(brandId: string) {
      await setActiveBrand(brandId);
    },
    async renameBrand(brandId: string, name: string) {
      await renameBrandProfile(brandId, name);
    },
    async updateLogo(brandId: string, logoPath: string | null) {
      await updateBrandLogo(brandId, logoPath);
    },
    async createBrand(name?: string) {
      const { brandId } = await createBrandProfile(name);
      return { brandId };
    },
    async removeMember(brandId: string, email: string) {
      await removeMemberFromBrand(brandId, email);
    },
    async createMagicLink(brandId: string, email: string, role: BrandRole, siteUrl: string) {
      const { link } = await createMagicLinkInvite(brandId, email, role, siteUrl);
      return { link };
    },
    async revokeInvite(brandId: string, inviteId: string) {
      await revokeInvite(brandId, inviteId);
    },
    async deleteBrand(brandId: string): Promise<string | null> {
      await invokeDeleteBrandProfile(brandId);
      const { nextActiveBrandId } = await deleteBrandFromMetadata(brandId);
      return nextActiveBrandId ?? null;
    },
    async fetchProfile(brandId: string): Promise<BrandProfileDetails | null> {
      return fetchBrandProfileDetails(brandId);
    },
  };
}

export function createGatewayBrandProfileRepository(): BrandProfileRepository {
  return {
    async switchActiveBrand(brandId: string): Promise<void> {
      await httpServer.request({ path: `/brands/${brandId}/switch`, method: "POST" });
    },
    async renameBrand(brandId: string, name: string): Promise<void> {
      await httpServer.request({ path: `/brands/${brandId}`, method: "PATCH", body: { name } });
    },
    async updateLogo(brandId: string, logoPath: string | null): Promise<void> {
      await httpServer.request({ path: `/brands/${brandId}`, method: "PATCH", body: { logoPath } });
    },
    async createBrand(name?: string): Promise<{ brandId: string }> {
      const schema = z.object({ brandId: z.string() });
      return await httpServer.request({ path: "/brands", method: "POST", body: { name }, schema });
    },
    async removeMember(brandId: string, email: string): Promise<void> {
      await httpServer.request({ path: `/brands/${brandId}/members`, method: "DELETE", body: { email } });
    },
    async createMagicLink(brandId: string, email: string, role: BrandRole, siteUrl: string): Promise<{ link: string }> {
      const schema = z.object({ link: z.string().min(1) });
      return await httpServer.request({ path: `/brands/${brandId}/invites`, method: "POST", body: { email, role, siteUrl }, schema });
    },
    async revokeInvite(brandId: string, inviteId: string): Promise<void> {
      await httpServer.request({ path: `/brands/${brandId}/invites/${inviteId}`, method: "DELETE" });
    },
    async deleteBrand(brandId: string): Promise<string | null> {
      await httpServer.request({ path: `/brands/${brandId}`, method: "DELETE" });
      return null;
    },
    async fetchProfile(brandId: string): Promise<BrandProfileDetails | null> {
      const schema = z.object({
        id: z.string(),
        name: z.string(),
        createdAt: z.string(),
        updatedAt: z.string(),
        createdBy: z.string(),
      });
      return await httpServer.request({ path: `/brands/${brandId}`, method: "GET", schema });
    },
  };
}

export function createBrandProfileRepository(): BrandProfileRepository {
  // Today we use Supabase metadata as source of truth. Swap to gateway by switching the return below.
  return createSupabaseBrandProfileRepository();
  // return createGatewayBrandProfileRepository();
}
