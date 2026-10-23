'use client';

import type { HeadlessBatchFormat, HeadlessBatchItemState } from '@continuum/contracts';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check } from 'lucide-react';
import { Fragment, type RefObject, useEffect, useRef, useState } from 'react';
import { MediaStrip, mediaStripTileWidth } from '@/components/chat/media/MediaStrip';
import { AgentButton } from '@/components/shared/agent-cards/agentCardKit';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import {
  approveHeadlessBatchCast,
  fetchHeadlessBatchStatus,
  headlessBatchQueryKey,
  headlessBatchRefreshDelayMs,
  plainBatchReason,
  type ReadHeadlessBatchItem,
  type ReadHeadlessBatchStatus,
} from '@/lib/organic-agent/headlessBatch';
import { cn } from '@/lib/utils';

// A batch holds up to 60 pieces: rows stay short, and every box is sized before a byte arrives so
// a piece turning ready never moves the transcript.
const TILE_HEIGHT = 72;
type FormatMedia = { kind: 'video' | 'carousel'; w: number; h: number };
const STILL_SET_MEDIA: FormatMedia = { kind: 'carousel', w: 1080, h: 1350 };
// A format this build does not know yet is a "Piece" in the still set's box, the widest one.
const FORMAT_MEDIA: Partial<Record<string, FormatMedia>> = {
  reel: { kind: 'video', w: 1080, h: 1920 },
  still_set: STILL_SET_MEDIA,
} satisfies Record<HeadlessBatchFormat, FormatMedia>;
const FORMAT_LABEL: Partial<Record<string, string>> = {
  reel: 'Reel',
  still_set: 'Still set',
} satisfies Record<HeadlessBatchFormat, string>;
// Every row's output column is the still set's width, the widest format, so labels line up.
const COLUMN_WIDTH = mediaStripTileWidth(STILL_SET_MEDIA, TILE_HEIGHT);
// A state this build does not know yet reads as in progress; the counts line leaves it out.
const STATE_LABEL: Partial<Record<string, string>> = {
  queued: 'Waiting for a slot',
  running: 'Being made',
  needs_cast_approval: 'Waiting on the cast',
  ready: 'Ready',
  failed: 'Failed',
} satisfies Record<HeadlessBatchItemState, string>;
const COUNT_LABEL: ReadonlyArray<readonly [HeadlessBatchItemState, one: string, many: string]> = [
  ['ready', 'ready', 'ready'],
  ['failed', 'failed', 'failed'],
  ['running', 'running', 'running'],
  ['queued', 'queued', 'queued'],
  ['needs_cast_approval', 'needs the cast', 'need the cast'],
];

/**
 * The status, how many refreshes in a row returned it unchanged, and how many in a row failed,
 * shared by every card.
 */
type BatchEntry = { status: ReadHeadlessBatchStatus; unchanged: number; failures: number };

// The route's permanent answers (bad query, not this viewer's brand, no such batch) and a body
// that no longer parses. Anything else (a timeout, a 5xx, a lapsed token) keeps the last status
// on screen and backs off.
const PERMANENT_STATUSES = new Set([400, 403, 404]);
const isPermanent = (error: unknown) =>
  (error instanceof ApiError && PERMANENT_STATUSES.has(error.status)) ||
  (error instanceof Error && error.name === 'ZodError');
// Passing errors that never pass are as final as a 404: past this many in a row the card stops.
const MAX_FAILURES = 5;
const isStopped = (entry: BatchEntry | undefined, error: unknown) =>
  Boolean(entry?.status.done) || (entry?.failures ?? 0) >= MAX_FAILURES || isPermanent(error);

const settledCount = (status: ReadHeadlessBatchStatus) =>
  status.counts.ready + status.counts.failed;

/** A frame is written over the shared status only when it is further along, never behind it. */
function isAhead(frame: ReadHeadlessBatchStatus, cached: ReadHeadlessBatchStatus): boolean {
  const settled = settledCount(frame) - settledCount(cached);
  const castDrafted =
    frame.cast.drafts.length > 0 &&
    cached.cast.drafts.length === 0 &&
    frame.cast.approved === cached.cast.approved;
  return (
    settled > 0 ||
    (settled === 0 && (frame.counts.running > cached.counts.running || castDrafted)) ||
    (frame.cast.approved && !cached.cast.approved) ||
    (frame.done && !cached.done)
  );
}

const itemLabel = (item: ReadHeadlessBatchItem) =>
  `${FORMAT_LABEL[item.format] ?? 'Piece'} ${item.index + 1}`;

