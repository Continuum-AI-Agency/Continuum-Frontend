// The public viewer for a resolved share link, in the owner's chosen layout
// (grid, list or reel) and the brand's look (logo, accent, background, theme —
// the brand kit by default, the link's overrides on top). Server-rendered; the
// client leaves are the reel's pager, the per-session watermark, the event
// beacons, the video player with time-pinned comments and the guest forms.
// Downloads go through /share/<token>/download so each one is recorded and,
// on a watermarked link, burned with the reviewer's identity.

import type {
  CommentDeepLink,
  CustomFieldValue,
  MediaAsset,
  PublicShareAsset,
  PublicShareComment,
  PublicSharePayload,
  ShareFeaturedField,
  ShareLinkLayout,
  ShareLinkWatermark,
  ShareWatermarkViewer,
} from '@continuum/contracts';
import type { CSSProperties, ReactNode } from 'react';
import { buildShareDeepLinkHref, commentDeepLinkFromAnnotation } from '@continuum/contracts';
import { Download, FileArchive } from 'lucide-react';
import { initialsFor } from '@/lib/library/comments';
import { ExternalApprovalControl } from './ExternalApprovalControl';
import { ExternalCommentComposer } from './ExternalCommentComposer';
import {
  authorLabel,
  buildPublicShareThreads,
  type PublicShareThread,
  ShareCommentThreads,
} from './ShareCommentThreads';
import { FeaturedFieldEditor } from './FeaturedFieldEditor';
import { ShareAssetBeacon, ShareOpenBeacon } from './ShareEventBeacon';
import { ShareReel } from './ShareReel';
import { type ShareTimeMarker, ShareVideoPlayer } from './ShareVideoPlayer';
import { ShareWatermark } from './ShareWatermark';

const MARKER_TITLE_MAX = 80;

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

