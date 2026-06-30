export interface BrandRecordOwnership {
  created_by: string | null;
}

/**
 * Whether the current user may persist GLOBAL brand fields (brand_name, logo,
 * completed_at) from their per-user onboarding state.
 *
 * A brand with no row yet is being created by this user, so persistence is
 * allowed. An EXISTING brand may only be written by its creator — invited
 * members (viewer / admin / operator) read the brand; they must never write it
 * back, because their onboarding state's name is defaulted to "<their-name>'s
 * Brand" and writing it overwrote the canonical brand_name for everyone.
 */
export function canPersistBrandRecord(
  record: BrandRecordOwnership | null,
  currentUserId: string,
): boolean {
  if (!record) return true;
  return record.created_by !== null && record.created_by === currentUserId;
}
