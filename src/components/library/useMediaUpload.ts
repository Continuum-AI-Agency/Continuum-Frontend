'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { uploadCompanionPreview } from '@/lib/library/assetPreview';
import { partitionSidecarUploads } from '@/lib/library/sidecarUploads';
import {
  type UploadMediaAssetResult,
  type UploadResumeState,
  uploadMediaAsset,
  uploadSizeRefusal,
} from '@/lib/library/uploadMediaAsset';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export const MAX_CONCURRENCY = 3;
export const NETWORK_WAIT_MESSAGE = 'Waiting for network…';
const DONE_LINGER_MS = 2500;

export type UploadStatus = 'queued' | 'uploading' | 'paused' | 'done' | 'error';
export type UploadMoveDirection = 'up' | 'down' | 'top';

export type UploadItem = {
  id: string;
  name: string;
  sizeBytes: number;
  progress: number;
  status: UploadStatus;
  error?: string;
  // Who paused it: only network pauses resume by themselves when the browser
  // comes back online — a file the user paused stays paused.
  pausedBy?: 'user' | 'network';
  // A sidecar preview waits for its source asset to exist before it can attach.
  afterId?: string;
  // Refused before any byte moved (a cap, a font): named in the strip, never retried.
  refused?: boolean;
};

type UploadJob = {
  file: File;
  resume: UploadResumeState | null;
  controller: AbortController | null;
  cancelled: boolean;
};

// ---- Pure queue transitions: the order of `items` IS the queue order. --------

/** Ids to start now: the FIRST queued items in the current order, up to the free slots. */
export function pickNextUploads(
  items: readonly UploadItem[],
  maxConcurrency: number,
  isReady: (item: UploadItem) => boolean = () => true,
): string[] {
  let free = maxConcurrency - items.filter((item) => item.status === 'uploading').length;
  const picked: string[] = [];
  for (const item of items) {
    if (free <= 0) break;
    if (item.status === 'queued' && isReady(item)) {
      picked.push(item.id);
      free -= 1;
    }
  }
  return picked;
}

export function moveUploadItem(
  items: readonly UploadItem[],
  id: string,
  direction: UploadMoveDirection,
): UploadItem[] {
  const from = items.findIndex((item) => item.id === id);
  const to = direction === 'top' ? 0 : direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= items.length || to === from) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Back into the queue at its current position (resume after pause, or retry after error). */
export function requeueUpload(items: readonly UploadItem[], id: string): UploadItem[] {
  return items.map((item) =>
    item.id === id && !item.refused && (item.status === 'paused' || item.status === 'error')
      ? { ...item, status: 'queued', error: undefined, pausedBy: undefined }
      : item,
  );
}

export function pauseUploadsForNetwork(items: readonly UploadItem[]): UploadItem[] {
  return items.map((item) =>
    item.status === 'uploading'
      ? { ...item, status: 'paused', pausedBy: 'network', error: NETWORK_WAIT_MESSAGE }
      : item,
  );
}

