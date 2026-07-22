import { z } from 'zod';
import { makeKey, migrateLegacyKey } from '@/lib/storage/brandScopedStorage';

// ─── Static keys ───────────────────────────────────────────────────────────────
export const STORAGE_KEY_THEME = 'theme';

// User-level keys (no brand scoping needed) — preserved for legacy migration only.
export const STORAGE_KEY_RECENT_PAGES = 'continuum:recent-pages';
export const STORAGE_KEY_AI_STUDIO_KEY_INDEX = 'continuum:ai-studio:key-index';

// ─── Brand-scoped key builders ────────────────────────────────────────────────
// Each `brandStorageKey*` returns a fully-qualified localStorage key namespaced
// by the active brand. Run the matching `migrateLegacy*` once on read to move
// any legacy unscoped value into the brand namespace.

export function brandStorageKeyRecentPages(brandId: string): string {
  return makeKey(STORAGE_KEY_RECENT_PAGES, brandId);
}

export function migrateLegacyRecentPages(brandId: string): void {
  migrateLegacyKey(STORAGE_KEY_RECENT_PAGES, STORAGE_KEY_RECENT_PAGES, brandId);
}

export function brandStorageKeyAiStudioKeyIndex(brandId: string): string {
  return makeKey(STORAGE_KEY_AI_STUDIO_KEY_INDEX, brandId);
}

export function migrateLegacyAiStudioKeyIndex(brandId: string): void {
  migrateLegacyKey(STORAGE_KEY_AI_STUDIO_KEY_INDEX, STORAGE_KEY_AI_STUDIO_KEY_INDEX, brandId);
}

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
} from '@/lib/organic/ai-studio-bridge';

// ─── Zod schemas for validated reads ──────────────────────────────────────────
export const recentPageSchema = z.object({
  href: z.string().min(1),
  label: z.string().min(1),
});
export const recentPagesSchema = z.array(recentPageSchema);
export type RecentPage = z.infer<typeof recentPageSchema>;

export const brandInsightsTimestampSchema = z.number().min(1);
