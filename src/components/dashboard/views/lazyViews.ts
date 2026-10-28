'use client';

import dynamic from 'next/dynamic';

// The dashboard renders ONE view, chosen by `?view=`. Next emits a script for every client
// component a page's server graph imports, rendered or not, so static imports made the
// default overview download the paid optimizer, the organic view and all of their schemas.
// A client-side dynamic import is the boundary Next splits on (`next/dynamic` in a Server
// Component does not split, even around a server module).
//
// The cost: a view loaded this way is NOT preloaded with the HTML. Its chunk is requested at
// hydration, and until it lands the page's skeleton replaces the server-rendered view
// (measured: ~0.3 s on slow 4G). So the default view, HomeOverview, is imported statically
// by its wrapper; only the views opened with `?view=` live here.

export const OrganicDashboardView = dynamic(() =>
  import('./OrganicDashboardView').then((m) => m.OrganicDashboardView),
);

export const PaidDashboardView = dynamic(() =>
  import('./PaidDashboardView').then((m) => m.PaidDashboardView),
);

export const OrganicPaidOverview = dynamic(() =>
  import('@/components/organic/compare/OrganicPaidOverview').then((m) => m.OrganicPaidOverview),
);
