'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { tags } from '@/lib/cache/tags';

/**
 * Force revalidation of Brand Insights surfaces.
 *
 * Tag-based invalidation runs immediately so the same request reads fresh
 * data once consumer pages adopt cacheTag(). Path-based invalidation
 * remains as belt-and-suspenders during the transition.
 */
export async function revalidateBrandInsights(brandId: string) {
  if (!brandId) throw new Error('brandId is required');

  updateTag(tags.brandInsights(brandId));

  revalidatePath('/dashboard');
  revalidatePath('/organic');
}
