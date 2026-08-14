'use client';

// Live view of a brand's design system.
//
// Ingest is asynchronous and can run for ten seconds or more, so the page cannot poll
// a promise and call it done. It follows the row over Realtime, for the same reason
// document upload does: the row IS the progress, and the server is already writing to
// it step by step.
//
// The subscription goes through `subscribeToPostgresChanges` rather than building a
// channel here. Settings mounts this hook twice — `DesignSystemSection` for the section
// cards, and the `DesignSystemCard` inside it for the uploader — and a hand-built topic
// of `design-system-${brandId}` is the same string both times. `supabase.channel()`
// hands back the EXISTING channel for a matching topic, so the second mount's `.on()`
// landed on an already-subscribed channel and threw, taking the settings page to the
// global error boundary.

import type { DesignSystemSnapshot } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDesignSystem } from '@/lib/brands/designSystem.client';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

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

/** A Realtime row is untrusted JSON, so every field is read rather than cast. */
const readString = (row: Record<string, unknown>, key: string): string | null =>
  typeof row[key] === 'string' ? (row[key] as string) : null;

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
    return subscribeToPostgresChanges({
      label: `design-system-${brandId}`,
      bindings: [
        {
          event: '*',
          schema: 'brand_profiles',
          table: 'brand_design_systems',
          filter: `brand_id=eq.${brandId}`,
          onRow: (row) => {
            lastUpdateRef.current = Date.now();
            setProgressStep(readString(row, 'progress_step'));
            setProgressPercent(typeof row.progress_percent === 'number' ? row.progress_percent : 0);
            const status = readString(row, 'status');
            if (status === 'error') {
              setErrorMessage(readString(row, 'error_message') ?? 'The import failed.');
              setPhase('error');
              return;
            }
            if (status === 'parsing') {
              setPhase('parsing');
              return;
            }
            // A row reaching `ready` carries only the columns Realtime replicated, not
            // the sections — so refetch rather than reconstructing a partial snapshot
            // from a payload that was never meant to be the whole system.
            if (status === 'ready' && row.is_active === true) void refresh();
          },
        },
      ],
    });
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
