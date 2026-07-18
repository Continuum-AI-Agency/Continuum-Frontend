'use client';

// Version history rail for the asset detail modal: horizontal strip of version
// cards (thumbnail, vN badge, comment count, author, relative time), "New
// version" upload (sign → direct-to-storage PUT → register), rollback with
// confirm, and a side-by-side compare dialog. Clicking a card puts that
// version's bytes on the stage — a read-only look, deliberately distinct from
// rollback, which is still an explicit confirmed write that moves the head.
//
// The versions list itself lives in the modal (see useAssetVersions): the stage
// and the comment partition need it too, so the rail no longer owns the fetch.

import type { MediaAsset, MediaAssetVersion } from '@continuum/contracts';
import { LIBRARY_ACCEPT_ATTRIBUTE } from '@continuum/contracts';
import {
  Columns2,
  FileIcon,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Pill } from '@/components/kibo-ui/pill';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  rollbackAssetVersion,
  uploadNewAssetVersion,
  type VersionUploadResumeState,
} from '@/lib/library/versions';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';

export type VersionRailProps = {
  brandId: string;
  asset: MediaAsset;
  /** null while the first fetch is in flight. */
  versions: MediaAssetVersion[] | null;
  loadError: string | null;
  onRetry: () => void;
  /** The version whose bytes are on the stage. */
  viewedVersionId: string | null;
  onView: (versionId: string) => void;
  /** versionId → comment count, so an older conversation stays discoverable. */
  commentCounts: ReadonlyMap<string, number>;
  /** Upload and rollback answer with the fresh list; hand it back to the owner. */
  onVersionsChanged: (versions: MediaAssetVersion[]) => void;
  onChanged?: () => void;
};

// Display-only slice of a version card. The head asset of a never-versioned
// asset is rendered through the same shape as an implicit v1.
type VersionDisplay = {
  key: string;
  /** null for the implicit v1 of an asset with no history rows — nothing to view or roll back to. */
  versionId: string | null;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  signedUrl: string | null;
  authorName: string | null;
  note: string | null;
  createdAt: string;
  isHead: boolean;
  commentCount: number;
};

function toDisplay(version: MediaAssetVersion, commentCount: number): VersionDisplay {
  return {
    key: version.id,
    versionId: version.id,
    versionNumber: version.versionNumber,
    fileName: version.fileName,
    mimeType: version.mimeType,
    signedUrl: version.signedUrl ?? null,
    authorName: version.authorName ?? null,
    note: version.note ?? null,
    createdAt: version.createdAt,
    isHead: version.isHead,
    commentCount,
  };
}

function implicitHeadFromAsset(asset: MediaAsset): VersionDisplay {
  return {
    key: `head-${asset.id}`,
    versionId: null,
    versionNumber: 1,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    signedUrl: asset.signedUrl ?? null,
    authorName: null,
    note: null,
    createdAt: asset.createdAt,
    isHead: true,
    // No history means no other version to hold a conversation, so the count
    // would only ever restate what the sidebar beside it already shows.
    commentCount: 0,
  };
}