function castKindLabel(kind: string): string {
  if (kind === 'character') return 'Person';
  if (kind === 'scene') return 'Place';
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

/**
 * One query per batch, so every card of it (the create turn's, a later status turn's) costs one
 * request per refresh: TanStack restarts each observer's interval whenever the shared query
 * changes, and a fetch already in flight is joined, not repeated.
 */
function useBatchStatus(
  brandId: string | null | undefined,
  frame: ReadHeadlessBatchStatus,
  inView: boolean,
  live: boolean,
): { status: ReadHeadlessBatchStatus; unreadable: boolean } {
  const queryClient = useQueryClient();
  const key = headlessBatchQueryKey(brandId, frame.batchId);
  const cached = queryClient.getQueryState<BatchEntry>(key);
  const stopped = frame.done || isStopped(cached?.data, cached?.error);
  // A frame streamed just now IS the batch as it is: no request until it goes stale. A restored
  // one may be hours old, so the first view asks at once. Kept from mount, as the turn ends.
  const [frameAt] = useState(() => (live ? Date.now() : 0));

  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }): Promise<BatchEntry> => {
      const previous = queryClient.getQueryData<BatchEntry>(key) ?? {
        status: frame,
        unchanged: 0,
        failures: 0,
      };
      try {
        const status = await fetchHeadlessBatchStatus({
          brandId: brandId ?? '',
          batchId: frame.batchId,
          signal,
        });
        const same = JSON.stringify(status) === JSON.stringify(previous.status);
        return { status, unchanged: same ? previous.unchanged + 1 : 0, failures: 0 };
      } catch (error) {
        if (isPermanent(error) || signal.aborted) throw error;
        return { ...previous, unchanged: previous.unchanged + 1, failures: previous.failures + 1 };
      }
    },
    initialData: { status: frame, unchanged: 0, failures: 0 },
    initialDataUpdatedAt: frameAt,
    // Coming back into view after this long asks again at once.
    staleTime: 10_000,
    enabled: Boolean(brandId) && inView && !stopped,
    refetchInterval: (current) => {
      const entry = current.state.data;
      if (!entry || isStopped(entry, current.state.error)) return false;
      const active = entry.status.counts.running + entry.status.counts.queued > 0;
      return headlessBatchRefreshDelayMs(entry.unchanged, active);
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // A frame (at mount, or a later one the reducer swapped in) is the newest word on the batch only
  // when it is further along than what the cards already show.
  const synced = useRef<ReadHeadlessBatchStatus | null>(null);
  useEffect(() => {
    if (synced.current === frame) return;
    synced.current = frame;
    const batchKey = headlessBatchQueryKey(brandId, frame.batchId);
    const current = queryClient.getQueryData<BatchEntry>(batchKey);
    if (current && !isAhead(frame, current.status)) return;
    queryClient.setQueryData<BatchEntry>(batchKey, { status: frame, unchanged: 0, failures: 0 });
  }, [brandId, frame, queryClient]);

  return {
    status: query.data.status,
    unreadable: isPermanent(query.error) || query.data.failures >= MAX_FAILURES,
  };
}

/**
 * Whether the card is on screen now. Unlike the media's near-viewport this never latches: a card
 * scrolled away, or behind the hidden Agent tab (display:none never intersects), stops polling.
 */
function useInView(): [(node: HTMLElement | null) => void, boolean] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const latest = entries.at(-1);
      if (latest) setInView(latest.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, inView];
}

// Two cards of one batch announce its progress once: the first mounted card owns the live region.
// ponytail: the other card does not take it over when the owner unmounts; it would need a store
// subscription, and both cards leave the transcript together in practice.
const liveRegionOwners = new Map<string, object>();
function useOwnsLiveRegion(batchId: string): boolean {
  const [token] = useState(() => ({}));
  const [owns, setOwns] = useState(false);
  useEffect(() => {
    if (!liveRegionOwners.has(batchId)) liveRegionOwners.set(batchId, token);
    setOwns(liveRegionOwners.get(batchId) === token);
    return () => {
      if (liveRegionOwners.get(batchId) === token) liveRegionOwners.delete(batchId);
    };
  }, [batchId, token]);
  return owns;
}

function castErrorWords(error: unknown): string {
  const overWindow =
    error instanceof ApiError &&
    error.status === 422 &&
    [error.message, error.code].some((text) => text?.includes('cast_pack_over_window'));
  return overWindow
    ? "The brand's 24 h window can't cover the character packs right now."
    : 'Could not approve the cast. Try again.';
}

/**
 * The cast approval for the drafts on screen, shared by every card of the batch. After one
 * approval the Backend can park a piece on new drafts: those are their own single approval, so
 * the click guard is keyed by the set of drafts. The mutation key is not: TanStack resets a
 * mutation whose key changes, which would drop the "Cast approved" line the moment the drafts
 * clear.
 */
