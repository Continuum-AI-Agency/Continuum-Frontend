'use client';

import {
  type ForgeOutputLibraryState,
  libraryBrowseQuerySchema,
  type MediaReviewStatus,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, MessageSquare } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Link } from '@/i18n/navigation';
import { librarySearchPath } from '@/lib/library/libraryHref';
import { REVIEW_STATUS_META, REVIEW_STATUS_ORDER } from '@/lib/library/reviewStatus';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { FORGE_STALE_MS, forgeQueryKeys } from './queryKeys';

// Every Forge output is a Library asset — reviewed, versioned and discussed there. This reads that
// side back, so the ledger says where an output stands and links to its thread in the Library.

/** The route's ceiling on ids per read. */
const MAX_ASSETS = 200;

/** One read for every id given (the first 200, in the order given), keyed by asset id. */
export function useLibraryState(brandId: string, assetIds: ReadonlyArray<string | null>) {
  const ids = [...new Set(assetIds.filter((id): id is string => Boolean(id)))]
    .slice(0, MAX_ASSETS)
    .sort();
  const { data } = useQuery({
    queryKey: forgeQueryKeys.libraryState(brandId, ids),
    queryFn: () => apiRendersApi.libraryState(brandId, ids),
    enabled: ids.length > 0,
    staleTime: FORGE_STALE_MS.active,
    retry: false,
  });
  return useMemo(
    () =>
      new Map<string, ForgeOutputLibraryState>(
        data?.items.map((item) => [item.assetId, item] as const),
      ),
    [data],
  );
}

/** The asset's detail over the Library's default view. */
export const libraryAssetHref = (brandId: string, assetId: string) =>
  librarySearchPath(libraryBrowseQuerySchema.parse({ brandId, destination: 'home' }), { assetId });

/**
 * "3/4 approved", toned by the output that most needs someone: any "needs changes", else the one
 * least far along.
 */
export function reviewSummary(
  states: readonly ForgeOutputLibraryState[],
): { label: string; status: MediaReviewStatus } | null {
  if (!states.length) return null;
  const has = (status: MediaReviewStatus) => states.some((state) => state.reviewStatus === status);
  const approved = states.filter((state) => state.reviewStatus === 'approved').length;
  return {
    label: `${approved}/${states.length} approved`,
    status: has('needs_changes') ? 'needs_changes' : (REVIEW_STATUS_ORDER.find(has) ?? 'none'),
  };
}

export function ReviewStatusPill({ status, label }: { status: MediaReviewStatus; label?: string }) {
  const translateUi = useUiTranslations('library');

  const meta = REVIEW_STATUS_META[status];
  return (
    <Pill
      variant="outline"
      className="gap-1.5 text-2xs"
      title={translateUi('library_review_value0_33a19841', { value0: String(meta.label) })}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', meta.dotClass)} />
      {label ?? meta.label}
    </Pill>
  );
}

export function CommentCount({ count }: { count: number }) {
  const translateUi = useUiTranslations('library');

  return (
    <span
      className="inline-flex items-center gap-1 tabular-nums text-muted-foreground"
      title={translateUi('comments_in_the_library_3650e1b1')}
    >
      <MessageSquare className="size-3" aria-hidden />
      <span aria-hidden>{count}</span>
      <span className="sr-only">{translateUi('accessibleComments', { count })}</span>
    </span>
  );
}

export function OpenInLibrary({ brandId, assetId }: { brandId: string; assetId: string }) {
  const translateUi = useUiTranslations('library');

  return (
    <Link
      href={libraryAssetHref(brandId, assetId)}
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      <ExternalLink className="size-3" aria-hidden /> {translateUi('open_in_library_c0a66bb6')}{' '}
    </Link>
  );
}

/** One output's review status, comments and version, then its link. The link needs no read. */
export function LibraryStateLine({
  brandId,
  assetId,
  state,
}: {
  brandId: string;
  assetId: string;
  state: ForgeOutputLibraryState | undefined;
}) {
  const translateUi = useUiTranslations('library');

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      {state ? (
        <>
          <ReviewStatusPill status={state.reviewStatus} />
          <CommentCount count={state.commentCount} />
          {state.versionCount > 1 ? (
            <span
              className="font-mono tabular-nums text-muted-foreground"
              title={translateUi('version_value0_of_value1_90ea6df4', {
                value0: String(state.versionNumber),
                value1: String(state.versionCount),
              })}
            >
              v{state.versionNumber}
            </span>
          ) : null}
        </>
      ) : null}
      <OpenInLibrary brandId={brandId} assetId={assetId} />
    </span>
  );
}
