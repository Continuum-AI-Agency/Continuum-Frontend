"use client";

import { useCallback, useRef, useState } from "react";

import { uploadMediaAsset } from "@/lib/library/uploadMediaAsset";

const MAX_CONCURRENCY = 3;
const ACCEPTED_PREFIXES = ["image/", "video/"];

export type UploadItem = {
  id: string;
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
};

function isAccepted(file: File): boolean {
  return ACCEPTED_PREFIXES.some((p) => file.type.startsWith(p));
}

// Multi-file upload with bounded concurrency. Each file is POSTed to the
// single-file upload route; analysis + library insertion happen server-side and
// surface back through the realtime subscription, so this hook only tracks
// transient per-file progress.
export function useMediaUpload(brandId: string) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const counter = useRef(0);

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...next } : u)));
  }, []);

  const uploadOne = useCallback(
    async (file: File, id: string) => {
      try {
        await uploadMediaAsset({ file, brandId });
        patch(id, { status: "done" });
        // Drop the chip a moment after success so the strip self-clears.
        setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== id)), 2500);
      } catch (err) {
        patch(id, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
      }
    },
    [brandId, patch],
  );

  const uploadFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      const files = Array.from(fileList ?? []).filter(isAccepted);
      if (files.length === 0) return;

      const queued = files.map((file) => {
        counter.current += 1;
        return { file, id: `up-${counter.current}` };
      });
      setUploads((prev) => [
        ...queued.map(({ file, id }) => ({ id, name: file.name, status: "uploading" as const })),
        ...prev,
      ]);

      // Drain the queue with a fixed number of workers.
      let cursor = 0;
      const worker = async () => {
        while (cursor < queued.length) {
          const current = queued[cursor];
          cursor += 1;
          await uploadOne(current.file, current.id);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(MAX_CONCURRENCY, queued.length) }, worker),
      );
    },
    [uploadOne],
  );

  return { uploads, uploadFiles };
}
