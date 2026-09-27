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
import { buildShareDeepLinkHref, commentDeepLinkFromAnnotation } from '@continuum/contracts';
import { Download, FileArchive } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { type StaticMark, StaticMarks } from '@/components/library/detail/annotation/StaticMarks';
import { initialsFor } from '@/lib/library/comments';
import { ExternalApprovalControl } from './ExternalApprovalControl';
import { ExternalCommentComposer } from './ExternalCommentComposer';
import { FeaturedFieldEditor } from './FeaturedFieldEditor';
import {
  authorLabel,
  buildPublicShareThreads,
  type PublicShareThread,
  ShareCommentThreads,
} from './ShareCommentThreads';
import { ShareAssetBeacon, ShareOpenBeacon } from './ShareEventBeacon';
import { ShareMediaFrame } from './ShareMediaFrame';
import { ShareReel } from './ShareReel';
import { type ShareTimeMarker, ShareVideoPlayer } from './ShareVideoPlayer';

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
        shapes: annotation.shapes,
        initials: initialsFor(name),
        title: `${name}: ${body.length > MARKER_TITLE_MAX ? `${body.slice(0, MARKER_TITLE_MAX)}…` : body}`,
      },
    ];
  });
}

// Every spatial annotation on the asset (pins, legacy boxes and freehand, drawn
// marks), for the read-only overlay: drawn with the Library's own ShapeLayer on
// the image's real content rect, numbered in thread order like the Library stage.
function spatialMarksOf(comments: PublicShareComment[]): StaticMark[] {
  return comments.flatMap((comment) =>
    comment.annotation && comment.annotation.kind !== 'time'
      ? [{ id: comment.id, annotation: comment.annotation }]
      : [],
  );
}

// A protected link (downloads off, or watermarked) hides the video's own
// download, fullscreen and picture-in-picture: each would take the media out
// from under the watermark.
function videoGuard(protect: boolean) {
  return protect
    ? { controlsList: 'nodownload nofullscreen noremoteplayback', disablePictureInPicture: true }
    : {};
}