export function resumeNetworkPausedUploads(items: readonly UploadItem[]): UploadItem[] {
  return items.map((item) =>
    item.status === 'paused' && item.pausedBy === 'network'
      ? { ...item, status: 'queued', pausedBy: undefined, error: undefined }
      : item,
  );
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

// Ordered multi-file upload queue. At most MAX_CONCURRENCY files upload at once,
// and a free slot always takes the first queued file in the CURRENT order, so
// reordering changes what starts next. Analysis + library insertion happen
// server-side and surface back through the realtime subscription, so this hook
// only tracks transient per-file progress.
export function useMediaUpload(
  brandId: string,
  options: {
    onUploaded?: (result: { file: File; uploaded: UploadMediaAssetResult }) => void;
  } = {},
) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [online, setOnline] = useState(isOnline);
  const counter = useRef(0);
  const jobs = useRef(new Map<string, UploadJob>());
  // Sources that finished, so a waiting sidecar can attach to their asset.
  const results = useRef(new Map<string, UploadMediaAssetResult>());
  const onUploadedRef = useRef(options.onUploaded);
  onUploadedRef.current = options.onUploaded;

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...next } : u)));
  }, []);

  const finish = useCallback(
    (id: string) => {
      patch(id, { status: 'done', progress: 100, error: undefined });
      jobs.current.delete(id);
      setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== id)), DONE_LINGER_MS);
    },
    [patch],
  );

  const runUpload = useCallback(
    async (id: string, job: UploadJob, controller: AbortController) => {
      try {
        const uploaded = await uploadMediaAsset({
          file: job.file,
          brandId,
          signal: controller.signal,
          resume: job.resume,
          onResumeState: (resume) => {
            job.resume = resume;
          },
          onProgress: ({ percentage }) => patch(id, { progress: percentage }),
        });
        if (job.cancelled) return;
        results.current.set(id, uploaded);
        finish(id);
        onUploadedRef.current?.({ file: job.file, uploaded });
      } catch (err) {
        if (job.cancelled) return;
        const aborted = (err as { name?: string }).name === 'AbortError';
        // A pause or an offline event already set the paused state (and who
        // paused it) before aborting; only an unexplained failure lands here.
        if (aborted) return;
        if (!isOnline()) {
          patch(id, { status: 'paused', pausedBy: 'network', error: NETWORK_WAIT_MESSAGE });
          return;
        }
        patch(id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
      } finally {
        if (job.controller === controller) job.controller = null;
      }
    },
    [brandId, finish, patch],
  );

  const runCompanion = useCallback(
    async (id: string, job: UploadJob, sourceId: string) => {
      const source = results.current.get(sourceId);
      try {
        if (!source?.assetId || !source.versionId)
          throw new Error('Could not attach sidecar preview');
        await uploadCompanionPreview({
          file: job.file,
          brandId,
          assetId: source.assetId,
          assetVersionId: source.versionId,
          client: createSupabaseBrowserClient(),
        });
        if (!job.cancelled) finish(id);
      } catch (err) {
        if (job.cancelled) return;
        patch(id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Could not attach sidecar preview',
        });
      } finally {
        job.controller = null;
      }
    },
    [brandId, finish, patch],
  );

  // The scheduler: whenever the queue changes, fill free slots from the front.
  useEffect(() => {
    if (!online) return;
    const ready = (item: UploadItem) => !item.afterId || results.current.has(item.afterId);
    for (const id of pickNextUploads(uploads, MAX_CONCURRENCY, ready)) {
      const job = jobs.current.get(id);
      // A job with a controller is already running (an effect re-run on the same state).
      if (!job || job.controller || job.cancelled) continue;
      const controller = new AbortController();
      job.controller = controller;
      patch(id, { status: 'uploading', error: undefined, pausedBy: undefined });
      const item = uploads.find((u) => u.id === id);
      if (item?.afterId) void runCompanion(id, job, item.afterId);
      else void runUpload(id, job, controller);
    }
  }, [uploads, online, patch, runCompanion, runUpload]);

  useEffect(() => {
    const goOffline = () => {
      setOnline(false);
      setUploads(pauseUploadsForNetwork);
      for (const job of jobs.current.values()) job.controller?.abort();
    };
    const goOnline = () => {
      setOnline(true);
      setUploads(resumeNetworkPausedUploads);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const uploadFiles = useCallback(async (fileList: FileList | File[] | null) => {
    // Every file is queued — the Library takes any type. One it cannot take (a cap, a font)
    // is still listed, by name, with the reason; nothing is dropped silently.
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const idFor = new Map<File, string>();
    for (const file of files) {
      counter.current += 1;
      idFor.set(file, `up-${counter.current}`);
    }
    const { pairs } = partitionSidecarUploads(files);
    const sourceOf = new Map(pairs.map((pair) => [pair.companion, idFor.get(pair.source)]));

    const added: UploadItem[] = files.map((file) => {
      const id = idFor.get(file) ?? '';
      jobs.current.set(id, { file, resume: null, controller: null, cancelled: false });
      // Refused before any network call: the cap would reject it after the bytes.
      const afterId = sourceOf.get(file);
      const source = files.find((candidate) => idFor.get(candidate) === afterId);
      const refusal =
        uploadSizeRefusal(file) ??
        (source && uploadSizeRefusal(source) ? 'Could not attach sidecar preview' : null);
      return {
        id,
        name: file.name,
        sizeBytes: file.size,
        progress: 0,
        status: refusal ? 'error' : 'queued',
        ...(refusal ? { error: refusal, refused: true } : {}),
        ...(afterId ? { afterId } : {}),
      };
    });
    setUploads((prev) => [...prev, ...added]);
  }, []);

  const pauseUpload = useCallback(
    (id: string) => {
      const job = jobs.current.get(id);
      if (!job?.controller) return;
      patch(id, { status: 'paused', pausedBy: 'user', error: undefined });
      job.controller.abort();
    },
    [patch],
  );

  const resumeUpload = useCallback((id: string) => {
    const job = jobs.current.get(id);
    if (!job || job.controller || job.cancelled) return;
    setUploads((prev) => requeueUpload(prev, id));
  }, []);

  const moveUpload = useCallback((id: string, direction: UploadMoveDirection) => {
    setUploads((prev) => moveUploadItem(prev, id, direction));
  }, []);

  const cancelUpload = useCallback((id: string) => {
    const job = jobs.current.get(id);
    if (job) {
      job.cancelled = true;
      job.controller?.abort();
      jobs.current.delete(id);
    }
    // A sidecar whose source is gone has nothing to attach to.
    setUploads((prev) =>
      prev
        .filter((upload) => upload.id !== id)
        .map((upload) =>
          upload.afterId === id && upload.status === 'queued'
            ? { ...upload, status: 'error', error: 'Could not attach sidecar preview' }
            : upload,
        ),
    );
  }, []);

  return {
    uploads,
    uploadFiles,
    pauseUpload,
    resumeUpload,
    retryUpload: resumeUpload,
    moveUpload,
    cancelUpload,
  };
}
