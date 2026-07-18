'use client';

import { useCallback, useRef, useState } from 'react';
import { classifyLibraryFile } from '@continuum/contracts';

import { type UploadResumeState, uploadMediaAsset } from '@/lib/library/uploadMediaAsset';

const MAX_CONCURRENCY = 3;
export type UploadItem = {
  id: string;
  name: string;
  sizeBytes: number;
  progress: number;
  status: 'uploading' | 'paused' | 'done' | 'error';
  error?: string;
};

type UploadJob = {
  file: File;
  resume: UploadResumeState | null;
  controller: AbortController | null;
  cancelled: boolean;
};

export function isAcceptedUploadFile(file: File): boolean {
  return classifyLibraryFile({ fileName: file.name, mimeType: file.type }).accepted;
}

// Multi-file upload with bounded concurrency. Each file is POSTed to the
// single-file upload route; analysis + library insertion happen server-side and
// surface back through the realtime subscription, so this hook only tracks
// transient per-file progress.
export function useMediaUpload(brandId: string) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const counter = useRef(0);
  const jobs = useRef(new Map<string, UploadJob>());

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...next } : u)));
  }, []);

  const uploadOne = useCallback(
    async (file: File, id: string) => {
      const job = jobs.current.get(id);
      if (!job || job.cancelled) return;
      const controller = new AbortController();
      job.controller = controller;
      patch(id, { status: 'uploading', error: undefined });
      try {
        await uploadMediaAsset({
          file,
          brandId,
          signal: controller.signal,
          resume: job.resume,
          onResumeState: (resume) => {
            job.resume = resume;
          },
          onProgress: ({ percentage }) => patch(id, { progress: percentage }),
        });
        if (job.cancelled) return;
        patch(id, { status: 'done', progress: 100 });
        jobs.current.delete(id);
        // Drop the chip a moment after success so the strip self-clears.
        setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== id)), 2500);
      } catch (err) {
        if (job.cancelled) return;
        if ((err as { name?: string }).name === 'AbortError') {
          patch(id, { status: 'paused' });
          return;
        }
        patch(id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
      } finally {
        job.controller = null;
      }
    },
    [brandId, patch],
  );

  const uploadFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      const files = Array.from(fileList ?? []).filter(isAcceptedUploadFile);
      if (files.length === 0) return;

      const queued = files.map((file) => {
        counter.current += 1;
        return { file, id: `up-${counter.current}` };
      });
      setUploads((prev) => [
        ...queued.map(({ file, id }) => ({
          id,
          name: file.name,
          sizeBytes: file.size,
          progress: 0,
          status: 'uploading' as const,
        })),
        ...prev,
      ]);
      for (const { file, id } of queued) {
        jobs.current.set(id, { file, resume: null, controller: null, cancelled: false });
      }

      // Drain the queue with a fixed number of workers.
      let cursor = 0;
      const worker = async () => {
        while (cursor < queued.length) {
          const current = queued[cursor];
          cursor += 1;
          await uploadOne(current.file, current.id);
        }
      };
      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, queued.length) }, worker));
    },
    [uploadOne],
  );

  const pauseUpload = useCallback((id: string) => {
    jobs.current.get(id)?.controller?.abort();
  }, []);

  const resumeUpload = useCallback(
    (id: string) => {
      const job = jobs.current.get(id);
      if (!job || job.controller || job.cancelled) return;
      void uploadOne(job.file, id);
    },
    [uploadOne],
  );

  const cancelUpload = useCallback((id: string) => {
    const job = jobs.current.get(id);
    if (job) {
      job.cancelled = true;
      job.controller?.abort();
      jobs.current.delete(id);
    }
    setUploads((prev) => prev.filter((upload) => upload.id !== id));
  }, []);

  return {
    uploads,
    uploadFiles,
    pauseUpload,
    resumeUpload,
    retryUpload: resumeUpload,
    cancelUpload,
  };
}
