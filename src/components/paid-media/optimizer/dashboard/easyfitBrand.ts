// The Easy Fit "Altas" dashboard is a client module built for one brand. This is the one
// place that names it; the Performance+ shell asks `isEasyfitBrand` before it offers the tab.
// Brand access itself is enforced server-side: a user only ever sees brands they belong to,
// and GET /easyfit/dashboard refuses anyone without access to this brand.

export const EASYFIT_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';

/** Mexico City is where every Easy Fit date is cut (docs/02). */
export const EASYFIT_TIME_ZONE = 'America/Mexico_City';

export function isEasyfitBrand(brandId: string | null | undefined): boolean {
  return brandId === EASYFIT_BRAND_ID;
}