function useApproveCast(
  brandId: string | null | undefined,
  status: ReadHeadlessBatchStatus,
  focusAfter: RefObject<HTMLElement | null>,
) {
  const queryClient = useQueryClient();
  const draftIds = status.cast.drafts.map((draft) => draft.elementId);
  const draftSet = [...draftIds].sort().join(',');
  const mutationKey = ['organic', 'headless-cast', brandId ?? 'none', status.batchId] as const;
  const pendingAnywhere = useIsMutating({ mutationKey }) > 0;
  const sent = useRef<string | null>(null);
  const approve = useMutation({
    mutationKey,
    mutationFn: (draftElementIds: string[]) =>
      approveHeadlessBatchCast({
        brandId: brandId ?? '',
        batchId: status.batchId,
        draftElementIds,
      }),
    onSuccess: async () => {
      const key = headlessBatchQueryKey(brandId, status.batchId);
      // Every card of the batch drops its cast block at once; the refetch confirms it.
      queryClient.setQueryData<BatchEntry>(
        key,
        (entry) =>
          entry && {
            ...entry,
            status: { ...entry.status, cast: { ...entry.status.cast, approved: true, drafts: [] } },
            unchanged: 0,
          },
      );
      // The button the user pressed is gone: keep keyboard focus on the card, not the page.
      focusAfter.current?.focus();
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => {
      sent.current = null;
    },
  });
  const errorIsForThisSet = [...(approve.variables ?? [])].sort().join(',') === draftSet;
  return {
    // The ref stops a double click here, the mutation cache a click on another card of the batch,
    // both before React re-renders a button disabled: one POST per set of drafts.
    start: () => {
      if (!brandId || sent.current === draftSet || queryClient.isMutating({ mutationKey }) > 0) {
        return;
      }
      sent.current = draftSet;
      approve.mutate(draftIds);
    },
    disabled: !brandId || pendingAnywhere,
    approved: approve.isSuccess,
    error: approve.isError && errorIsForThisSet ? castErrorWords(approve.error) : null,
  };
}

function CastBlock({
  status,
  cast,
}: {
  status: ReadHeadlessBatchStatus;
  cast: ReturnType<typeof useApproveCast>;
}) {
  return (
    <div
      data-slot="headless-batch-cast"
      className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
    >
      <p className="text-sm text-foreground">
        The first piece drafted these people and places. Approve them once and every waiting piece
        continues with them.
      </p>
      <ul className="space-y-1">
        {status.cast.drafts.map((draft) => (
          <li key={draft.elementId} className="flex gap-2 text-xs">
            <span className="w-12 shrink-0 font-medium text-muted-foreground">
              {castKindLabel(draft.kind)}
            </span>
            <span className="min-w-0 text-foreground/90">{draft.summary}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <AgentButton
          data-slot="headless-batch-approve-cast"
          disabled={cast.disabled}
          onClick={cast.start}
          className="h-8 min-h-0 px-3 text-xs focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Check className="size-3.5" aria-hidden="true" />
          Approve cast
        </AgentButton>
        {cast.error ? (
          <p role="alert" className="text-xs text-destructive">
            {cast.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BatchItemRow({
  brandId,
  batchId,
  item,
  onOpenDraft,
}: {
  brandId: string | null | undefined;
  batchId: string;
  item: ReadHeadlessBatchItem;
  onOpenDraft: (draftId: string) => void;
}) {
  const label = itemLabel(item);
  const media = FORMAT_MEDIA[item.format] ?? STILL_SET_MEDIA;
  const reason = plainBatchReason(item.state, item.reason);
  const extraSlides = item.outputCount - 1;
  return (
    <li
      data-slot="headless-batch-item"
      data-item-index={item.index}
      data-item-state={item.state}
      data-item-format={item.format}
      className="flex h-[84px] items-center gap-3 border-b border-border/40 px-1 last:border-b-0"
    >
      <div
        data-slot="headless-batch-item-output"
        className="shrink-0"
        style={{ width: COLUMN_WIDTH, height: TILE_HEIGHT }}
      >
        <div
          className="h-full overflow-hidden rounded-md bg-muted"
          style={{ width: mediaStripTileWidth(media, TILE_HEIGHT) }}
        >
          {item.state === 'ready' && item.cover ? (
            <MediaStrip
              brandId={brandId}
              // Sized as the format, whatever the cover reports, so the tile never changes width.
              items={[{ ...item.cover, w: media.w, h: media.h }]}
              stripId={`headless-batch:${batchId}:${item.index}`}
              label={label}
              tileHeight={TILE_HEIGHT}
              className="[&>figcaption]:sr-only"
            />
          ) : item.state === 'running' ? (
            <Skeleton aria-hidden="true" className="size-full rounded-none" />
          ) : (
            <span aria-hidden="true" className="block size-full" />
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className={cn(item.state === 'failed' && 'text-destructive')}>
            {STATE_LABEL[item.state] ?? 'In progress'}
          </span>
          {item.redirected ? ' · Second pass' : ''}
          {extraSlides > 0 ? ` · +${extraSlides} slide${extraSlides === 1 ? '' : 's'}` : ''}
        </p>
        {/* Always present, so the text never re-centres when a reason appears or clears. */}
        <p
          data-slot={reason ? 'headless-batch-item-reason' : undefined}
          title={reason ?? undefined}
          className="min-h-4 truncate text-xs text-muted-foreground"
        >
          {reason}
        </p>
      </div>
      <AgentButton
        variant="ghost"
        data-slot="headless-batch-open-draft"
        onClick={() => onOpenDraft(item.draftId)}
        className="h-7 min-h-0 shrink-0 gap-1 px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring"
      >
        Open draft
        <span className="sr-only">{` for ${label}`}</span>
        <ArrowUpRight className="size-3" aria-hidden="true" />
      </AgentButton>
    </li>
  );
}

/**
 * A headless batch in the Organic chat: one row per piece, its output on its own row as it lands,
 * and the batch's one cast approval. Polls the batch route while anything is still moving.
 */
export function HeadlessBatchCard({
  brandId,
  status: frame,
  live = false,
  onOpenDraft,
}: {
  brandId: string | null | undefined;
  status: ReadHeadlessBatchStatus;
  /** The frame just streamed in this turn, rather than restored from history. */
  live?: boolean;
  onOpenDraft: (draftId: string) => void;
}) {
  const [observe, inView] = useInView();
  const { status, unreadable } = useBatchStatus(brandId, frame, inView, live);
  const ownsLiveRegion = useOwnsLiveRegion(status.batchId);
  const progressRef = useRef<HTMLParagraphElement>(null);
  const cast = useApproveCast(brandId, status, progressRef);
  const total = status.items.length;
  const finished = settledCount(status);
  const pct = Math.round((finished / total) * 100);
  // Drafts can wait after an earlier approval too: a piece the Backend re-parked on new ones.
  const castWaiting = status.cast.drafts.length > 0;

  return (
    <section
      ref={observe}
      data-slot="headless-batch-card"
      data-batch-id={status.batchId}
      data-done={String(status.done)}
      aria-label={`Batch of ${total} pieces`}
      className="space-y-3 rounded-lg border border-border/50 bg-card/80 p-3 text-sm"
    >
      <div className="space-y-1.5">
        <p className="font-medium text-foreground">{`Batch of ${total} pieces`}</p>
        <p
          ref={progressRef}
          tabIndex={-1}
          data-slot="headless-batch-progress"
          role={ownsLiveRegion ? 'status' : undefined}
          aria-live={ownsLiveRegion ? 'polite' : undefined}
          className="truncate text-xs tabular-nums text-muted-foreground outline-none"
        >
          {COUNT_LABEL.map(([state, one, many], i) => (
            <Fragment key={state}>
              {i > 0 ? ' · ' : null}
              <span data-count-state={state}>
                {`${status.counts[state]} ${status.counts[state] === 1 ? one : many}`}
              </span>
            </Fragment>
          ))}
        </p>
        <div
          role="progressbar"
          aria-label="Pieces finished"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${finished} of ${total} finished`}
          className="h-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-brand-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <ul
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region keyboard users must reach.
        tabIndex={0}
        aria-label="Pieces"
        // About five and a half rows, so a sixth visibly peeks and says the list scrolls.
        className="max-h-[462px] overflow-y-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {status.items.map((item) => (
          <BatchItemRow
            key={item.index}
            brandId={brandId}
            batchId={status.batchId}
            item={item}
            onOpenDraft={onOpenDraft}
          />
        ))}
      </ul>
      {/* Below the list, so these lines coming and going never move a row. */}
      {unreadable ? (
        <p data-slot="headless-batch-unreadable" className="text-xs text-muted-foreground">
          This batch can&apos;t be read any more.
        </p>
      ) : null}
      {castWaiting ? <CastBlock status={status} cast={cast} /> : null}
      {status.cast.needed && !status.cast.approved && status.cast.drafts.length === 0 ? (
        <p className="text-xs text-muted-foreground">The first piece is drafting the cast.</p>
      ) : null}
      {cast.approved && !castWaiting ? (
        <p role="status" className="text-xs text-muted-foreground">
          Cast approved. The waiting pieces continue.
        </p>
      ) : null}
    </section>
  );
}
