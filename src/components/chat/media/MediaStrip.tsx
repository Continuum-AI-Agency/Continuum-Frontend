'use client';

import { type ChatMediaItem, type ChatMediaKind, chatMediaRefKey } from '@continuum/contracts';
import { ExternalLink, Layers, Play } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import {
  type SignedChatMediaTile,
  useChatMediaTiles,
  useNearViewport,
} from '@/lib/media/chatMediaRefs';
import { cn } from '@/lib/utils';
import { ChatMediaThumb, MediaFallbackTile } from './ChatMedia';

// Every tile is this tall; its width follows the media's own aspect, or the kind's when the
// provider does not report one (Instagram). Sizes are fixed before a byte arrives, so a strip
// filling in never moves the transcript.
export const MEDIA_STRIP_TILE_HEIGHT = 120;
const KIND_ASPECT: Record<ChatMediaKind, number> = { image: 1, carousel: 4 / 5, video: 9 / 16 };
const MIN_ASPECT = 9 / 16;
const MAX_ASPECT = 16 / 9;

export function mediaStripTileWidth(
  item: Pick<ChatMediaItem, 'kind' | 'w' | 'h'>,
  tileHeight = MEDIA_STRIP_TILE_HEIGHT,
): number {
  const aspect = item.w && item.h ? item.w / item.h : KIND_ASPECT[item.kind];
  return Math.round(tileHeight * Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect)));
}

const KIND_LABEL: Record<ChatMediaKind, string> = {
  image: 'Image',
  carousel: 'Carousel',
  video: 'Video',
};

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${`${total % 60}`.padStart(2, '0')}`;
}

type TileState = 'pending' | 'ready' | 'empty';

const isUnsplash = (item: ChatMediaItem) =>
  item.ref.type === 'platform' && item.ref.platform === 'unsplash';

function MediaStripTile({
  item,
  name,
  signed,
  state,
  onRecover,
}: {
  item: ChatMediaItem;
  name: string;
  signed: SignedChatMediaTile | undefined;
  state: TileState;
  onRecover: () => void;
}) {
  // The tile only ever shows a still: a video's poster, never its bytes. Playback is the
  // player's job, behind its own route.
  const still: ReactNode =
    state === 'ready' && signed?.thumbUrl ? (
      <ChatMediaThumb
        media={{ id: signed.key, url: signed.thumbUrl, kind: 'image', name }}
        fallbackSeed={item.label}
        onRecover={onRecover}
      />
    ) : state === 'pending' ? (
      <span aria-hidden="true" className="block size-full animate-pulse bg-muted/70" />
    ) : (
      <MediaFallbackTile seed={item.label} />
    );

  const body = (
    <>
      {still}
      {item.kind === 'video' ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Play
            aria-hidden="true"
            className="size-5 fill-neutral-50/90 text-neutral-50/90 drop-shadow"
          />
        </span>
      ) : null}
      {item.kind === 'carousel' ? (
        <Layers
          aria-hidden="true"
          className="pointer-events-none absolute right-1 top-1 size-3.5 text-neutral-50 drop-shadow"
        />
      ) : null}
      {item.kind === 'video' && item.durationMs ? (
        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 font-medium text-3xs tabular-nums text-white">
          {formatDuration(item.durationMs)}
        </span>
      ) : null}
      {/* Unsplash's terms: the photographer's credit is shown, not only announced. */}
      {isUnsplash(item) && item.label ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-3xs text-white">
          {item.label}
        </span>
      ) : null}
      {state === 'empty' && item.permalink ? (
        <ExternalLink
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 left-1 size-3 text-muted-foreground"
        />
      ) : null}
    </>
  );

  const frame = 'relative block size-full overflow-hidden rounded-md bg-muted';
  return item.permalink ? (
    <a
      href={item.permalink}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} (opens in a new tab)`}
      className={cn(
        frame,
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      )}
    >
      {body}
    </a>
  ) : (
    <span role="img" aria-label={name} className={frame}>
      {body}
    </span>
  );
}

type MediaStripProps = {
  brandId: string | null | undefined;
  items: readonly ChatMediaItem[];
  /** How many the source found; above items.length the strip was capped. */
  total?: number;
  /** What the strip is ("Recent media"); names the group for assistive tech. */
  label?: string;
  className?: string;
  /** Identifies the strip in the DOM (the tool call it belongs to). */
  stripId?: string;
  /** Tiles shorter than the chat's (a batch card's rows); widths follow from it. */
  tileHeight?: number;
};

/**
 * One renderer for every media strip: a tool result in the Organic chat, and headless outputs.
 * Items are refs; the strip signs them in one call on view and re-signs a tile that fails.
 */
export function MediaStrip({
  brandId,
  items,
  total,
  label,
  className,
  stripId,
  tileHeight = MEDIA_STRIP_TILE_HEIGHT,
}: MediaStripProps) {
  const refs = useMemo(() => items.map((item) => item.ref), [items]);
  const [observe, near] = useNearViewport();
  const { tiles, settled, recover } = useChatMediaTiles(brandId, refs, { enabled: near });
  const more = Math.max(0, (total ?? items.length) - items.length);
  const groupLabel = `${label ?? 'Media'}: ${items.length}${more > 0 ? ` of ${total}` : ''}`;

  return (
    <figure
      ref={observe}
      data-slot="media-strip"
      data-strip-id={stripId}
      aria-label={groupLabel}
      className={cn('m-0 min-w-0', className)}
    >
      {label ? (
        <figcaption className="mb-1.5 text-xs font-medium text-muted-foreground">
          {label}
        </figcaption>
      ) : null}
      <ul className="flex gap-1.5 overflow-x-auto pb-1">
        {items.map((item, index) => {
          const key = chatMediaRefKey(item.ref);
          const signed = tiles.get(key);
          const state: TileState = signed?.thumbUrl
            ? 'ready'
            : signed || settled
              ? 'empty'
              : 'pending';
          const name =
            item.label?.trim() || `${KIND_LABEL[item.kind]} ${index + 1} of ${items.length}`;
          return (
            <li
              key={key}
              data-media-key={key}
              data-tile-state={state}
              className="shrink-0"
              style={{ width: mediaStripTileWidth(item, tileHeight), height: tileHeight }}
            >
              <MediaStripTile
                item={item}
                name={name}
                signed={signed}
                state={state}
                onRecover={() => recover(key)}
              />
            </li>
          );
        })}
        {more > 0 ? (
          <li
            className="flex shrink-0 items-center justify-center rounded-md border border-border/60 px-3 text-xs tabular-nums text-muted-foreground"
            style={{ height: tileHeight }}
          >
            +{more} more
          </li>
        ) : null}
      </ul>
    </figure>
  );
}
