'use client';

import { classifyLibraryFile, isLibraryFontFile } from '@continuum/contracts';
import { useCallback, useRef, useState } from 'react';

import { uploadCompanionPreview } from '@/lib/library/assetPreview';
import { partitionSidecarUploads } from '@/lib/library/sidecarUploads';
import { uploadBrandFont } from '@/lib/library/templateSources';
import { type UploadResumeState, uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

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

/** `HeadingNow-36CompBold.otf` -> `HeadingNow 36CompBold`. Editable afterwards in Typography. */
function familyFromFontFileName(fileName: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim() || fileName
  );
}

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
        // A font takes the other road entirely: the private brand-docs store, no
        // media.assets row, no signed URL, no share link. Same drop target, because a
        // designer hands over a template and the faces it needs in one gesture — and
        // asking them to remember which panel each file belongs in is how a template
        // arrives without its typography.
        if (isLibraryFontFile({ fileName: file.name, mimeType: file.type })) {
          await uploadBrandFont({ brandId, family: familyFromFontFileName(file.name), file });
          if (job.cancelled) return;
          patch(id, { status: 'done', progress: 100 });
          jobs.current.delete(id);
          setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== id)), 2500);
          return;
        }
        const uploaded = await uploadMediaAsset({
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
        return uploaded;
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

      const { pairs, rest } = partitionSidecarUploads(files);
      const queued = files.map((file) => {
        counter.current += 1;
        return { file, id: `up-${counter.current}` };
      });
      const idFor = new Map(queued.map((item) => [item.file, item.id]));
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

      const work: Array<() => Promise<void>> = [
        ...pairs.map((pair) => async () => {
          const sourceId = idFor.get(pair.source);
          const companionId = idFor.get(pair.companion);
          if (!sourceId || !companionId) return;
          const uploaded = await uploadOne(pair.source, sourceId);
          if (!uploaded?.assetId || !uploaded.versionId) {
            patch(companionId, { status: 'error', error: 'Could not attach sidecar preview' });
            return;
          }
          try {
            await uploadCompanionPreview({
              file: pair.companion,
              brandId,
              assetId: uploaded.assetId,
              assetVersionId: uploaded.versionId,
              client: createSupabaseBrowserClient(),
            });
            patch(companionId, { status: 'done', progress: 100 });
            jobs.current.delete(companionId);
            setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== companionId)), 2500);
          } catch (err) {
            patch(companionId, {
              status: 'error',
              error: err instanceof Error ? err.message : 'Could not attach sidecar preview',
            });
          }
        }),
        ...rest.map((file) => async () => {
          const id = idFor.get(file);
          if (id) await uploadOne(file, id);
        }),
      ];

      let cursor = 0;
      const worker = async () => {
        while (cursor < work.length) {
          const current = work[cursor];
          cursor += 1;
          await current();
        }
      };
      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, work.length) }, worker));
    },
    [brandId, patch, uploadOne],
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
