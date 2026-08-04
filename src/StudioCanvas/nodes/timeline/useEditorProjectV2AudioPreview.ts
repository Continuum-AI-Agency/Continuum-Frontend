'use client';

import type { EditorProjectV2, EditorTrack } from '@continuum/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { headFadeFor, tailFadeFor } from '../../utils/render/transitions';
import { resolveTimelineAudioEnvelope } from '../../utils/splice/timelineAudioEnvelope';
import type {
  TimelinePreviewAudioEvent,
  TimelinePreviewAudioPlan,
} from './timelineAudioPreviewPlan';
import type { TimelineAudioPreviewController } from './useTimelineAudioPreview';
import type { TimelineLayout } from './useTimelineEditorModel';
import { TimelineWebAudioPreviewEngine } from './webAudioPreviewEngine';

type VideoTrack = Extract<EditorTrack, { kind: 'video' }>;
type AudioTrack = Extract<EditorTrack, { kind: 'audio' }>;
type AudioBearingTrack = VideoTrack | AudioTrack;

function activeTracks<T extends AudioBearingTrack>(tracks: T[]): T[] {
  const enabled = tracks.filter((track) => track.enabled && !track.muted);
  return enabled.some((track) => track.solo) ? enabled.filter((track) => track.solo) : enabled;
}

function exactSourceKey(clip: VideoTrack['clips'][number] | AudioTrack['clips'][number]): string {
  const source = clip.source;
  if (source.sourceType === 'library_asset') {
    return `${source.assetId}:${source.renditionId ?? 'unpinned'}`;
  }
  return `${clip.id}:${source.sourceType}`;
}

export function editorProjectV2AudioClipIds(project: EditorProjectV2): string[] {
  const tracks = activeTracks(
    project.tracks.filter(
      (track): track is AudioBearingTrack => track.kind === 'video' || track.kind === 'audio',
    ),
  );
  const videoIds = tracks
    .filter((track): track is VideoTrack => track.kind === 'video')
    .flatMap((track) =>
      track.clips.filter((clip) => clip.enabled && clip.audioEnabled).map((clip) => clip.id),
    );
  const audioIds = tracks
    .filter((track): track is AudioTrack => track.kind === 'audio')
    .flatMap((track) =>
      track.clips.filter((clip) => clip.enabled && !clip.muted).map((clip) => clip.id),
    );
  return [...videoIds, ...audioIds];
}

export function buildEditorProjectV2AudioPreviewPlan(input: {
  project: EditorProjectV2;
  layout: TimelineLayout;
  blobsByClipId: ReadonlyMap<string, Blob>;
}): TimelinePreviewAudioPlan {
  const events: TimelinePreviewAudioEvent[] = [];
  const tracks = activeTracks(
    input.project.tracks.filter(
      (track): track is AudioBearingTrack => track.kind === 'video' || track.kind === 'audio',
    ),
  );
  const videoTracks = tracks.filter((track): track is VideoTrack => track.kind === 'video');
  const videoById = new Map(
    videoTracks.flatMap((track) => track.clips.map((clip) => [clip.id, clip])),
  );

  for (let index = 0; index < input.layout.clips.length; index += 1) {
    const placement = input.layout.clips[index];
    const clip = videoById.get(placement.item.id);
    const blob = input.blobsByClipId.get(placement.item.id);
    if (!clip?.enabled || !clip.audioEnabled || !blob) continue;
    const previous = input.layout.clips[index - 1];
    const next = input.layout.clips[index + 1];
    const inOverlapSec = previous
      ? Math.max(0, previous.startSec + previous.durationSec - placement.startSec)
      : 0;
    const outOverlapSec = next
      ? Math.max(0, placement.startSec + placement.durationSec - next.startSec)
      : 0;
    const envelope = resolveTimelineAudioEnvelope({
      transitionFadeInSec: Math.max(
        inOverlapSec,
        headFadeFor(placement.item.transition, index === 0)?.durationSec ?? 0,
      ),
      transitionFadeOutSec: Math.max(
        outOverlapSec,
        tailFadeFor(next?.item.transition)?.durationSec ?? 0,
      ),
    });
    events.push({
      id: clip.id,
      sourceKey: exactSourceKey(clip),
      sourceNodeId: clip.id,
      kind: 'base',
      blob,
      outputStartSec: placement.startSec,
      outputEndSec: placement.startSec + placement.durationSec,
      sourceStartSec: clip.sourceInSec,
      sourceEndSec: clip.sourceInSec + placement.durationSec * clip.playbackRate,
      playbackRate: clip.playbackRate,
      ...envelope,
    });
  }

  const audioTracks = tracks.filter((track): track is AudioTrack => track.kind === 'audio');
  for (const clip of audioTracks.flatMap((track) => track.clips)) {
    const blob = input.blobsByClipId.get(clip.id);
    if (!clip.enabled || clip.muted || !blob) continue;
    events.push({
      id: clip.id,
      sourceKey: exactSourceKey(clip),
      sourceNodeId: clip.id,
      kind: 'audio',
      blob,
      outputStartSec: clip.timelineStartSec,
      outputEndSec: clip.timelineStartSec + clip.durationSec,
      sourceStartSec: clip.sourceInSec,
      sourceEndSec: clip.sourceInSec + clip.durationSec * clip.playbackRate,
      playbackRate: clip.playbackRate,
      ...resolveTimelineAudioEnvelope({
        gain: clip.volume,
        manualFadeInSec: clip.fadeInSec,
        manualFadeOutSec: clip.fadeOutSec,
      }),
    });
  }

  return {
    events: events.sort(
      (left, right) =>
        left.outputStartSec - right.outputStartSec || left.id.localeCompare(right.id),
    ),
    totalDurationSec: input.layout.totalSec,
  };
}

