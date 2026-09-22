'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import type { JainaScaffoldNodeProgress } from '@/lib/jaina/scaffoldTypes';
import {
  fetchPaidScaffoldHeader,
  fetchPaidScaffoldTreeRows,
  type PaidScaffoldHeader,
} from '@/lib/paid-media/scaffold-tree-client';
import { buildScaffoldTree, type ScaffoldTree } from '@/lib/paid-media/scaffoldTree';

export const PAID_SCAFFOLD_TREE_QUERY_ROOT = 'paid-scaffold-tree';

const scaffoldTreeKey = (scaffoldVersionId: string | null) =>
  [PAID_SCAFFOLD_TREE_QUERY_ROOT, scaffoldVersionId] as const;

/**
 * The scaffold tree, merged from the database rows and the live progress overlay.
 *
 * NO REFETCH STORM, by construction. A 50-ad-set build emits ~300 progress frames;
 * none of them invalidate this query. They arrive as `overlay` and are merged in a
 * `useMemo`, so the fetch count is independent of frame volume. Exactly one
 * invalidation exists — on the terminal receipt, when the database is known to have
 * settled and the optimistic overlay should give way to recorded truth.
 */
export function usePaidScaffoldTree(params: {
  scaffoldVersionId: string | null;
  overlay: Readonly<Record<string, JainaScaffoldNodeProgress>>;
  /** Set once the run emits paid.scaffold_receipt; flips the single refetch. */
  settledAt?: string | null;
}): {
  tree: ScaffoldTree | null;
  header: PaidScaffoldHeader | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: scaffoldTreeKey(params.scaffoldVersionId),
    queryFn: async () => {
      const scaffoldVersionId = params.scaffoldVersionId as string;
      // The header only feeds the currency and the canvas link, so it is best-effort: a failed
      // header read once took the whole tree down with it, and the card showed an error instead
      // of a campaign.
      const [read, header] = await Promise.all([
        fetchPaidScaffoldTreeRows({ scaffoldVersionId }),
        fetchPaidScaffoldHeader({ scaffoldVersionId }).catch((error: unknown) => {
          console.warn('paid_scaffold_header_unavailable', error);
          return null;
        }),
      ]);
      return { ...read, header };
    },
    enabled: Boolean(params.scaffoldVersionId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const settledAt = params.settledAt ?? null;
  React.useEffect(() => {
    if (!settledAt || !params.scaffoldVersionId) return;
    void queryClient.invalidateQueries({ queryKey: scaffoldTreeKey(params.scaffoldVersionId) });
  }, [settledAt, params.scaffoldVersionId, queryClient]);

  const tree = React.useMemo(
    () => (query.data ? buildScaffoldTree(query.data.rows, params.overlay) : null),
    [query.data, params.overlay],
  );

  return {
    tree,
    header: query.data?.header ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
  };
}
