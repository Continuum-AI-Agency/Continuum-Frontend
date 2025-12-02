"use server";

import { revalidatePath } from "next/cache";

/**
 * Force revalidation of Brand Insights surfaces.
 *
 * This clears the cached RSC payload so the next render pulls fresh data
 * from the Brand Insights backend instead of serving a previously
 * revalidated response.
 */
export async function revalidateBrandInsights() {
  revalidatePath("/dashboard");
  revalidatePath("/organic");
}
