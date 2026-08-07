'use client';

// Live view of a brand's design system.
//
// Ingest is asynchronous and can run for ten seconds or more, so the page cannot poll
// a promise and call it done. It subscribes to the same Realtime channel document
// upload uses, for the same reason: the row IS the progress, and the server is already
// writing to it step by step.

import type { DesignSystemSnapshot } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDesignSystem } from '@/lib/brands/designSystem.client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type DesignSystemPhase = 'idle' | 'loading' | 'parsing' | 'ready' | 'error' | 'absent';

export interface DesignSystemState {
  phase: DesignSystemPhase;
  snapshot: DesignSystemSnapshot | null;
  progressStep: string | null;
  progressPercent: number;
  errorMessage: string | null;
  version: number | null;
  refresh: () => Promise<void>;
}

interface SystemRow {
  brand_id: string;
  status?: 'parsing' | 'ready' | 'error';
  progress_step?: string | null;
  progress_percent?: number | null;
  error_message?: string | null;
  version?: number | null;
  is_active?: boolean;
}

/**
 * A stale-parse watchdog, mirroring the 2-minute one on document upload.
 *
 * A backend restart mid-ingest leaves the row on `parsing` forever, and a card that
 * spins indefinitely is worse than one that says it failed — the user can retry a
 * failure, but has no way to act on a spinner.
 */
const STALE_PARSE_MS = 180_000;

export function useDesignSystem(brandId: string | null): DesignSystemState {
  const [snapshot, setSnapshot] = useState<DesignSystemSnapshot | null>(null);
  const [phase, setPhase] = useState<DesignSystemPhase>('idle');
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());

  const refresh = useCallback(async () => {
    if (!brandId) return;
    setPhase((current) => (current === 'idle' ? 'loading' : current));
    try {
      const response = await fetchDesignSystem(brandId);
      setSnapshot(response.design_system);
      setVersion(response.version);
      if (response.status === 'parsing') setPhase('parsing');
      else if (response.status === 'error') setPhase('error');
      else setPhase(response.present ? 'ready' : 'absent');
    } catch (error) {
      setErrorMessage((error as Error).message);
      setPhase('error');
    }
  }, [brandId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!brandId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`design-system-${brandId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'brand_profiles',
          table: 'brand_design_systems',
          filter: `brand_id=eq.${brandId}`,
        },
        (payload) => {
          const row = payload.new as SystemRow | null;
          if (!row) return;
          lastUpdateRef.current = Date.now();
          setProgressStep(row.progress_step ?? null);
          setProgressPercent(row.progress_percent ?? 0);
          if (row.status === 'error') {
            setErrorMessage(row.error_message ?? 'The import failed.');
            setPhase('error');
            return;
          }
          if (row.status === 'parsing') {
            setPhase('parsing');
            return;
          }
          // A row reaching `ready` carries only the columns Realtime replicated, not
          // the sections — so refetch rather than reconstructing a partial snapshot
          // from a payload that was never meant to be the whole system.
          if (row.status === 'ready' && row.is_active) void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [brandId, refresh]);

  useEffect(() => {
    if (phase !== 'parsing') return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastUpdateRef.current > STALE_PARSE_MS) {
        setErrorMessage('The import stopped responding. Try uploading again.');
        setPhase('error');
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  return {
    phase,
    snapshot,
    progressStep,
    progressPercent,
    errorMessage,
    version,
    refresh,
  };
}