export function useEditorProjectV2AudioPreview(input: {
  project: EditorProjectV2;
  layout: TimelineLayout;
  exactUrls: ReadonlyMap<string, string>;
}): TimelineAudioPreviewController {
  const { project, layout, exactUrls } = input;
  const { show } = useToast();
  const engineRef = useRef<TimelineWebAudioPreviewEngine | null>(null);
  const planRef = useRef<{
    revisionKey: string;
    promise: Promise<TimelinePreviewAudioPlan>;
  } | null>(null);
  const requestRef = useRef(0);
  const [status, setStatus] = useState<TimelineAudioPreviewController['status']>('idle');
  const [error, setError] = useState<string>();
  const clipIds = useMemo(() => editorProjectV2AudioClipIds(project), [project]);
  const planKey = `${project.fingerprint}:${clipIds
    .map((clipId) => `${clipId}:${exactUrls.get(clipId) ?? ''}`)
    .join('|')}`;

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new TimelineWebAudioPreviewEngine();
    return engineRef.current;
  }, []);

  const loadPlan = useCallback(() => {
    if (planRef.current?.revisionKey === planKey) return planRef.current.promise;
    const promise = (async () => {
      const blobByUrl = new Map<string, Promise<Blob>>();
      const blobsByClipId = new Map<string, Blob>();
      await Promise.all(
        clipIds.map(async (clipId) => {
          const url = exactUrls.get(clipId);
          if (!url) return;
          let pending = blobByUrl.get(url);
          if (!pending) {
            pending = fetch(url).then((response) => {
              if (!response.ok) throw new Error(`Audio source returned HTTP ${response.status}.`);
              return response.blob();
            });
            blobByUrl.set(url, pending);
          }
          blobsByClipId.set(clipId, await pending);
        }),
      );
      return buildEditorProjectV2AudioPreviewPlan({ project, layout, blobsByClipId });
    })();
    planRef.current = { revisionKey: planKey, promise };
    return promise;
  }, [clipIds, exactUrls, layout, planKey, project]);

  const play = useCallback(
    async (fromTimelineSec: number): Promise<boolean> => {
      const request = ++requestRef.current;
      const engine = ensureEngine();
      if (!engine.isSupported()) return false;
      setStatus('loading');
      setError(undefined);
      try {
        const plan = await loadPlan();
        if (plan.events.length === 0) {
          setStatus('idle');
          return false;
        }
        const started = await engine.play(plan, fromTimelineSec);
        if (request !== requestRef.current) return false;
        setStatus(started ? 'playing' : 'idle');
        return started;
      } catch (cause) {
        if (request !== requestRef.current) return false;
        const message = cause instanceof Error ? cause.message : 'Timeline audio could not start.';
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
  const pause = useCallback(() => {
    requestRef.current += 1;
    const time = engineRef.current?.pause() ?? null;
    setStatus('idle');
    return time;
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
    planRef.current = null;
  }, [planKey]);
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
    clipIds.some((clipId) => exactUrls.has(clipId)) &&
    (typeof globalThis.AudioContext !== 'undefined' || engineRef.current?.isSupported() === true);
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
