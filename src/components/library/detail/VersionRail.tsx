'use client';

// Version history rail for the asset detail modal: horizontal strip of version
// cards (thumbnail, vN badge, comment count, author, relative time), "New
// version" upload (sign → direct-to-storage PUT → register), rollback with
// confirm, stack edits (unstack a version into its own asset, move a version up or
// down the stack), and the synced compare dialog (compare/VersionCompareDialog). Clicking
// a card puts that version's bytes on the stage — a read-only look, deliberately
// distinct from rollback, which is still an explicit confirmed write that moves
// the head.
//
// The versions list itself lives in the modal (see useAssetVersions): the stage
// and the comment partition need it too, so the rail no longer owns the fetch.

import type { MediaAsset, MediaAssetVersion } from '@continuum/contracts';
import { LIBRARY_ACCEPT_ATTRIBUTE } from '@continuum/contracts';
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileIcon,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Ungroup,
} from 'lucide-react';
import { useRef, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast-imperative';
import {
  reorderAssetVersionsOperation,
  unstackAssetVersionOperation,
} from '@/lib/library/creativeOperations';
import {
  rollbackAssetVersion,
  uploadNewAssetVersion,
  type VersionUploadResumeState,
} from '@/lib/library/versions';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { VersionCompareDialog } from './compare/VersionCompareDialog';
import { reorderedVersionIds } from './compare/versionOrder';

export type VersionRailProps = {
  brandId: string;
  asset: MediaAsset;
  /** null while the first fetch is in flight. */
  versions: MediaAssetVersion[] | null;
  loadError: string | null;
  /** Re-fetches the list: the load retry, and after unstack/reorder, whose results carry none. */
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
  onMoveUp,
  onMoveDown,
  onUnstack,
}: {
  version: VersionDisplay;
  viewing: boolean;
  onView?: () => void;
  onCompare?: () => void;
  onRollback?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onUnstack?: () => void;
}) {
  const actions = [
    {
      run: onCompare,
      label: `Compare v${version.versionNumber} with current`,
      icon: Columns2,
      testId: undefined,
    },
    {
      run: onRollback,
      label: `Roll back to v${version.versionNumber}`,
      icon: RotateCcw,
      testId: undefined,
    },
    // The strip runs newest first, so "up" the stack (toward current) is leftward.
    {
      run: onMoveUp,
      label: `Move v${version.versionNumber} up the stack`,
      icon: ChevronLeft,
      testId: 'version-move-up',
    },
    {
      run: onMoveDown,
      label: `Move v${version.versionNumber} down the stack`,
      icon: ChevronRight,
      testId: 'version-move-down',
    },
    {
      run: onUnstack,
      label: `Unstack v${version.versionNumber} into its own asset`,
      icon: Ungroup,
      testId: 'version-unstack',
    },
  ].filter((action) => action.run);
  return (
    <div
      data-version-id={version.versionId ?? undefined}
      data-version-number={version.versionNumber}
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
      {actions.length > 0 ? (
        <div className="flex items-center gap-0.5">
          {actions.map(({ run, label, icon: Icon, testId }) => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground"
              aria-label={label}
              title={label}
              data-testid={testId}
              onClick={run}
            >
              <Icon className="size-3.5" />
            </Button>
          ))}
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
  const [restacking, setRestacking] = useState(false);
  const [unstackTarget, setUnstackTarget] = useState<MediaAssetVersion | null>(null);
  const [comparePair, setComparePair] = useState<{ a: string; b: string } | null>(null);
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

  const handleUnstackConfirmed = async () => {
    const target = unstackTarget;
    setUnstackTarget(null);
    if (!target) return;
    setRestacking(true);
    try {
      await unstackAssetVersionOperation(createSupabaseBrowserClient(), {
        brandId,
        assetId: asset.id,
        versionId: target.id,
      });
      toast.success(`Unstacked v${target.versionNumber} into a new asset`);
      onRetry();
      onChanged?.();
    } catch (err) {
      toast.error(`Unstack failed · ${(err as Error).message}`);
    } finally {
      setRestacking(false);
    }
  };

  const moveVersion = async (versionId: string, direction: 'up' | 'down') => {
    const versionIds = versions ? reorderedVersionIds(versions, versionId, direction) : null;
    if (!versionIds) return;
    setRestacking(true);
    try {
      const result = await reorderAssetVersionsOperation(createSupabaseBrowserClient(), {
        brandId,
        assetId: asset.id,
        versionIds,
      });
      onRetry();
      if (result.headChanged) onChanged?.();
    } catch (err) {
      toast.error(`Reorder failed · ${(err as Error).message}`);
    } finally {
      setRestacking(false);
    }
  };

  const loading = versions === null;
  const mutating = rollingBack || restacking;
  const stacked = versions !== null && versions.length > 1;
  const displayList: VersionDisplay[] =
    versions && versions.length > 0
      ? versions.map((version) => toDisplay(version, commentCounts.get(version.id) ?? 0))
      : [implicitHeadFromAsset(asset)];
  const headId = versions?.find((version) => version.isHead)?.id ?? null;

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">
          Versions{versions && versions.length > 0 ? ` · ${versions.length}` : ''}
        </h3>
        <div className="flex items-center gap-1">
          {versions && stacked ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              data-testid="version-compare-open"
              onClick={() => setComparePair({ a: versions[1].id, b: versions[0].id })}
            >
              <Columns2 className="size-3" />
              Compare versions
            </Button>
          ) : null}
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
            disabled={uploading || mutating}
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
            {displayList.map((display, index) => {
              const source = versions?.find((version) => version.id === display.key) ?? null;
              const versionId = display.versionId;
              const restackable = source !== null && stacked && !mutating;
              return (
                <VersionCard
                  key={display.key}
                  version={display}
                  viewing={versionId !== null && versionId === viewedVersionId}
                  onView={versionId ? () => onView(versionId) : undefined}
                  onCompare={
                    source && headId && !display.isHead
                      ? () => setComparePair({ a: source.id, b: headId })
                      : undefined
                  }
                  onRollback={
                    source && !display.isHead && !mutating
                      ? () => setRollbackTarget(source)
                      : undefined
                  }
                  onMoveUp={
                    restackable && index > 0 ? () => void moveVersion(source.id, 'up') : undefined
                  }
                  onMoveDown={
                    restackable && index < displayList.length - 1
                      ? () => void moveVersion(source.id, 'down')
                      : undefined
                  }
                  onUnstack={restackable ? () => setUnstackTarget(source) : undefined}
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

      <AlertDialog
        open={unstackTarget !== null}
        onOpenChange={(open) => (!open ? setUnstackTarget(null) : undefined)}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Unstack v{unstackTarget?.versionNumber} into its own asset?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              v{unstackTarget?.versionNumber} leaves this stack and appears in the library as a
              separate asset. The other versions stay here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleUnstackConfirmed()}>
              Unstack
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {comparePair && versions ? (
        <VersionCompareDialog
          open
          onOpenChange={(open) => (!open ? setComparePair(null) : undefined)}
          asset={asset}
          versions={versions}
          initialAId={comparePair.a}
          initialBId={comparePair.b}
        />
      ) : null}
    </section>
  );
}
