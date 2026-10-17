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