function DownloadButton({
  asset,
  token,
  versionId,
}: {
  asset: MediaAsset;
  token: string;
  versionId: string;
}) {
  if (!asset.signedUrl) return null;
  const query = new URLSearchParams({ asset: asset.id, version: versionId });
  return (
    <a
      href={`/share/${token}/download?${query}`}
      data-share-download={asset.id}
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

function PublicImageAnnotations({ comments }: { comments: PublicShareComment[] }) {
  const annotations = comments.flatMap((comment) =>
    comment.annotation && comment.annotation.kind !== 'time'
      ? [{ id: comment.id, annotation: comment.annotation }]
      : [],
  );
  if (annotations.length === 0) return null;
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
      aria-label="Review annotations"
    >
      {annotations.map(({ id, annotation }, index) => {
        if (annotation.kind === 'box') {
          return (
            <rect
              key={id}
              x={annotation.x * 1000}
              y={annotation.y * 1000}
              width={annotation.width * 1000}
              height={annotation.height * 1000}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-primary"
            />
          );
        }
        if (annotation.kind === 'freehand') {
          const points = annotation.points
            .map((point) => `${point.x * 1000},${point.y * 1000}`)
            .join(' ');
          return (
            <polyline
              key={id}
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            />
          );
        }
        return (
          <g key={id} className="text-primary">
            <circle cx={annotation.x * 1000} cy={annotation.y * 1000} r="18" fill="currentColor" />
            <text
              x={annotation.x * 1000}
              y={annotation.y * 1000 + 7}
              textAnchor="middle"
              fontSize="22"
              fill="white"
            >
              {index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function AssetPreviewMedia({
  asset,
  markers,
  comments,
  deepLink,
}: {
  asset: MediaAsset;
  markers: ShareTimeMarker[];
  comments: PublicShareComment[];
  deepLink?: CommentDeepLink;
}) {
  if (asset.carousel && asset.carousel.slides.length > 1) {
    return (
      <div className="grid grid-cols-1 gap-2 overflow-hidden rounded-lg border border-border bg-muted/30 sm:grid-cols-2">
        {asset.carousel.slides.map((slide) =>
          slide.signedUrl ? (
            slide.kind === 'video' ? (
              <video
                key={slide.assetId ?? slide.slideIndex}
                src={slide.signedUrl}
                controls
                playsInline
                className="aspect-square size-full bg-black object-contain"
              >
                <track kind="captions" />
              </video>
            ) : (
              <img
                key={slide.assetId ?? slide.slideIndex}
                src={slide.signedUrl}
                alt={`${asset.title ?? asset.fileName} · slide ${slide.slideIndex + 1}`}
                className="aspect-square size-full object-contain"
              />
            )
          ) : (
            <div
              key={slide.assetId ?? slide.slideIndex}
              className="flex aspect-square items-center justify-center text-xs text-muted-foreground"
            >
              Slide {slide.slideIndex + 1} unavailable
            </div>
          ),
        )}
      </div>
    );
  }
  const preview = asset.preview?.state === 'ready' ? asset.preview : null;
  // A video's image preview is its poster: the reviewer gets the playable file.
  if (preview?.kind === 'image' && preview.signedUrl && asset.kind !== 'video') {
    return (
      <div className="relative overflow-hidden rounded-lg border border-border">
        <img
          src={preview.signedUrl}
          alt={asset.title ?? asset.fileName}
          className="max-h-[70vh] w-full object-contain"
        />
        <PublicImageAnnotations comments={comments} />
      </div>
    );
  }
  if (preview?.kind === 'video' && preview.signedUrl) {
    return (
      <video
        src={preview.signedUrl}
        controls
        playsInline
        className="max-h-[70vh] w-full rounded-lg border border-border bg-black"
      >
        <track kind="captions" />
      </video>
    );
  }
  if (asset.kind === 'image' && asset.signedUrl) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-border">
        {/* Signed storage URLs are transient and cross-origin; next/image adds nothing here. */}
        <img
          src={asset.signedUrl}
          alt={asset.title ?? asset.fileName}
          className="max-h-[70vh] w-full object-contain"
        />
        <PublicImageAnnotations comments={comments} />
      </div>
    );
  }
  if (asset.kind === 'video' && asset.signedUrl) {
    // A video nobody commented on gets the native player, so a plain share stays
    // free of client JS; time-pinned feedback is what earns the custom transport.
    if (markers.length === 0 && !deepLink?.commentId && deepLink?.timeMs == null) {
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
        initialSelectedId={deepLink?.commentId ?? null}
        initialTimeMs={deepLink?.timeMs ?? null}
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

type WatermarkOverlay = {
  watermark: ShareLinkWatermark;
  viewer: Omit<ShareWatermarkViewer, 'time'>;
};

function AssetPreview({
  overlay,
  ...media
}: Parameters<typeof AssetPreviewMedia>[0] & { overlay: WatermarkOverlay | null }) {
  if (!overlay) return <AssetPreviewMedia {...media} />;
  return (
    <div className="relative">
      <AssetPreviewMedia {...media} />
      <ShareWatermark watermark={overlay.watermark} viewer={overlay.viewer} />
    </div>
  );
}

function SharedAssetTile({
  sharedAsset,
  comments,
  allowDownload,
  showMetadata,
  token,
  allowComments,
  hasIdentity,
  hasPasscode,
  allowApproval,
  deepLink,
  layout,
  overlay,
  featuredField,
  featuredValue,
}: {
  layout: ShareLinkLayout;
  overlay: WatermarkOverlay | null;
  featuredField: ShareFeaturedField | null;
  featuredValue: CustomFieldValue | undefined;
  sharedAsset: PublicShareAsset;
  comments: PublicShareComment[];
  allowDownload: boolean;
  showMetadata: boolean;
  token: string;
  allowComments: boolean;
  hasIdentity: boolean;
  hasPasscode: boolean;
  allowApproval: boolean;
  deepLink?: CommentDeepLink;
}) {
  const { asset, versionId, versionNumber, isHead } = sharedAsset;
  const threads = buildPublicShareThreads(comments);
  // Box-annotated images show their threads but no pin overlay: the share page
  // renders the frame, not the annotation stage.
  const markers = asset.kind === 'video' ? timeMarkersFor(threads) : [];

  const preview = (
    <AssetPreview
      asset={asset}
      markers={markers}
      comments={comments}
      deepLink={deepLink}
      overlay={overlay}
    />
  );
  const details = (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">{asset.title ?? asset.fileName}</p>
          <p className="text-2xs text-muted-foreground">
            Version {versionNumber}
            {isHead ? ' · Latest' : ''}
          </p>
        </div>
        {allowDownload ? <DownloadButton asset={asset} token={token} versionId={versionId} /> : null}
      </div>
      {showMetadata ? (
        <p className="text-xs text-muted-foreground">
          {asset.mimeType}
          {formatBytes(asset.sizeBytes) ? ` · ${formatBytes(asset.sizeBytes)}` : ''}
        </p>
      ) : null}
      {featuredField ? (
        <FeaturedFieldEditor
          token={token}
          assetId={asset.id}
          versionId={versionId}
          field={featuredField}
          value={featuredValue}
          hasIdentity={hasIdentity}
        />
      ) : null}
      <ShareCommentThreads
        threads={threads}
        commentHref={(comment) =>
          buildShareDeepLinkHref({
            token,
            deepLink: commentDeepLinkFromAnnotation(comment.id, comment.annotation),
          })
        }
      />
      {allowComments ? (
        <ExternalCommentComposer
          token={token}
          assetId={asset.id}
          versionId={versionId}
          hasIdentity={hasIdentity}
          hasPasscode={hasPasscode}
        />
      ) : null}
      {allowApproval ? (
        <ExternalApprovalControl
          token={token}
          assetId={asset.id}
          versionId={versionId}
          hasIdentity={hasIdentity}
          hasPasscode={hasPasscode}
        />
      ) : null}
    </div>
  );

  return (
    <ShareAssetBeacon
      token={token}
      assetId={asset.id}
      versionId={versionId}
      className={
        layout === 'list'
          ? 'grid gap-4 border-b border-border pb-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'
          : 'flex flex-col gap-2'
      }
    >
      {preview}
      {details}
    </ShareAssetBeacon>
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

const DOWNLOAD_ALL_CLASS =
  'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90';

function LayoutBody({
  layout,
  tiles,
  labels,
}: {
  layout: ShareLinkLayout;
  tiles: ReactNode[];
  labels: string[];
}) {
  if (layout === 'reel') return <ShareReel slides={tiles} labels={labels} />;
  if (layout === 'list') return <div className="flex flex-col gap-6">{tiles}</div>;
  return <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{tiles}</div>;
}

export function SharePayloadView({
  token,
  payload,
  deepLink,
}: {
  token: string;
  payload: PublicSharePayload;
  deepLink?: CommentDeepLink;
}) {
  const fallbackHeading =
    payload.scope === 'collection'
      ? (payload.collectionName ?? 'Shared collection')
      : (payload.assets[0]?.asset.title ?? payload.assets[0]?.asset.fileName ?? 'Shared asset');
  const branding = payload.branding ?? {};
  const heading = branding.headerTitle ?? fallbackHeading;
  // A single asset has nothing to lay out; the owner's layout applies to many.
  const layout: ShareLinkLayout =
    payload.assets.length > 1 ? (payload.layout ?? 'grid') : 'list';
  const grouped = commentsByAsset(payload.comments);
  const overlay: WatermarkOverlay | null =
    payload.watermark && payload.reviewer
      ? {
          watermark: payload.watermark,
          viewer: {
            name: payload.reviewer.displayName,
            email: payload.reviewer.email,
            ip: payload.viewerIp ?? null,
          },
        }
      : null;

  const tiles = payload.assets.map((sharedAsset) => (
    <SharedAssetTile
      key={`${sharedAsset.asset.id}:${sharedAsset.versionId}`}
      sharedAsset={sharedAsset}
      comments={(grouped.get(sharedAsset.asset.id) ?? []).filter(
        (comment) => comment.versionId === sharedAsset.versionId,
      )}
      allowDownload={payload.policy.allowDownload}
      showMetadata={payload.policy.showMetadata}
      token={token}
      allowComments={payload.policy.allowComments}
      hasIdentity={Boolean(payload.reviewer)}
      hasPasscode={payload.policy.hasPasscode}
      allowApproval={payload.policy.allowApproval}
      deepLink={deepLink}
      layout={layout}
      overlay={overlay}
      featuredField={payload.featuredField ?? null}
      featuredValue={payload.featuredValues?.[sharedAsset.asset.id]}
    />
  ));
  const labels = payload.assets.map(({ asset }) => asset.title ?? asset.fileName);
  const themeStyle = {
    ...(branding.accent ? { '--primary': branding.accent } : {}),
    ...(branding.background ? { '--background': branding.background } : {}),
  } as CSSProperties;
  const theme = branding.theme && branding.theme !== 'system' ? branding.theme : undefined;

  return (
    <div
      data-theme={theme}
      style={themeStyle}
      className="min-h-screen bg-background text-foreground"
    >
      <ShareOpenBeacon token={token} />
      <main
        data-share-layout={layout}
        className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10"
      >
        <header className="flex flex-col gap-3 border-b border-border pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {payload.logoUrl ? (
                // Signed storage URL, cross-origin and short-lived; next/image adds nothing.
                <img
                  src={payload.logoUrl}
                  alt={payload.brandName ?? 'Brand logo'}
                  data-share-logo
                  className="h-9 w-auto max-w-32 object-contain"
                />
              ) : null}
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-foreground">{heading}</h1>
                {payload.brandName ? (
                  <p className="text-xs text-muted-foreground">{payload.brandName}</p>
                ) : null}
              </div>
            </div>
            {payload.policy.allowDownload && payload.assets.length > 1 ? (
              <a href={`/share/${token}/download-all`} data-share-download-all className={DOWNLOAD_ALL_CLASS}>
                <Download className="size-3.5" aria-hidden />
                Download all
              </a>
            ) : null}
          </div>
          {branding.description ? (
            <p className="max-w-3xl text-sm whitespace-pre-line text-muted-foreground">
              {branding.description}
            </p>
          ) : null}
        </header>
        <LayoutBody layout={layout} tiles={tiles} labels={labels} />
        {payload.assets.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nothing here yet — the shared collection is empty.
          </p>
        ) : null}
        <p className="text-center text-2xs text-muted-foreground">Shared via Continuum</p>
      </main>
    </div>
  );
}
