import type { OnboardingState } from './state';

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

export interface BrandRecordFields {
  brand_name: string | null;
  logo_path: string | null;
  completed_at: string | null;
  email_report_opt_in: boolean | null;
}

/**
 * A state minted this load for a brand that already has a row (made by staff
 * provisioning, an admin tool or SQL) starts from that row, not from the blank
 * default. Otherwise ensureBrandProfileRecord writes the default
 * "<handle>'s Brand" and email opt-in over the brand the creator just opened.
 */
export function adoptBrandRecord(
  state: OnboardingState,
  record: BrandRecordFields,
): OnboardingState {
  return {
    ...state,
    brand: {
      ...state.brand,
      name: record.brand_name?.trim() ? record.brand_name : state.brand.name,
      logoPath: record.logo_path ?? state.brand.logoPath,
    },
    completedAt: record.completed_at,
    emailReportOptIn: record.email_report_opt_in ?? true,
  };
}
