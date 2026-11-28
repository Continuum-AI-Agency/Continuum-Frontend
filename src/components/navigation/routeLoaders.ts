import type { QueryClient } from '@tanstack/react-query';

// Route loaders: each starts the reads a client-fetched page renders first, on navigation
// intent, so they run while the page's code downloads instead of after it mounts. Each is
// imported on first use, so the shell carries none of the pages' code. The server-rendered
// routes (Home, Library, Organic, Settings, Automations, AI Studio) already fetch on the
// server while their client code downloads, so they have none.
type RouteLoader = (queryClient: QueryClient, brandId: string) => Promise<unknown>;

const loaders: Record<string, () => Promise<RouteLoader>> = {
  '/scale': () =>
    import('@/components/paid-media/optimizer/useOptimizerData').then(
      (m) => m.prefetchOptimizerOverview,
    ),
  '/competitor-spy': () =>
    import('@/lib/api/competitorSpy').then((m) => m.prefetchCompetitorSpyEntry),
  '/forge': () => import('@/components/forge/queryKeys').then((m) => m.prefetchForgeEntry),
};

export async function runRouteLoader(
  href: string,
  queryClient: QueryClient,
  brandId: string | null | undefined,
) {
  const load = loaders[href.split('?')[0]];
  if (!load || !brandId) return;
  const loader = await load();
  await loader(queryClient, brandId);
}
