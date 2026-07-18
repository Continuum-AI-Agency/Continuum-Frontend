'use client';

// One-click competitor scan stream host. Instantiated in CompetitorSpyClient
// (tab bodies unmount on switch — the stream must survive tab switches) and
// passed down to the report surface. The scan continues server-side if the
// client disconnects, so an unmount abort never loses work.

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { streamCompetitorScan } from '@/lib/api/competitorSpyStream';
import { type CompetitorScanState, INITIAL_SCAN_STATE, reduceScanFrame } from './scanReducer';

export type CompetitorScan = {
  state: CompetitorScanState;
  running: boolean;
  start: () => void;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useCompetitorScan(brandId: string): CompetitorScan {
  const queryClient = useQueryClient();
  const [state, setState] = useState<CompetitorScanState>(INITIAL_SCAN_STATE);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ ...INITIAL_SCAN_STATE, running: true });

    const invalidateSpyQueries = () => {
      void queryClient.invalidateQueries({ queryKey: ['competitor-spy', 'gap-report', brandId] });
      void queryClient.invalidateQueries({ queryKey: ['competitor-spy'] });
    };

    void streamCompetitorScan(
      brandId,
      (frame) => {
        setState((prev) => reduceScanFrame(prev, frame));
        if (frame.type === 'scan_completed' || frame.type === 'gap_report_ready') {
          invalidateSpyQueries();
        }
      },
      controller.signal,
    )
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        const message = error instanceof Error ? error.message : 'Scan failed';
        setState((prev) => ({ ...prev, error: prev.error ?? message }));
      })
      .finally(() => {
        // Settle on stream end (success, error frame, or transport failure) so
        // the progress UI never hangs on a spinner.
        controllerRef.current = null;
        setState((prev) => ({ ...prev, running: false }));
        invalidateSpyQueries();
      });
  }, [brandId, queryClient]);

  return { state, running: state.running, start };
}
