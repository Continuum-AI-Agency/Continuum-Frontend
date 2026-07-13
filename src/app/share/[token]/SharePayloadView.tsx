// Brand-neutral viewer for a resolved share link. Server-rendered: plain
// anchors handle download (the signed URL's `download` query param sets
// Content-Disposition), so an uncommented share still ships ~zero client JS.
// The only client leaf is ShareVideoPlayer, and only for a video that actually
// carries time-pinned comments — everything else, threads included, is static.
//
// Read-only throughout: comments are displayed, never authored. There is no
// composer on this page and no mutation seam to reach one.

import type { MediaAsset, PublicShareComment, PublicSharePayload } from '@continuum/contracts';
import { Download, FileArchive } from 'lucide-react';
import { initialsFor } from '@/lib/library/comments';
import {
  authorLabel,
  buildPublicShareThreads,
  type PublicShareThread,
  ShareCommentThreads,
} from './ShareCommentThreads';
import { type ShareTimeMarker, ShareVideoPlayer } from './ShareVideoPlayer';

const MARKER_TITLE_MAX = 80;

function downloadUrl(asset: MediaAsset): string | null {
  if (!asset.signedUrl) return null;
  const separator = asset.signedUrl.includes('?') ? '&' : '?';
  return `${asset.signedUrl}${separator}download=${encodeURIComponent(asset.fileName)}`;
}

function formatBytes(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function DownloadButton({ asset }: { asset: MediaAsset }) {
  const href = downloadUrl(asset);
  if (!href) return null;
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      <Download className="size-3.5" aria-hidden />
      Download
    </a>
  );
}

// A thread root pinned to a moment (or a span) on the video becomes a scrubber
// marker. Replies never do: they hang off their root's moment, not their own.
function timeMarkersFor(threads: PublicShareThread[]): ShareTimeMarker[] {
  return threads.flatMap((thread) => {
    const annotation = thread.root.annotation;
    if (!annotation || annotation.kind !== 'time') return [];
    const name = authorLabel(thread.root);
    const body = thread.root.body.trim();
    return [
      {
        id: thread.root.id,
        timeMs: annotation.timeMs,
        endMs: annotation.endMs ?? null,
        initials: initialsFor(name),
        title: `${name}: ${body.length > MARKER_TITLE_MAX ? `${body.slice(0, MARKER_TITLE_MAX)}…` : body}`,
      },
    ];
  });
}

function AssetPreview({ asset, markers }: { asset: MediaAsset; markers: ShareTimeMarker[] }) {
  if (asset.kind === 'image' && asset.signedUrl) {
    return (
      // Signed storage URLs are transient and cross-origin; next/image adds nothing here.
      <img
        src={asset.signedUrl}
        alt={asset.title ?? asset.fileName}
        className="max-h-[70vh] w-full rounded-lg border border-border object-contain"
      />
    );
  }
  if (asset.kind === 'video' && asset.signedUrl) {
    // A video nobody commented on gets the native player, so a plain share stays
    // free of client JS; time-pinned feedback is what earns the custom transport.
    if (markers.length === 0) {
      return (
        <video
          src={asset.signedUrl}
          controls
          playsInline
          className="max-h-[70vh] w-full rounded-lg border border-border bg-black"
        >
          <track kind="captions" />
        </video>
      );
    }
    return (
      <ShareVideoPlayer
        src={asset.signedUrl}
        posterUrl={asset.thumbnailUrl ?? null}
        label={asset.title ?? asset.fileName}
        durationMsHint={asset.durationMs ?? null}
        markers={markers}
      />
    );
  }
  const size = formatBytes(asset.sizeBytes);
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/40 px-8 py-12 text-center">
      <FileArchive className="size-10 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-sm font-medium text-foreground">{asset.fileName}</p>
        <p className="text-xs text-muted-foreground">
          {asset.mimeType}
          {size ? ` · ${size}` : ''}
        </p>
      </div>
    </div>
  );
}

function SharedAssetTile({
  asset,
  comments,
}: {
  asset: MediaAsset;
  comments: PublicShareComment[];
}) {
  const threads = buildPublicShareThreads(comments);
  // Box-annotated images show their threads but no pin overlay: the share page
  // renders the frame, not the annotation stage.
  const markers = asset.kind === 'video' ? timeMarkersFor(threads) : [];

  return (
    <div className="flex flex-col gap-2">
      <AssetPreview asset={asset} markers={markers} />
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-foreground">{asset.title ?? asset.fileName}</p>
        <DownloadButton asset={asset} />
      </div>
      <ShareCommentThreads threads={threads} />
    </div>
  );
}

function commentsByAsset(comments: PublicShareComment[]): Map<string, PublicShareComment[]> {
  const grouped = new Map<string, PublicShareComment[]>();
  for (const comment of comments) {
    const existing = grouped.get(comment.assetId);
    if (existing) existing.push(comment);
    else grouped.set(comment.assetId, [comment]);
  }
  return grouped;
}

export function SharePayloadView({ payload }: { payload: PublicSharePayload }) {
  const heading =
    payload.scope === 'collection'
      ? (payload.collectionName ?? 'Shared collection')
      : (payload.assets[0]?.title ?? payload.assets[0]?.fileName ?? 'Shared asset');
  const grouped = commentsByAsset(payload.comments);

  const tiles = payload.assets.map((asset) => (
    <SharedAssetTile key={asset.id} asset={asset} comments={grouped.get(asset.id) ?? []} />
  ));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-baseline justify-between gap-4 border-b border-border pb-4">
        <h1 className="truncate text-lg font-semibold text-foreground">{heading}</h1>
        <p className="shrink-0 text-xs text-muted-foreground">Shared via Continuum</p>
      </header>
      {payload.scope === 'collection' ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{tiles}</div>
      ) : (
        tiles
      )}
      {payload.assets.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nothing here yet — the shared collection is empty.
        </p>
      ) : null}
    </main>
  );
}
