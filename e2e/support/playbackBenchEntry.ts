// Browser-side half of the Video Editor playback bench (bug #188: "sometimes it
// stays in a loop in a video and out of nowhere it goes out"). Bundled with
// `bun build --target=browser` and injected into a REAL Chrome page by
// e2e/video-editor-playback.spec.ts, so the code under test — the real
// usePlayheadPlayback hook and the real timeline geometry — drives a REAL
// <video> element decoding REAL H.264, which is the boundary the unit tests fake.
//
// It mints its own sources with Mediabunny (the encoder the editor itself uses):
// each source paints a different flat color every second, so the pixel on screen
// says WHICH source-second is playing. That makes the trim assertion strong: clip
// B is trimmed in at 1.0s, so B's second-0 color must never once reach the frame.

import { createElement, type ReactElement, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  type ClipMedia,
  usePlayheadPlayback,
} from '../../src/StudioCanvas/nodes/timeline/usePlayheadPlayback';
import {
  computeLayout,
  effectiveItemDuration,
} from '../../src/StudioCanvas/nodes/timeline/useTimelineEditorModel';
import type { TimelineItem } from '../../src/StudioCanvas/types';

const WIDTH = 320;
const HEIGHT = 180;
const FPS = 15;

// One flat color per source-second. B_COLORS[0] is the color of the second that
// clip B trims away — seeing it on screen means the element played the untrimmed head.
const A_COLORS = [
  '#e53935',
  '#00c853',
  '#2962ff',
  '#ffd600',
  '#00bcd4',
  '#8e24aa',
  '#ff6d00',
  '#1b5e20',
];
const B_COLORS = ['#ff00ff', '#004d40', '#c2185b', '#37474f', '#f5f5f5'];

export interface PlaybackSample {
  atMs: number;
  playheadSec: number;
  currentTimeSec: number;
  srcTag: string;
  ended: boolean;
  rgb: [number, number, number];
}

export interface PlaybackRun {
  totalSec: number;
  clipStarts: number[];
  durationMs: number;
  stoppedByHook: boolean;
  finalPlayheadSec: number;
  samples: PlaybackSample[];
}

async function encodeSource(colors: string[]): Promise<Blob> {
  const { Output, BufferTarget, Mp4OutputFormat, CanvasSource, QUALITY_MEDIUM } = await import(
    'mediabunny'
  );
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_MEDIUM });
  output.addVideoTrack(source);
  await output.start();

  for (let frame = 0; frame < FPS * colors.length; frame += 1) {
    const second = Math.min(Math.floor(frame / FPS), colors.length - 1);
    ctx.fillStyle = colors[second] ?? '#000000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    await source.add(frame / FPS, 1 / FPS);
  }
  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('encoder produced no bytes');
  return new Blob([buffer], { type: 'video/mp4' });
}

// The reporter's timeline: an 8s source trimmed 0.00 → 8.00 (so it runs to the
// media's natural end and the element fires `ended`) at 3.50x, then a second clip
// on another source trimmed in at 1.00s at 1.50x.
function benchItems(): TimelineItem[] {
  return [
    {
      id: 'clip-a',
      order: 0,
      sourceNodeId: 'source-a',
      kind: 'video',
      trimStartSec: 0,
      trimEndSec: 8,
      effects: { speed: 3.5 },
    },
    {
      id: 'clip-b',
      order: 1,
      sourceNodeId: 'source-b',
      kind: 'video',
      trimStartSec: 1,
      trimEndSec: 4,
      effects: { speed: 1.5 },
    },
  ];
}

function probe(
  video: HTMLVideoElement,
  canvas: OffscreenCanvas,
  ctx: OffscreenCanvasRenderingContext2D,
): [number, number, number] {
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch {
    return [-1, -1, -1];
  }
  const data = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
  return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
}