function AssetPreviewMedia({
  asset,
  markers,
  comments,
  deepLink,
  protect,
  commentable = false,
}: {
  protect: boolean;
  asset: MediaAsset;
  markers: ShareTimeMarker[];
  comments: PublicShareComment[];
  deepLink?: CommentDeepLink;
  /** Guests may comment: a video gets the pinning player even before any marker exists. */
  commentable?: boolean;
}) {
  // The custom transport earns its client JS when there is feedback to locate, a
  // deep link to land on, or a guest who may pin feedback of their own.
  const reviewPlayer =
    markers.length > 0 || Boolean(deepLink?.commentId) || deepLink?.timeMs != null || commentable;
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
                {...videoGuard(protect)}
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
        <StaticMarks marks={spatialMarksOf(comments)} />
      </div>
    );
  }
  if (preview?.kind === 'video' && preview.signedUrl) {
    if (reviewPlayer) {
      return (
        <ShareVideoPlayer
          src={preview.signedUrl}
          posterUrl={asset.thumbnailUrl ?? null}
          label={asset.title ?? asset.fileName}
          durationMsHint={preview.durationMs ?? asset.durationMs ?? null}
          markers={markers}
          initialSelectedId={deepLink?.commentId ?? null}
          initialTimeMs={deepLink?.timeMs ?? null}
          protect={protect}
          pinForAssetId={commentable ? asset.id : null}
        />
      );
    }
    return (
      <video
        src={preview.signedUrl}
        controls
        playsInline
        {...videoGuard(protect)}
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
        <StaticMarks marks={spatialMarksOf(comments)} />
      </div>
    );
  }
  if (asset.kind === 'video' && asset.signedUrl) {
    // A video nobody commented on gets the native player, so a plain share stays
    // free of client JS; time-pinned feedback is what earns the custom transport.
    if (!reviewPlayer) {
      return (
        <video
          src={asset.signedUrl}
          controls
          playsInline
          {...videoGuard(protect)}
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
        protect={protect}
        pinForAssetId={commentable ? asset.id : null}
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
  if (!overlay && !media.protect) return <AssetPreviewMedia {...media} />;
  return (
    <ShareMediaFrame
      protect={media.protect}
      watermark={overlay?.watermark ?? null}
      viewer={overlay?.viewer ?? null}
    >
      <AssetPreviewMedia {...media} />
    </ShareMediaFrame>
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
  protect,
  featuredField,
  featuredValue,
}: {
  layout: SharePageLayout;
  protect: boolean;
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
  // Time-pinned threads ride the scrubber (with their marks, drawn on the frame
  // when selected); spatial ones are drawn over the image by StaticMarks.
  const markers = asset.kind === 'video' ? timeMarkersFor(threads) : [];

  const preview = (
    <AssetPreview
      asset={asset}
      markers={markers}
      comments={comments}
      deepLink={deepLink}
      overlay={overlay}
      protect={protect}
      commentable={allowComments}
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
        {allowDownload ? (
          <DownloadButton asset={asset} token={token} versionId={versionId} />
        ) : null}
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
          pinnable={asset.kind === 'video'}
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

// Mirrors SHARE_PAGE_SIZE in loadSharePayload (server-only, so not importable here).
const SHARE_DEFAULT_PAGE_SIZE = 60;
const PAGER_LINK_CLASS =
  'rounded-md border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted';

const DOWNLOAD_ALL_CLASS =
  'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90';

// A single asset gets the player view: the media full width, details beneath.
type SharePageLayout = ShareLinkLayout | 'player';

function LayoutBody({
  layout,
  tiles,
  labels,
}: {
  layout: SharePageLayout;
  tiles: ReactNode[];
  labels: string[];
}) {
  if (layout === 'reel') return <ShareReel slides={tiles} labels={labels} />;
  if (layout === 'list' || layout === 'player') {
    return <div className="flex flex-col gap-6">{tiles}</div>;
  }
  return <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{tiles}</div>;
}

function SharePager({
  token,
  pagination,
}: {
  token: string;
  pagination: NonNullable<PublicSharePayload['pagination']>;
}) {
  const { page, pageSize, total } = pagination;
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const href = (target: number) => {
    const query = new URLSearchParams({ page: String(target) });
    if (pageSize !== SHARE_DEFAULT_PAGE_SIZE) query.set('per', String(pageSize));
    return `/share/${token}?${query}`;
  };
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Pages"
      data-share-pager
      className="flex items-center justify-between gap-3 text-xs"
    >
      {page > 1 ? (
        <a href={href(page - 1)} rel="prev" className={PAGER_LINK_CLASS}>
          Previous
        </a>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground" data-share-page={page}>
        {first}–{last} of {total}
      </span>
      {page < pages ? (
        <a href={href(page + 1)} rel="next" className={PAGER_LINK_CLASS}>
          Next
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
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
  const layout: SharePageLayout =
    payload.assets.length === 1 && (payload.pagination?.total ?? 1) === 1
      ? 'player'
      : (payload.layout ?? 'grid');
  const protect = !payload.policy.allowDownload || Boolean(payload.watermark);
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
      protect={protect}
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
            {payload.policy.allowDownload &&
            (payload.pagination?.total ?? payload.assets.length) > 1 ? (
              <a
                href={`/share/${token}/download-all`}
                data-share-download-all
                className={DOWNLOAD_ALL_CLASS}
              >
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
        {payload.pagination ? <SharePager token={token} pagination={payload.pagination} /> : null}
        {branding.hideFooter ? null : (
          <p data-share-footer className="text-center text-2xs text-muted-foreground">
            Shared via Continuum
          </p>
        )}
      </main>
    </div>
  );
}
