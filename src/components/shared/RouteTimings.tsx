'use client';

import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { routeCommitted, routeTemplate } from '@/lib/observability/webVitals';

// Tells the field timings which route is on screen, and when a navigation committed.
// Search params count: a Settings section switch is a navigation to the person too.
export function RouteTimings() {
  const pathname = usePathname();
  const params = useParams<Record<string, string | string[]>>();
  const search = useSearchParams().toString();

  // biome-ignore lint/correctness/useExhaustiveDependencies: params derive from the pathname, and the search string is the trigger for same-path navigations
  useEffect(() => {
    routeCommitted(routeTemplate(pathname, params));
  }, [pathname, search]);

  return null;
}
