"use server";

import { revalidatePath } from "next/cache";

import {
  addSavedCompetitor,
  fetchCompetitorDashboard,
  fetchSavedCompetitors,
  invalidateCompetitorCache,
  removeSavedCompetitor,
} from "@/lib/api/competitors.server";
import type { CompetitorDashboard, CompetitorSavedProfile } from "@/lib/schemas/competitors";

export async function getCompetitorDashboardAction(
  username: string,
  options?: { force?: boolean }
): Promise<CompetitorDashboard> {
  try {
    const data = await fetchCompetitorDashboard(username, options);
    return data;
  } catch (error) {
    console.error("competitors.fetchDashboard.error", { username, error });
    const message = error instanceof Error ? error.message : "Unable to fetch competitor data.";
    return {
      status: "error",
      message,
      cacheAgeSeconds: undefined,
      profile: undefined,
      posts: [],
    };
  }
}

export async function refreshCompetitorCacheAction(username: string): Promise<void> {
  try {
    await invalidateCompetitorCache(username);
    revalidatePath("/dashboard");
  } catch {
    console.error("competitors.invalidateCache.error", { username });
  }
}

export async function listSavedCompetitorsAction(brandId: string): Promise<CompetitorSavedProfile[]> {
  try {
    return await fetchSavedCompetitors(brandId);
  } catch (error) {
    console.error("competitors.listSaved.error", { brandId, error });
    return [];
  }
}

export async function addSavedCompetitorAction(username: string, brandId: string): Promise<void> {
  try {
    await addSavedCompetitor(username, brandId);
  } catch (error) {
    console.error("competitors.addSaved.error", { username, brandId, error });
  }
}

export async function removeSavedCompetitorAction(username: string, brandId: string): Promise<void> {
  try {
    await removeSavedCompetitor(username, brandId);
  } catch (error) {
    console.error("competitors.removeSaved.error", { username, brandId, error });
  }
}