// Mounts the REAL hook against a REAL <video>, presses play, and samples the
// playhead, the element clock, and the pixel actually on screen every frame.
export async function runPlayback(): Promise<PlaybackRun> {
  const [blobA, blobB] = await Promise.all([encodeSource(A_COLORS), encodeSource(B_COLORS)]);
  const urls: Record<string, string> = {
    'source-a': URL.createObjectURL(blobA),
    'source-b': URL.createObjectURL(blobB),
  };
  const srcTags: Record<string, string> = {
    [urls['source-a']]: 'A',
    [urls['source-b']]: 'B',
  };

  const items = benchItems();
  const sourceDurations = new Map([
    ['source-a', A_COLORS.length],
    ['source-b', B_COLORS.length],
  ]);
  const layout = computeLayout(
    items,
    (item) => effectiveItemDuration(item, sourceDurations.get(item.sourceNodeId)),
    100,
  );
  const mediaFor = (itemId: string): ClipMedia | undefined => {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return undefined;
    return {
      kind: 'video',
      url: urls[item.sourceNodeId],
      trimStartSec: item.trimStartSec ?? 0,
      speed: item.effects?.speed ?? 1,
    };
  };

  const host = document.createElement('div');
  document.body.appendChild(host);

  const samples: PlaybackSample[] = [];
  let root: Root | undefined;
  const started = performance.now();

  const run = await new Promise<PlaybackRun>((resolve) => {
    const finish = (stoppedByHook: boolean, finalPlayheadSec: number): void => {
      resolve({
        totalSec: layout.totalSec,
        clipStarts: layout.clips.map((clip) => clip.startSec),
        durationMs: performance.now() - started,
        stoppedByHook,
        finalPlayheadSec,
        samples,
      });
    };

    const Bench = (): ReactElement => {
      const playback = usePlayheadPlayback({ layout, mediaFor });
      // The sampler runs on its own RAF chain, so it has to read the LIVE playhead
      // rather than the one captured by the mount effect's closure.
      const liveRef = useRef(playback);
      liveRef.current = playback;
      const doneRef = useRef(false);

      useEffect(() => {
        const canvas = new OffscreenCanvas(8, 8);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const sample = (): void => {
          const live = liveRef.current;
          const video = live.videoRef.current;
          if (doneRef.current || !video) return;
          samples.push({
            atMs: Math.round(performance.now() - started),
            playheadSec: live.playheadSec,
            currentTimeSec: video.currentTime,
            srcTag: srcTags[video.src] ?? '?',
            ended: video.ended,
            rgb: ctx ? probe(video, canvas, ctx) : [-1, -1, -1],
          });
          requestAnimationFrame(sample);
        };

        // A hard ceiling so a runaway loop (the reported bug) still reports rather
        // than hanging the bench: the timeline is ~4.3s of output.
        const ceiling = window.setTimeout(() => {
          if (doneRef.current) return;
          doneRef.current = true;
          liveRef.current.pause();
          finish(false, liveRef.current.playheadSec);
        }, 12_000);

        liveRef.current.play();
        requestAnimationFrame(sample);

        return () => window.clearTimeout(ceiling);
      }, []);

      // The hook clears isPlaying when it reaches the end of the timeline.
      useEffect(() => {
        if (doneRef.current || playback.isPlaying || samples.length === 0) return;
        doneRef.current = true;
        finish(true, playback.playheadSec);
      }, [playback.isPlaying, playback.playheadSec]);

      return createElement('video', {
        ref: playback.videoRef,
        playsInline: true,
        muted: true,
        width: WIDTH,
        height: HEIGHT,
      });
    };

    root = createRoot(host);
    root.render(createElement(Bench));
  });

  root?.unmount();
  host.remove();
  for (const url of Object.values(urls)) URL.revokeObjectURL(url);
  return run;
}

declare global {
  interface Window {
    __playbackBench: { runPlayback: typeof runPlayback };
  }
}

window.__playbackBench = { runPlayback };
