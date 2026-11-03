/**
 * Easy Fit is reachable from two Continuum brands, and both read ONE dataset: the same Meta
 * account (act_521903353286118), Google Ads customer (5251780631), Peaking and Poliwin.
 *
 * The dataset is stored, ingested nightly and configured under a single owner brand, the one
 * the `easyfit_*` migration seeded. Every other Easy Fit brand reads it through that owner, so
 * no source is ever ingested twice. Access is still checked against the brand the user is in:
 * its members read, its owners/admins refresh, configure and upload.
 *
 * Shared here so the Backend's resolution and the Frontend's tab gating cannot drift.
 */

/** "Easy Fit 2026": the brand the Easy Fit dataset is stored under. */
export const EASYFIT_DATASET_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';

/** "Easyfit (Vivo47 agency)": the brand the team works in; it holds the Meta Optimizer portfolios. */
const EASYFIT_VIVO47_AGENCY_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';

/** Every brand from which the Easy Fit Dashboard is offered. */
export const EASYFIT_BRAND_IDS: readonly string[] = [
  EASYFIT_DATASET_BRAND_ID,
  EASYFIT_VIVO47_AGENCY_BRAND_ID,
];

/** The brand whose Easy Fit dataset `brandId` reads, or null when it is not an Easy Fit brand. */
export const easyfitDatasetBrandFor = (brandId: string | null | undefined): string | null =>
  brandId && EASYFIT_BRAND_IDS.includes(brandId) ? EASYFIT_DATASET_BRAND_ID : null;

export const isEasyfitBrand = (brandId: string | null | undefined): boolean =>
  easyfitDatasetBrandFor(brandId) !== null;
