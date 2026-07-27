'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import type { TimelineInputSource, TimelineTrack } from '../../types';
import type { TimelineEditorAdapter } from './adapter';
import {
  buildTimelinePreviewAudioPlan,
  type TimelinePreviewAudioPlan,
} from './timelineAudioPreviewPlan';
import type { TimelineLayout } from './useTimelineEditorModel';
import { TimelineWebAudioPreviewEngine } from './webAudioPreviewEngine';

export type TimelineAudioPreviewStatus = 'idle' | 'loading' | 'playing' | 'failed';

export interface TimelineAudioPreviewController {
  enabled: boolean;
  active: boolean;
  status: TimelineAudioPreviewStatus;
  error?: string;
  play(fromTimelineSec: number): Promise<boolean>;
  pause(): number | null;
  stop(): void;
  currentTimelineTime(): number | null;
}

function filterTracks(
  tracks: TimelineTrack[] | undefined,
  predicate: (source: TimelineInputSource | undefined) => boolean,
  poolById: ReadonlyMap<string, TimelineInputSource>,
): TimelineTrack[] {
  return (tracks ?? [])
    .map((track) => ({
      ...track,
      items: track.items.filter((item) => predicate(poolById.get(item.sourceNodeId))),
    }))
    .filter((track) => track.items.length > 0);
}

export function useTimelineAudioPreview(input: {
  adapter: TimelineEditorAdapter;
  layout: TimelineLayout;
  sourceDurations: ReadonlyMap<string, number>;
  revisionKey: string;
}): TimelineAudioPreviewController {
  const { adapter, layout, sourceDurations, revisionKey } = input;
  const { show } = useToast();
  const engineRef = useRef<TimelineWebAudioPreviewEngine | null>(null);
  const planCacheRef = useRef<{
    revisionKey: string;
    promise: Promise<TimelinePreviewAudioPlan>;
  } | null>(null);
  const requestRef = useRef(0);
  const [status, setStatus] = useState<TimelineAudioPreviewStatus>('idle');
  const [error, setError] = useState<string>();

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new TimelineWebAudioPreviewEngine();
    return engineRef.current;
  }, []);

  const loadPlan = useCallback((): Promise<TimelinePreviewAudioPlan> => {
    const cached = planCacheRef.current;
    if (cached?.revisionKey === revisionKey) return cached.promise;

    const document = adapter.getDocument();
    const poolById = new Map(adapter.pool.map((source) => [source.nodeId, source]));
    const baseItems = document.items.filter((item) => {
      const source = poolById.get(item.sourceNodeId);
      return (item.kind ?? source?.kind) === 'video' && !item.muteAudio;
    });
    const overlayTracks = filterTracks(
      document.overlayTracks,
      (source) => source?.kind === 'video',
      poolById,
    );
    const audioTracks = filterTracks(
      document.audioTracks,
      (source) => source?.kind === 'audio',
      poolById,
    );

    const promise = Promise.all([
      adapter.resolveSources(baseItems),
      adapter.resolveOverlays(overlayTracks),
      adapter.resolveAudioTracks(audioTracks),
    ]).then(([base, overlays, audio]) =>
      buildTimelinePreviewAudioPlan({
        document,
        layout,
        pool: adapter.pool,
        sourceDurations,
        resolved: { base, overlays, audio },
      }),
    );
    planCacheRef.current = { revisionKey, promise };
    return promise;
  }, [adapter, layout, revisionKey, sourceDurations]);

  const play = useCallback(
    async (fromTimelineSec: number): Promise<boolean> => {
      const request = ++requestRef.current;
      const engine = ensureEngine();
      if (!engine.isSupported()) return false;
      setStatus('loading');
      setError(undefined);
      try {
        const plan = await loadPlan();
        const started = await engine.play(plan, fromTimelineSec);
        if (request !== requestRef.current) return false;
        setStatus(started ? 'playing' : 'idle');
        return started;
      } catch (cause) {
        if (request !== requestRef.current) return false;
        const message =
          cause instanceof Error
            ? cause.message
            : 'The synchronized audio preview could not start.';
        setStatus('failed');
        setError(message);
        show({
          title: 'Audio preview unavailable',
          description: `${message} Video playback will continue with its source audio.`,
          variant: 'warning',
        });
        return false;
      }
    },
    [ensureEngine, loadPlan, show],
  );

  const pause = useCallback((): number | null => {
    requestRef.current += 1;
    const timelineSec = engineRef.current?.pause() ?? null;
    setStatus('idle');
    return timelineSec;
  }, []);

  const stop = useCallback(() => {
    requestRef.current += 1;
    engineRef.current?.stop();
    setStatus('idle');
  }, []);

  const currentTimelineTime = useCallback(
    () => engineRef.current?.currentTimelineTime() ?? null,
    [],
  );

  useEffect(() => {
    planCacheRef.current = null;
  }, [revisionKey]);

  useEffect(
    () => () => {
      requestRef.current += 1;
      const engine = engineRef.current;
      engineRef.current = null;
      if (engine) void engine.dispose();
    },
    [],
  );

  const enabled =
    typeof globalThis.AudioContext !== 'undefined' || engineRef.current?.isSupported() === true;
  return useMemo(
    () => ({
      enabled,
      active: status === 'playing',
      status,
      ...(error ? { error } : {}),
      play,
      pause,
      stop,
      currentTimelineTime,
    }),
    [currentTimelineTime, enabled, error, pause, play, status, stop],
  );
}
