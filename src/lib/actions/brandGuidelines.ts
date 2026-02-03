"use server";

import { revalidatePath } from "next/cache";

import {
  createBrandGuideline,
  fetchBrandGuideline,
  listBrandGuidelines,
  setBrandGuidelineStatus,
  updateBrandGuideline,
} from "@/lib/api/brandGuidelines.server";
import type {
  BrandGuidelineDetail,
  BrandGuidelineDraft,
  BrandGuidelineStatus,
  BrandGuidelineSummary,
} from "@/lib/schemas/brandGuidelines";

export async function listBrandGuidelinesAction(brandId: string): Promise<BrandGuidelineSummary[]> {
  try {
    return await listBrandGuidelines(brandId);
  } catch (error) {
    console.error("brandGuidelines.list.error", { brandId, error });
    return [];
  }
}

export async function fetchBrandGuidelineAction(
  brandId: string,
  guidelineId: string
): Promise<BrandGuidelineDetail | null> {
  try {
    return await fetchBrandGuideline(brandId, guidelineId);
  } catch (error) {
    console.error("brandGuidelines.fetch.error", { brandId, guidelineId, error });
    return null;
  }
}

export async function saveBrandGuidelineDraftAction(
  brandId: string,
  guidelineId: string | null,
  payload: BrandGuidelineDraft
): Promise<BrandGuidelineDetail> {
  try {
    const result = guidelineId
      ? await updateBrandGuideline(brandId, guidelineId, payload, "draft")
      : await createBrandGuideline(brandId, payload, "draft");
    revalidatePath("/primitives");
    return result;
  } catch (error) {
    console.error("brandGuidelines.saveDraft.error", { brandId, guidelineId, error });
    throw error instanceof Error ? error : new Error("Unable to save brand guideline draft.");
  }
}

export async function approveBrandGuidelineAction(
  brandId: string,
  guidelineId: string | null,
  payload: BrandGuidelineDraft
): Promise<BrandGuidelineDetail> {
  try {
    const result = guidelineId
      ? await updateBrandGuideline(brandId, guidelineId, payload, "approved")
      : await createBrandGuideline(brandId, payload, "approved");
    revalidatePath("/primitives");
    return result;
  } catch (error) {
    console.error("brandGuidelines.approve.error", { brandId, guidelineId, error });
    throw error instanceof Error ? error : new Error("Unable to approve brand guideline.");
  }
}

export async function updateBrandGuidelineStatusAction(
  brandId: string,
  guidelineId: string,
  status: BrandGuidelineStatus
): Promise<void> {
  try {
    await setBrandGuidelineStatus(brandId, guidelineId, status);
    revalidatePath("/primitives");
  } catch (error) {
    console.error("brandGuidelines.status.error", { brandId, guidelineId, status, error });
    throw error instanceof Error ? error : new Error("Unable to update brand guideline status.");
  }
}
