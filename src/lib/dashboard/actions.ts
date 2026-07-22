'use server';

import { updateTag } from 'next/cache';
import { tags } from '@/lib/cache/tags';

// Invalidates the cached brand-insights (trends/briefing) entry so a freshly
// warmed brand surfaces in the current session after the warm completes,
// instead of waiting for the next natural revalidation. updateTag gives
// read-your-own-writes semantics from a Server Action (Next 16).
export async function revalidateBrandInsightsAction(brandId: string): Promise<void> {
  if (!brandId) return;
  updateTag(tags.brandInsights(brandId));
}