function VersionPreview({
  version,
  className,
}: {
  version: Pick<VersionDisplay, 'mimeType' | 'signedUrl' | 'fileName'>;
  className?: string;
}) {
  const base = cn('flex items-center justify-center overflow-hidden rounded bg-muted', className);
  if (version.signedUrl && version.mimeType.startsWith('image/')) {
    return (
      <div className={base}>
        <img
          src={version.signedUrl}
          alt={version.fileName}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  if (version.signedUrl && version.mimeType.startsWith('video/')) {
    return (
      <div className={base}>
        {/* biome-ignore lint/a11y/useMediaCaption: silent thumbnail preview of the user's own upload; no caption track exists */}
        <video
          src={version.signedUrl}
          muted
          preload="metadata"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className={base}>
      <FileIcon className="size-5 text-muted-foreground" />
    </div>
  );
}

function VersionCard({
  version,
  viewing,
  onView,
  onCompare,
  onRollback,
}: {
  version: VersionDisplay;
  viewing: boolean;
  onView?: () => void;
  onCompare?: () => void;
  onRollback?: () => void;
}) {
  return (
    <div
      className={cn(
        'w-36 shrink-0 space-y-1 rounded-md border bg-card p-1.5 transition-colors',
        viewing ? 'border-primary ring-1 ring-primary/40' : 'border-border',
      )}
      title={version.note ?? undefined}
    >
      {onView ? (
        <button
          type="button"
          onClick={onView}
          aria-pressed={viewing}
          aria-label={`View v${version.versionNumber}`}
          className="block w-full rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <VersionPreview version={version} className="h-20 w-full" />
        </button>
      ) : (
        <VersionPreview version={version} className="h-20 w-full" />
      )}
      <div className="flex items-center gap-1">
        <Pill variant={version.isHead ? 'default' : 'secondary'}>v{version.versionNumber}</Pill>
        {version.isHead ? <span className="text-2xs text-muted-foreground">Current</span> : null}
        {version.commentCount > 0 ? (
          <span
            className="ml-auto flex items-center gap-0.5 text-2xs tabular-nums text-muted-foreground"
            title={`${version.commentCount} comment${version.commentCount === 1 ? '' : 's'} on v${version.versionNumber}`}
          >
            <MessageSquare className="size-3" />
            {version.commentCount}
          </span>
        ) : null}
      </div>
      <p className="truncate text-2xs text-muted-foreground">
        {formatRelativeTime(version.createdAt)}
        {version.authorName ? ` · ${version.authorName}` : ''}
      </p>
      {!version.isHead && (onCompare || onRollback) ? (
        <div className="flex items-center gap-0.5">
          {onCompare ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground"
              aria-label={`Compare v${version.versionNumber} with current`}
              onClick={onCompare}
            >
              <Columns2 className="size-3.5" />
            </Button>
          ) : null}
          {onRollback ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground"
              aria-label={`Roll back to v${version.versionNumber}`}
              onClick={onRollback}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function VersionRail({
  brandId,
  asset,
  versions,
  loadError,
  onRetry,
  viewedVersionId,
  onView,
  commentCounts,
  onVersionsChanged,
  onChanged,
}: VersionRailProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadPaused, setUploadPaused] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const resumeStateRef = useRef<VersionUploadResumeState | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<MediaAssetVersion | null>(null);
  const [compareTarget, setCompareTarget] = useState<MediaAssetVersion | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runUpload = async (file: File, resume: VersionUploadResumeState | null) => {
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setUploadFile(file);
    setUploadPaused(false);
    setUploading(true);
    try {
      const result = await uploadNewAssetVersion({
        brandId,
        assetId: asset.id,
        file,
        resume,
        signal: controller.signal,
        onResumeState: (state) => {
          resumeStateRef.current = state;
        },
        onProgress: ({ percentage }) => setUploadProgress(percentage),
      });
      onVersionsChanged(result.versions);
      toast.success(`Version v${result.versionNumber} uploaded`);
      onChanged?.();
      setUploadFile(null);
      resumeStateRef.current = null;
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        setUploadPaused(true);
      } else {
        toast.error(`Version upload failed · ${(err as Error).message}`);
      }
    } finally {
      setUploading(false);
      uploadControllerRef.current = null;
    }
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    resumeStateRef.current = null;
    setUploadProgress(0);
    await runUpload(file, null);
  };

  const handleRollbackConfirmed = async () => {
    const target = rollbackTarget;
    setRollbackTarget(null);
    if (!target) return;
    setRollingBack(true);
    try {
      const result = await rollbackAssetVersion({
        brandId,
        assetId: asset.id,
        versionId: target.id,
      });
      onVersionsChanged(result.versions);
      toast.success(`Rolled back to v${target.versionNumber} (now v${result.versionNumber})`);
      onChanged?.();
    } catch (err) {
      toast.error(`Rollback failed · ${(err as Error).message}`);
    } finally {
      setRollingBack(false);
    }
  };

  const loading = versions === null;
  const displayList: VersionDisplay[] =
    versions && versions.length > 0
      ? versions.map((version) => toDisplay(version, commentCounts.get(version.id) ?? 0))
      : [implicitHeadFromAsset(asset)];
  const headDisplay = displayList.find((version) => version.isHead) ?? implicitHeadFromAsset(asset);

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">
          Versions{versions && versions.length > 0 ? ` · ${versions.length}` : ''}
        </h3>
        <div className="flex items-center gap-1">
          {uploading && asset.kind === 'file' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => uploadControllerRef.current?.abort()}
            >
              <Pause className="size-3" />
              Pause {uploadProgress}%
            </Button>
          ) : uploadPaused && uploadFile && asset.kind === 'file' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => void runUpload(uploadFile, resumeStateRef.current)}
            >
              <Play className="size-3" />
              Resume {uploadProgress}%
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={uploading || rollingBack}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            {asset.kind === 'file' ? 'Upload new version' : 'New version'}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={asset.kind === 'file' ? LIBRARY_ACCEPT_ATTRIBUTE : `${asset.kind}/*`}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => void handleFileSelected(event.target.files?.[0] ?? null)}
        />
      </div>

      {loading ? (
        <div className="flex gap-2">
          <Skeleton className="h-36 w-36 shrink-0 rounded-md" />
          <Skeleton className="h-36 w-36 shrink-0 rounded-md" />
        </div>
      ) : (
        <>
          {loadError ? (
            <p className="text-2xs text-destructive">
              {loadError}{' '}
              <button type="button" className="underline" onClick={onRetry}>
                Retry
              </button>
            </p>
          ) : null}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {displayList.map((display) => {
              const source = versions?.find((version) => version.id === display.key) ?? null;
              const versionId = display.versionId;
              return (
                <VersionCard
                  key={display.key}
                  version={display}
                  viewing={versionId !== null && versionId === viewedVersionId}
                  onView={versionId ? () => onView(versionId) : undefined}
                  onCompare={source && !display.isHead ? () => setCompareTarget(source) : undefined}
                  onRollback={
                    source && !display.isHead && !rollingBack
                      ? () => setRollbackTarget(source)
                      : undefined
                  }
                />
              );
            })}
          </div>
          {versions && versions.length === 0 ? (
            <p className="text-2xs text-muted-foreground">
              No version history yet — upload a new version to start it.
            </p>
          ) : null}
        </>
      )}

      <AlertDialog
        open={rollbackTarget !== null}
        onOpenChange={(open) => (!open ? setRollbackTarget(null) : undefined)}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Roll back to v{rollbackTarget?.versionNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              The current file stays in history; v{rollbackTarget?.versionNumber}&apos;s file
              becomes the new current version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRollbackConfirmed()}>
              Roll back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={compareTarget !== null}
        onOpenChange={(open) => (!open ? setCompareTarget(null) : undefined)}
      >
        <DialogContent className="max-w-3xl">
          <DialogTitle className="text-sm">
            Compare v{compareTarget?.versionNumber} with current
          </DialogTitle>
          {compareTarget ? (
            <div className="grid grid-cols-2 gap-3">
              {[toDisplay(compareTarget, 0), headDisplay].map((side) => (
                <figure key={side.key} className="space-y-1.5">
                  <figcaption className="text-xs text-muted-foreground">
                    v{side.versionNumber}
                    {side.isHead ? ' · Current' : ''} · {formatRelativeTime(side.createdAt)}
                  </figcaption>
                  {side.signedUrl && side.mimeType.startsWith('video/') ? (
                    // biome-ignore lint/a11y/useMediaCaption: comparing the user's own uploaded cuts; no caption track exists
                    <video
                      src={side.signedUrl}
                      controls
                      className="max-h-80 w-full rounded bg-muted object-contain"
                    />
                  ) : (
                    <VersionPreview version={side} className="h-64 w-full" />
                  )}
                </figure>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
