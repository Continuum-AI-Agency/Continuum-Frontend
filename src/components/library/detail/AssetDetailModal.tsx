'use client';

// Takeover detail view for a Library asset: preview stage with annotated
// comments on the left, threaded comments sidebar on the right, version rail
// underneath, with slots owned by sibling workstreams: ReviewStatusControl,
// ShareLinkMenu, RequestReviewButton.
//
// The stage shows the version the reviewer picked, not always the head. That one
// fact ripples: only comments written on the viewed version may draw pins (an
// older box addresses an older crop), a new comment pins to the version it was
// written against, and the header's editing actions — which all act on the head
// — are withdrawn while an older version is on screen rather than silently
// operating on a file the reviewer is not looking at.

import type { CommentAnnotation, MediaAsset, MediaComment } from '@continuum/contracts';
import { ChevronLeft, ChevronRight, Layers3 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { buildCommentThreads } from '@/lib/library/comments';
import { enrichOnOpen } from '@/lib/library/enrichment';
import { SOURCE_LABEL } from '@/lib/media/filters';
import { cn } from '@/lib/utils';
import { EditTimelineButton } from '../editor/EditTimelineButton';
import { AssetFieldsPanel } from '../fields/AssetFieldsPanel';
import { fileExtension, formatBytes } from './assetFileMeta';
import { CommentComposer } from './CommentComposer';
import { CommentThreads } from './CommentThreads';
import {
  anchorVersionId,
  countThreadCommentsByVersion,
  partitionThreadsByVersion,
} from './commentVersions';
import { FilePreviewStage } from './FilePreviewStage';
import { ImageAnnotationLayer } from './ImageAnnotationLayer';
import { OlderFileStage } from './OlderFileStage';
import { OpenInCanvasButton } from './OpenInCanvasButton';
import { PerformancePanel } from './PerformancePanel';
import { PosterFramePicker } from './PosterFramePicker';
import { createPlaybackClock } from './playbackClock';
import { QuickLookButton } from './QuickLookButton';
import { RequestReviewButton } from './RequestReviewButton';
import { ReviewStatusControl } from './ReviewStatusControl';
import { ShareLinkMenu } from './ShareLinkMenu';
import { SmartResizeMenu } from './SmartResizeMenu';
import { buildStageAnnotations } from './stageAnnotations';
import { resolveStageMedia } from './stageMedia';
import { TranscriptPanel } from './TranscriptPanel';
import { preferredSidebarTab, type SidebarTab } from './transcriptSegments';
import { useAssetComments } from './useAssetComments';
import { useAssetTranscript } from './useAssetTranscript';
import { useAssetVersions } from './useAssetVersions';
import { useOpportunisticPoster } from './useOpportunisticPoster';
import { VersionRail } from './VersionRail';
import { VideoAnnotationPlayer } from './VideoAnnotationPlayer';
import { VideoInsightsPanel } from './VideoInsightsPanel';
import { ViewingVersionBanner } from './ViewingVersionBanner';

export type AssetDetailModalProps = {
  brandId: string;
  asset: MediaAsset | null;
  onClose: () => void;
  /** Called after a mutation (version upload, review transition) so the grid refreshes. */
  onAssetChanged?: () => void;
};

// Performance and Fields are further sidebar destinations alongside the two the
// transcript module knows about; neither has a say in `preferredSidebarTab`, so
// they widen the tab union here rather than in transcriptSegments.
type DetailSidebarTab = SidebarTab | 'performance' | 'fields' | 'insights';

function assetMetaLine(asset: MediaAsset): string {
  const parts: string[] = [
    asset.kind === 'file' ? (fileExtension(asset.fileName) ?? 'FILE') : asset.kind.toUpperCase(),
    SOURCE_LABEL[asset.source],
  ];
  if (asset.width && asset.height) parts.push(`${asset.width} × ${asset.height}`);
  if (asset.sizeBytes) parts.push(formatBytes(asset.sizeBytes));
  parts.push(
    new Date(asset.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  );
  return parts.join(' · ');
}

function SidebarTabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors',
        active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

export function AssetDetailModal({
  brandId,
  asset,
  onClose,
  onAssetChanged,
}: AssetDetailModalProps) {
  if (!asset) return null;
  // Keyed per asset so comments, selection, drafts, and the viewed version never
  // leak across assets.
  return (
    <AssetDetailDialog
      key={asset.id}
      brandId={brandId}
      asset={asset}
      onClose={onClose}
      onAssetChanged={onAssetChanged}
    />
  );
}

function AssetDetailDialog({
  brandId,
  asset,
  onClose,
  onAssetChanged,
}: AssetDetailModalProps & { asset: MediaAsset }) {
  const {
    comments,
    loading,
    error,
    currentUserId,
    pendingIds,
    postComment,
    setResolved,
    removeComment,
  } = useAssetComments(brandId, asset.id);
  const {
    versions,
    error: versionsError,
    headVersionId,
    refresh: refreshVersions,
    replaceVersions,
  } = useAssetVersions(brandId, asset.id);

  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  // null means the head — the default, and the state a rollback or a fresh
  // upload should land the reviewer back on without any extra bookkeeping.
  const [olderVersionId, setOlderVersionId] = useState<string | null>(null);
  const [carouselSlideIndex, setCarouselSlideIndex] = useState(0);
  const seekRef = useRef<((ms: number) => void) | null>(null);

  const registerSeek = useCallback((seek: (ms: number) => void) => {
    seekRef.current = seek;
  }, []);

  const seekTo = useCallback((ms: number) => {
    seekRef.current?.(ms);
  }, []);

  // Resolved against the fetched list, so a stale id (or one that never arrives)
  // degrades to the head rather than to a blank stage.
  const viewedVersion = useMemo(
    () => (olderVersionId ? (versions?.find((v) => v.id === olderVersionId) ?? null) : null),
    [olderVersionId, versions],
  );
  const viewingHead = viewedVersion === null;
  // The single id that decides what is "current": which comments show, which pins
  // may draw, and where a new comment pins.
  const viewedVersionId = viewedVersion?.id ?? headVersionId;
  const headVersion = versions?.find((v) => v.isHead) ?? null;
  const headVersionNumber = headVersion?.versionNumber ?? null;

  const stage = useMemo(() => {
    const base = resolveStageMedia({ asset, viewedVersion, headVersion });
    if (!viewingHead || !asset.carousel || asset.carousel.slides.length < 2) return base;
    const slide = asset.carousel.slides[carouselSlideIndex] ?? asset.carousel.slides[0];
    if (!slide?.signedUrl) return base;
    return {
      kind: slide.kind,
      src: slide.signedUrl,
      durationMs: null,
      label: `${asset.title ?? asset.fileName} · slide ${carouselSlideIndex + 1}`,
      key: `carousel-${asset.groupId ?? asset.id}-${slide.assetId ?? slide.slideIndex}`,
    };
  }, [asset, viewedVersion, headVersion, viewingHead, carouselSlideIndex]);

  const isVideo = stage.kind === 'video';
  // The playhead is published into a clock rather than into React state: only the
  // transcript panel follows it, and it coalesces its own re-renders.
  const [clock] = useState(createPlaybackClock);
  // The transcript belongs to the head's audio. Against an older cut its
  // timecodes point at the wrong frames, so it is only offered on the head.
  const transcriptEnabled = asset.kind === 'video' && viewingHead;
  const transcript = useAssetTranscript(brandId, asset.id, transcriptEnabled);

  // Opening an asset is what pays for its intelligence. A library that predates
  // the analysis pipeline is full of assets with no tags, no description and no
  // embedding; rather than bill for a blanket backfill, the cost follows the
  // attention — so the library heals exactly where people are looking. The call
  // is fire-and-forget and a no-op for anything already analysed.
  useEffect(() => {
    enrichOnOpen(brandId, asset.id);
  }, [brandId, asset.id]);
  // Heal a blank video card the same way — an AI-generated or legacy video that
  // never got a poster gets one decoded now that its bytes are loaded for
  // playback. Fire-and-forget, once per asset per session, video-only.
  useOpportunisticPoster(brandId, asset, onAssetChanged);
  const [sidebarTab, setSidebarTab] = useState<DetailSidebarTab>('comments');
  const autoSelectedTab = useRef(false);

  const threads = useMemo(() => buildCommentThreads(comments), [comments]);
  const partition = useMemo(
    () => partitionThreadsByVersion({ threads, viewedVersionId, headVersionId }),
    [threads, viewedVersionId, headVersionId],
  );
  const commentCounts = useMemo(
    () => countThreadCommentsByVersion({ threads, headVersionId }),
    [threads, headVersionId],
  );
  const versionLabels = useMemo(
    () => new Map((versions ?? []).map((v) => [v.id, `v${v.versionNumber}`] as const)),
    [versions],
  );

  const openCount = partition.current.open.length;

  // A viewer's click wins immediately. The guard must be set HERE, not only
  // inside the effect below: the effect waits for BOTH loads to settle, so a
  // click landing before then was silently reverted when it finally ran.
  const chooseTab = useCallback((tab: DetailSidebarTab) => {
    autoSelectedTab.current = true;
    setSidebarTab(tab);
  }, []);

  // Choose the opening tab ONCE, when both sides have loaded — never fight a
  // viewer who has already picked one.
  useEffect(() => {
    if (!isVideo || autoSelectedTab.current || loading || transcript.loading) return;
    autoSelectedTab.current = true;
    setSidebarTab(
      preferredSidebarTab({
        hasTranscript: transcript.view.status === 'ready',
        openCommentCount: openCount,
      }),
    );
  }, [isVideo, loading, transcript.loading, transcript.view.status, openCount]);

  // Stage annotations come from the OPEN threads of the VIEWED version only.
  // Resolving a thread retires its pin (Figma-style); belonging to another
  // version retires it too, because its geometry addresses other bytes.
  const { imagePins, videoMarkers, pinLabels } = useMemo(
    () => buildStageAnnotations({ openThreads: partition.current.open, selectedCommentId }),
    [partition.current.open, selectedCommentId],
  );

  const post = useCallback(
    async (input: { body: string; annotation?: CommentAnnotation; parentCommentId?: string }) => {
      setPosting(true);
      const created = await postComment({
        ...input,
        versionId: viewedVersionId ?? undefined,
      });
      setPosting(false);
      if (created) setSelectedCommentId(created.parentCommentId ?? created.id);
    },
    [postComment, viewedVersionId],
  );

  const onSelectThread = useCallback(
    (root: MediaComment) => {
      setSelectedCommentId(root.id);
      // Only a thread written on the version on screen may move the playhead: an
      // older timeMs lands on the wrong frame of a different cut.
      const onViewedVersion = anchorVersionId(root, headVersionId) === viewedVersionId;
      if (onViewedVersion && root.annotation?.kind === 'time') seekTo(root.annotation.timeMs);
    },
    [seekTo, headVersionId, viewedVersionId],
  );

  const viewVersion = useCallback(
    (versionId: string) => {
      // The head is the null state, so the rail's "Current" card is also the way
      // back and a rollback cannot strand the reviewer on a superseded id.
      setOlderVersionId(versionId === headVersionId ? null : versionId);
      setSelectedCommentId(null);
    },
    [headVersionId],
  );

  const backToLatest = useCallback(() => {
    setOlderVersionId(null);
    setSelectedCommentId(null);
  }, []);

  return (
    // Non-modal on purpose: the grid stays legible, scrollable and clickable
    // beside the panel, and clicking another creative swaps what is docked here
    // rather than closing it. Escape and the close button are the ways out.
    <Dialog
      open
      modal={false}
      onOpenChange={(open, details) => {
        // Clicking another creative swaps what is docked here rather than closing the panel.
        // Radix expressed this as onInteractOutside+preventDefault on the content; Base UI
        // reports the reason on the open-change instead.
        if (!open && details?.reason === 'outside-press') return;
        if (!open) onClose();
      }}
    >
      <DialogContent
        showOverlay={false}
        className="fixed inset-4 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0 shadow-2xl sm:max-w-none"
      >
        <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 pr-14">
          <div className="min-w-0">
            <DialogTitle className="truncate text-sm font-medium">
              {asset.title ?? asset.fileName}
            </DialogTitle>
            <DialogDescription className="truncate text-xs text-muted-foreground">
              {assetMetaLine(asset)}
            </DialogDescription>
          </div>
          {/* The header carries only the DELIBERATE workflow verdicts — what this
              creative's status is, who should look at it, who may see it. Actions
              that reshape the creative itself are docked onto the creative, below. */}
          <div className="ml-auto flex items-center gap-2">
            <ReviewStatusControl brandId={brandId} asset={asset} onChanged={onAssetChanged} />
            <RequestReviewButton brandId={brandId} asset={asset} />
            <ShareLinkMenu brandId={brandId} asset={asset} />
          </div>
        </header>

        {viewedVersion ? (
          <ViewingVersionBanner
            versionNumber={viewedVersion.versionNumber}
            headVersionNumber={headVersionNumber}
            onBackToLatest={backToLatest}
          />
        ) : null}

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 bg-muted/30">
              {/* Keyed on the bytes: switching version must not carry a playhead
                  or a half-drawn annotation from one cut onto another. */}
              {stage.kind === 'image' ? (
                <ImageAnnotationLayer
                  key={stage.key}
                  src={stage.src}
                  alt={stage.label}
                  pins={imagePins}
                  onSelectPin={setSelectedCommentId}
                  posting={posting}
                  onPostAnnotated={(body, annotation) => void post({ body, annotation })}
                />
              ) : stage.kind === 'video' ? (
                <VideoAnnotationPlayer
                  key={stage.key}
                  src={stage.src}
                  durationMsHint={stage.durationMs}
                  markers={videoMarkers}
                  onSelectMarker={setSelectedCommentId}
                  posting={posting}
                  onPostAtTime={({ body, timeMs, endMs, box }) =>
                    void post({
                      body,
                      annotation: {
                        kind: 'time',
                        timeMs,
                        ...(endMs === null ? {} : { endMs }),
                        box,
                      },
                    })
                  }
                  registerSeek={registerSeek}
                  onTimeChange={clock.publish}
                />
              ) : viewedVersion ? (
                // FilePreviewStage signs its download by assetId, which always
                // mints the HEAD bytes — it cannot represent an older file.
                <OlderFileStage version={viewedVersion} />
              ) : (
                <FilePreviewStage
                  brandId={brandId}
                  asset={asset}
                  onPreviewChanged={onAssetChanged}
                />
              )}

              {viewingHead && asset.carousel && asset.carousel.slides.length > 1 ? (
                <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/90 p-1 shadow-sm backdrop-blur">
                  <button
                    type="button"
                    aria-label="Previous carousel slide"
                    className="flex size-7 items-center justify-center rounded-full hover:bg-muted"
                    onClick={() =>
                      setCarouselSlideIndex(
                        (index) =>
                          (index - 1 + asset.carousel!.slides.length) %
                          asset.carousel!.slides.length,
                      )
                    }
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="flex min-w-16 items-center justify-center gap-1 text-xs tabular-nums text-muted-foreground">
                    <Layers3 className="size-3.5" />
                    {carouselSlideIndex + 1}/{asset.carousel.slides.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Next carousel slide"
                    className="flex size-7 items-center justify-center rounded-full hover:bg-muted"
                    onClick={() =>
                      setCarouselSlideIndex((index) => (index + 1) % asset.carousel!.slides.length)
                    }
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              ) : null}

              {/* Docked to the creative, not to the dialog chrome: these reshape
                  the image in front of you, so they read as "things I can do to
                  THIS". They all act on the HEAD file — offering them over an
                  older version would be a lie about what they would edit, so they
                  are withdrawn and the banner says why. */}
              {viewingHead ? (
                <div
                  className={cn(
                    'pointer-events-none absolute inset-x-0 flex p-3',
                    stage.kind === 'video' ? 'top-0 justify-end' : 'bottom-0 justify-center',
                  )}
                >
                  <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-background/85 p-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70">
                    <QuickLookButton
                      brandId={brandId}
                      asset={asset}
                      onAssetChanged={onAssetChanged}
                    />
                    <SmartResizeMenu
                      brandId={brandId}
                      asset={asset}
                      onAssetChanged={onAssetChanged}
                    />
                    <OpenInCanvasButton
                      brandId={brandId}
                      asset={asset}
                      onAssetChanged={onAssetChanged}
                    />
                    <EditTimelineButton
                      brandId={brandId}
                      asset={asset}
                      onAssetChanged={onAssetChanged}
                    />
                    {stage.kind === 'video' && stage.src ? (
                      <PosterFramePicker
                        brandId={brandId}
                        asset={asset}
                        src={stage.src}
                        onPosterChanged={onAssetChanged}
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="shrink-0 border-t border-border px-4 py-2">
              <VersionRail
                brandId={brandId}
                asset={asset}
                versions={versions}
                loadError={versionsError}
                onRetry={() => void refreshVersions()}
                viewedVersionId={viewedVersionId}
                onView={viewVersion}
                commentCounts={commentCounts}
                onVersionsChanged={replaceVersions}
                onChanged={onAssetChanged}
              />
            </div>
          </div>

          <aside className="flex w-[360px] shrink-0 flex-col border-l border-border">
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-3 py-2">
              <SidebarTabButton
                active={sidebarTab === 'comments'}
                onClick={() => chooseTab('comments')}
                count={openCount}
              >
                Comments
              </SidebarTabButton>
              {transcriptEnabled && (
                <SidebarTabButton
                  active={sidebarTab === 'transcript'}
                  onClick={() => chooseTab('transcript')}
                  count={
                    transcript.view.status === 'ready' ? transcript.view.segments.length : undefined
                  }
                >
                  Transcript
                </SidebarTabButton>
              )}
              {transcriptEnabled && asset.videoInsights ? (
                <SidebarTabButton
                  active={sidebarTab === 'insights'}
                  onClick={() => chooseTab('insights')}
                >
                  Insights
                </SidebarTabButton>
              ) : null}
              <SidebarTabButton
                active={sidebarTab === 'fields'}
                onClick={() => chooseTab('fields')}
              >
                Fields
              </SidebarTabButton>
              <SidebarTabButton
                active={sidebarTab === 'performance'}
                onClick={() => chooseTab('performance')}
              >
                Performance
              </SidebarTabButton>
            </div>

            {sidebarTab === 'fields' ? (
              <AssetFieldsPanel brandId={brandId} assetId={asset.id} />
            ) : sidebarTab === 'performance' ? (
              <PerformancePanel brandId={brandId} assetId={asset.id} />
            ) : sidebarTab === 'insights' && transcriptEnabled && asset.videoInsights ? (
              <VideoInsightsPanel insights={asset.videoInsights} onSeek={seekTo} />
            ) : sidebarTab === 'transcript' && transcriptEnabled ? (
              <TranscriptPanel
                view={transcript.view}
                loading={transcript.loading}
                error={transcript.error}
                source={transcript.source}
                clock={clock}
                onSeek={seekTo}
              />
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <CommentThreads
                    threads={partition.current}
                    pinLabels={pinLabels}
                    otherVersionThreads={partition.otherVersions}
                    otherVersionCommentCount={partition.otherVersionCommentCount}
                    versionLabels={versionLabels}
                    viewingHead={viewingHead}
                    onViewVersion={viewVersion}
                    selectedId={selectedCommentId}
                    onSelectThread={onSelectThread}
                    currentUserId={currentUserId}
                    pendingIds={pendingIds}
                    posting={posting}
                    loading={loading}
                    onReply={(parentId, body) => void post({ body, parentCommentId: parentId })}
                    onResolve={(commentId, resolved) => void setResolved(commentId, resolved)}
                    onDelete={(commentId) => void removeComment(commentId)}
                  />
                </div>

                <div className="shrink-0 border-t border-border p-3">
                  {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
                  <CommentComposer
                    placeholder={
                      viewedVersion
                        ? `Add a comment on v${viewedVersion.versionNumber}...`
                        : 'Add a comment...'
                    }
                    busy={posting}
                    onSubmit={(body) => void post({ body })}
                  />
                </div>
              </>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
