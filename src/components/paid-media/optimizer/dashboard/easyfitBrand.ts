// The Easy Fit "Altas" dashboard is a client module. Which brands offer it lives in the shared
// contracts (`EASYFIT_BRAND_IDS`): Easy Fit 2026, which stores the dataset, and Easyfit (Vivo47
// agency), the brand the team works in; both read the one dataset. The Performance+ shell asks
// `isEasyfitBrand` before it offers the tab. Brand access itself is enforced server-side: a user
// only ever sees brands they belong to, and the /easyfit routes refuse anyone without access to
// the brand they name.

export { isEasyfitBrand } from '@continuum/contracts';

/** Mexico City is where every Easy Fit date is cut (docs/02). */
export const EASYFIT_TIME_ZONE = 'America/Mexico_City';
