'use client';

import type { PlatformExportPresetId, VideoEditorOpOutput } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/errors';
import { runVideoEditorOp } from '@/lib/api/videoEditorOps.client';
import type { VideoStudioContext } from '../types';

// Export all variants: every sibling drafted from this project's brief renders once with the
// same platform preset. Each variant runs on its own — reframed only when its format
// differs, exported, polled — so one failure stays that variant's, and retries alone.

type ExportState = VideoEditorOpOutput<'export_status'>['state'];
type Fit = 'cover' | 'contain';

export type VariantExport = {
  projectId: string;
  label: string;
  title: string;
  state: 'idle' | 'starting' | ExportState;
  progress?: number;
  assetId?: string;
  downloadUrl?: string;
  error?: string;
};

const POLL_START_MS = 1_000;
const POLL_MAX_MS = 8_000;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A 4xx other than a timeout or rate limit will not get better by asking again. */
export const isPermanentError = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 408 &&
  error.status !== 429;

export const exportRunning = (row: VariantExport): boolean =>
  row.state === 'starting' || row.state === 'queued' || row.state === 'running';

/**
 * The brief family's exports. `enabled` reads the family (list_variants); a row keeps its
 * export across re-reads. Edits to this project go through the workspace's runOp (so they
 * join its Undo and refetch); siblings are edited through the ops client directly.
 */
export function useVariantExports(studio: VideoStudioContext, enabled: boolean) {
  const { projectId } = studio;
  const [rows, setRows] = useState<VariantExport[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const runOpRef = useRef(studio.runOp);
  runOpRef.current = studio.runOp;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    runVideoEditorOp(projectId, 'list_variants', {})
      .then(({ variants }) => {
        if (cancelled) return;
        setListError(null);
        setRows((current) =>
          variants.map(
            (variant) =>
              current.find((row) => row.projectId === variant.projectId) ?? {
                projectId: variant.projectId,
                label: variant.label,
                title: variant.title,
                state: 'idle',
              },
          ),
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) setListError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, projectId]);

  const patch = useCallback((id: string, next: Partial<VariantExport>) => {
    if (!mounted.current) return;
    setRows((current) => current.map((row) => (row.projectId === id ? { ...row, ...next } : row)));
  }, []);

  const exportOne = useCallback(
    async (id: string, preset: PlatformExportPresetId, fit: Fit) => {
      patch(id, {
        state: 'starting',
        progress: undefined,
        assetId: undefined,
        downloadUrl: undefined,
        error: undefined,
      });
      try {
        const { exportPresetId } = await runVideoEditorOp(id, 'get_project', {});
        const edit = id === projectId ? runOpRef.current : null;
        if (exportPresetId !== preset) {
          await (edit
            ? edit('set_format', { preset, fit })
            : runVideoEditorOp(id, 'set_format', { preset, fit }));
        }
        const { jobId } = await (edit
          ? edit('export', { preset })
          : runVideoEditorOp(id, 'export', { preset }));
        patch(id, { state: 'queued' });
        let delay = POLL_START_MS;
        while (mounted.current) {
          await sleep(delay);
          delay = Math.min(delay * 1.5, POLL_MAX_MS);
          try {
            const status = await runVideoEditorOp(id, 'export_status', { jobId });
            patch(id, {
              state: status.state,
              progress: status.progress,
              assetId: status.assetId,
              downloadUrl: status.downloadUrl,
              error: status.error,
            });
            if (status.state === 'completed' || status.state === 'failed') return;
          } catch (pollError) {
            if (isPermanentError(pollError)) throw pollError;
          }
        }
      } catch (error) {
        patch(id, { state: 'failed', error: errorText(error) });
      }
    },
    [patch, projectId],
  );

  const exportAll = useCallback(
    (preset: PlatformExportPresetId, fit: Fit) => {
      for (const row of rows) void exportOne(row.projectId, preset, fit);
    },
    [exportOne, rows],
  );

  return { rows, listError, exportAll, exportOne };
}
