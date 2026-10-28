'use client';

// Google's own views on the Google tab (P6 lane B: Quality Score map, money left on the table,
// search terms, PMax health), mounted once by GoogleAdsTab under the account read, on the read's
// own window. Their reads are the hooks in ../googleReads. Renders nothing until lane B lands.

import type { GoogleReadWindow } from '../googleReads';

export type GoogleOwnViewsProps = {
  brandId: string;
  customerId: string;
  /** The customer's currency code, or null when no source reports it. */
  currency: string | null;
  window: GoogleReadWindow;
};

export function GoogleOwnViews(_props: GoogleOwnViewsProps) {
  return null;
}
