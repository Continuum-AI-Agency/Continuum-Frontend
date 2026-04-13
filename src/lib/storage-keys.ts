import { z } from "zod";

// ─── Static keys ───────────────────────────────────────────────────────────────
export const STORAGE_KEY_THEME = "theme";
export const STORAGE_KEY_RECENT_PAGES = "continuum:recent-pages";
export const STORAGE_KEY_AI_STUDIO_KEY_INDEX = "continuum:ai-studio:key-index";

// ─── Dynamic key builders ──────────────────────────────────────────────────────
export function storageKeyBrandInsights(brandId: string): string {
  return `continuum:auto-brand-insights:${brandId}`;
}
export function storageKeyOrganicPlan(brandProfileId: string): string {
  return `continuum.organic.plan:${brandProfileId}`;
}

// ─── Re-export AI Studio keys from existing source of truth ───────────────────
export {
  AI_STUDIO_CONTEXT_STORAGE_PREFIX,
  AI_STUDIO_LAST_DRAFT_STORAGE_KEY,
  AI_STUDIO_PENDING_APPLY_PREFIX,
  AI_STUDIO_SESSION_HISTORY_PREFIX,
  buildAiStudioStorageKey,
  buildPendingApplyStorageKey,
  buildSessionHistoryStorageKey,
} from "@/lib/organic/ai-studio-bridge";

// ─── Zod schemas for validated reads ──────────────────────────────────────────
export const recentPageSchema = z.object({
  href: z.string().min(1),
  label: z.string().min(1),
});
export const recentPagesSchema = z.array(recentPageSchema);
export type RecentPage = z.infer<typeof recentPageSchema>;

export const brandInsightsTimestampSchema = z.number().min(1);
