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
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
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
  const translateUi = useUiTranslations('library');

  const currentUiLocale = useUiLocale();

  const actions = [
    {
      run: onCompare,
      label: translateUi('compare_v_value0_with_current_7a401dd5', {
        value0: String(version.versionNumber),
      }),
      icon: Columns2,
      testId: undefined,
    },
    {
      run: onRollback,
      label: translateUi('roll_back_to_v_value0_a58a151e', {
        value0: String(version.versionNumber),
      }),
      icon: RotateCcw,
      testId: undefined,
    },
    // The strip runs newest first, so "up" the stack (toward current) is leftward.
    {
      run: onMoveUp,
      label: translateUi('move_v_value0_up_the_stack_0b1ee383', {
        value0: String(version.versionNumber),
      }),
      icon: ChevronLeft,
      testId: 'version-move-up',
    },
    {
      run: onMoveDown,
      label: translateUi('move_v_value0_down_the_stack_a29cbc24', {
        value0: String(version.versionNumber),
      }),
      icon: ChevronRight,
      testId: 'version-move-down',
    },
    {
      run: onUnstack,
      label: translateUi('unstack_v_value0_into_its_own_asset_18440fa8', {
        value0: String(version.versionNumber),
      }),
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
          aria-label={translateUi('view_v_value0_20c03123', {
            value0: String(version.versionNumber),
          })}
          className="block w-full rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <VersionPreview version={version} className="h-20 w-full" />
        </button>
      ) : (
        <VersionPreview version={version} className="h-20 w-full" />
      )}
      <div className="flex items-center gap-1">
        <Pill variant={version.isHead ? 'default' : 'secondary'}>v{version.versionNumber}</Pill>
        {version.isHead ? (
          <span className="text-2xs text-muted-foreground">{translateUi('current_e0d1b682')}</span>
        ) : null}
        {version.commentCount > 0 ? (
          <span
            className="ml-auto flex items-center gap-0.5 text-2xs tabular-nums text-muted-foreground"
            title={translateUi('value0_comment_value1_on_v_value2_ef2f8bb8', {
              count: Number(version.commentCount),
              version: String(version.versionNumber),
            })}
          >
            <MessageSquare className="size-3" />
            {version.commentCount}
          </span>
        ) : null}
      </div>
      <p className="truncate text-2xs text-muted-foreground">
        {formatRelativeTime(version.createdAt, undefined, currentUiLocale)}
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
  const translateUi = useUiTranslations('library');

  const [uploading, setUploading] = useState(false);
  const [uploadPaused, setUploadPaused] = useState(false);
  const [pausedByNetwork, setPausedByNetwork] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const resumeStateRef = useRef<VersionUploadResumeState | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<MediaAssetVersion | null>(null);
  const [restacking, setRestacking] = useState(false);
  const [unstackTarget, setUnstackTarget] = useState<MediaAssetVersion | null>(null);
  const [comparePair, setComparePair] = useState<{
    a: string;
    b: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runUpload = async (file: File, resume: VersionUploadResumeState | null) => {
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setUploadFile(file);
    setUploadPaused(false);
    setPausedByNetwork(false);
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
      toast.success(
        translateUi('version_v_value0_uploaded_0df099f8', {
          value0: String(result.versionNumber),
        }),
      );
      onChanged?.();
      setUploadFile(null);
      resumeStateRef.current = null;
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        setUploadPaused(true);
      } else if (!navigator.onLine) {
        // A dropped connection is a pause, not a failure: the upload resumes from Storage's
        // committed offset when the browser is back online.
        setUploadPaused(true);
        setPausedByNetwork(true);
      } else {
        toast.error(
          translateUi('version_upload_failed_value0_56ebea1f', {
            value0: String((err as Error).message),
          }),
        );
      }
    } finally {
      setUploading(false);
      uploadControllerRef.current = null;
    }
  };

  useEffect(() => {
    if (!pausedByNetwork || !uploadFile) return;
    const resume = () => void runUpload(uploadFile, resumeStateRef.current);
    window.addEventListener('online', resume, { once: true });
    return () => window.removeEventListener('online', resume);
  }, [pausedByNetwork, uploadFile, runUpload]);

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
      toast.success(
        translateUi('rolled_back_to_v_value0_now_v_value_619968ab', {
          value0: String(target.versionNumber),
          value1: String(result.versionNumber),
        }),
      );
      onChanged?.();
    } catch (err) {
      toast.error(
        translateUi('rollback_failed_value0_99542779', {
          value0: String((err as Error).message),
        }),
      );
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
      toast.success(
        translateUi('unstacked_v_value0_into_a_new_asset_480e7e08', {
          value0: String(target.versionNumber),
        }),
      );
      onRetry();
      onChanged?.();
    } catch (err) {
      toast.error(
        translateUi('unstack_failed_value0_06e02efb', {
          value0: String((err as Error).message),
        }),
      );
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
      toast.error(
        translateUi('reorder_failed_value0_d77fff2a', {
          value0: String((err as Error).message),
        }),
      );
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
          {' '}
          {translateUi('versions_f89ea270')}
          {versions && versions.length > 0 ? ` · ${versions.length}` : ''}
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
              <Columns2 className="size-3" /> {translateUi('compare_versions_9e053092')}{' '}
            </Button>
          ) : null}
          {uploading ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              data-testid="version-upload-pause"
              onClick={() => uploadControllerRef.current?.abort()}
            >
              <Pause className="size-3" /> {translateUi('pause_858e4ba7')} {uploadProgress}%
            </Button>
          ) : uploadPaused && uploadFile ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              data-testid="version-upload-resume"
              data-paused-by={pausedByNetwork ? 'network' : 'user'}
              onClick={() => void runUpload(uploadFile, resumeStateRef.current)}
            >
              <Play className="size-3" /> {translateUi('resume_d640c742')} {uploadProgress}%
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
            {asset.kind === 'file'
              ? translateUi('upload_new_version_20938652')
              : translateUi('new_version_7246e01b')}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          data-testid="version-upload-input"
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
                {' '}
                {translateUi('retry_942087cc')}{' '}
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
              {' '}
              {translateUi('no_version_history_yet_upload_a_new_0e753835')}{' '}
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
              {' '}
              {translateUi('roll_back_to_v_a848c873')}
              {rollbackTarget?.versionNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {' '}
              {translateUi('the_current_file_stays_in_history_v_ea4e6011')}
              {rollbackTarget?.versionNumber}
              {translateUi('s_file_becomes_the_new_current_vers_37223b0a')}{' '}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi('cancel_19766ed6')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRollbackConfirmed()}>
              {' '}
              {translateUi('roll_back_931f703d')}{' '}
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
              {' '}
              {translateUi('unstack_v_09314288')}
              {unstackTarget?.versionNumber} {translateUi('into_its_own_asset_c6ec149f')}{' '}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              v{unstackTarget?.versionNumber}{' '}
              {translateUi('leaves_this_stack_and_appears_in_th_393d62db')}{' '}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi('cancel_19766ed6')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleUnstackConfirmed()}>
              {' '}
              {translateUi('unstack_c59c101f')}{' '}
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
