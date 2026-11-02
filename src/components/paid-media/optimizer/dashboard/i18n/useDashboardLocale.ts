// The ONE place the Easy Fit dashboard decides its language. Spanish is the product default
// for this module (the audience is Easy Fit in Mexico). When the product-wide language
// switcher lands, this hook reads it — nothing else in the dashboard changes.

import { DASHBOARD_DICTIONARIES, type DashboardDictionary } from './dictionary';

export type DashboardLocale = 'es' | 'en';

export const DEFAULT_DASHBOARD_LOCALE: DashboardLocale = 'es';

export function useDashboardLocale(): DashboardLocale {
  return DEFAULT_DASHBOARD_LOCALE;
}

/** The locale plus its strings, so a component makes one call. */
export function useDashboardCopy(): { locale: DashboardLocale; t: DashboardDictionary } {
  const locale = useDashboardLocale();
  return { locale, t: DASHBOARD_DICTIONARIES[locale] };
}
