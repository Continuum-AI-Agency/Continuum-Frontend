import type { ActionId } from '@continuum/contracts';
import type { NodeOutput } from '../../types/execution';
import { runTimelineInWorker } from '../../workers/spliceWorkerClient';
import type {
  TimelineOverlayWorkerItem,
  TimelineWorkerItem,
} from '../../workers/spliceWorkerProtocol';
import { isOverlayPosition, type OverlayPosition, overlayTransform } from './overlayPresets';
import type { RunActionArgs } from './runAction';

// `video.overlay` and `video.watermark` — burning an image into a clip's frames.
//
// This op is a PLAN, not an engine. `composeTimeline` already composites
// `overlays: TimelineOverlayRenderItem[]` over a base track at an absolute `startSec`
// with per-overlay transform + opacity, and the splicer worker already accepts that
// whole shape as `start_timeline`. A burn-in is therefore a one-item timeline plus
// overlay items — zero new engine code, and `composeTimeline.ts` / `appendRange.ts` /
// the worker stay frozen.
//
// Why NOT the `start_action` route the rest of the video catalog takes: `start_action`
// hands the worker only handle-keyed blobs, and the corner arithmetic needs the base
// frame's aspect ratio and the overlay image's — measurements that live on the main
// thread, where the blobs already are. Building the plan here and posting
// `start_timeline` keeps `actionEngines.ts` out of the diff too.
//
// **Watermark is this op with the window opened all the way.** `video.watermark` is a
// separate catalog id with an identical config schema, so rather than a second
// half-implementation it resolves to the same builder with `startSec` forced to 0 and
// `endSec` to the clip's full duration. One placement implementation, one set of tests.

export const OVERLAY_ACTION_IDS = ['video.overlay', 'video.watermark'] as const;

export const isOverlayActionId = (actionId: ActionId): boolean =>
  (OVERLAY_ACTION_IDS as readonly string[]).includes(actionId);

/** A source that has already been measured. Measurement is a browser concern; the plan
 *  builder below is pure so its arithmetic is testable without a decoder. */
export interface MeasuredSource {
  blob: Blob;
  width: number;
  height: number;
}

export interface MeasuredBase extends MeasuredSource {
  durationSec: number;
}

export interface OverlayPlanArgs {
  actionId: ActionId;
  base: MeasuredBase;
  overlays: MeasuredSource[];
  /** Already parsed against the op's own zod schema by `runAction`. */
  config: Record<string, unknown>;
}

export interface OverlayPlan {
  items: TimelineWorkerItem[];
  overlays: TimelineOverlayWorkerItem[];
  targetWidth: number;
  targetHeight: number;
  /** The resolved window, for the caller to report and for the tests to assert. */
  window: { startSec: number; durationSec: number };
}

const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * The timed window, in output seconds.
 *
 * `startSec`/`endSec` are `.nullable().default(null)` in the registry, and null means
 * "unset" — NOT 0. Unset start is the beginning; unset end is the end of the clip. A
 * window that starts after the clip ends, or ends before it starts, would render an
 * overlay nobody can ever see, so it collapses to zero duration and the caller refuses
 * rather than encoding a clip whose burn-in silently never appears.
 */
export function resolveOverlayWindow(
  actionId: ActionId,
  config: Record<string, unknown>,
  baseDurationSec: number,
): { startSec: number; durationSec: number } {
  // A watermark marks the WHOLE clip by definition — the window controls are inert on
  // it, and honouring them would make two catalog entries mean the same thing.
  if (actionId === 'video.watermark') return { startSec: 0, durationSec: baseDurationSec };

  const rawStart = config.startSec;
  const rawEnd = config.endSec;
  const startSec = clamp(
    rawStart === null || rawStart === undefined ? 0 : number(rawStart, 0),
    0,
    baseDurationSec,
  );
  const endSec = clamp(
    rawEnd === null || rawEnd === undefined ? baseDurationSec : number(rawEnd, baseDurationSec),
    0,
    baseDurationSec,
  );
  return { startSec, durationSec: Math.max(0, endSec - startSec) };
}

/**
 * The `start_timeline` payload for a burn-in: the base clip as the only base item, and
 * one overlay item per connected image, all sharing the window and the placement.
 *
 * The base item carries NO effects — the clip must come through untouched, audio
 * included. `composeTimeline` only ever mixes overlay audio for VIDEO overlays that
 * are not muted, and every overlay here is an image, so the source audio is copied
 * through unchanged. That is what the bench's RMS assertion pins.
 */
export function buildOverlayPlan(args: OverlayPlanArgs): OverlayPlan {
  const { base, overlays, config } = args;
  if (overlays.length === 0) {
    throw new Error('Connect an image to burn in');
  }

  const window = resolveOverlayWindow(args.actionId, config, base.durationSec);
  if (window.durationSec <= 0) {
    throw new Error(
      `The burn-in window (${window.startSec.toFixed(2)}s onward) falls outside this ` +
        `${base.durationSec.toFixed(2)}s clip — nothing would be visible`,
    );
  }

  const position: OverlayPosition = isOverlayPosition(config.position)
    ? config.position
    : 'top-right';
  const scale = clamp(number(config.scale, 0.15), 0.01, 1);
  const marginFrac = clamp(number(config.marginFrac, 0.04), 0, 0.5);
  const opacity = clamp(number(config.opacity, 1), 0, 1);
  const targetAspect = base.height > 0 ? base.width / base.height : 1;

  return {
    items: [{ itemId: 'burnin-base', kind: 'video', blob: base.blob }],
    overlays: overlays.map((overlay, index) => ({
      itemId: `burnin-overlay-${index}`,
      kind: 'image' as const,
      blob: overlay.blob,
      startSec: window.startSec,
      // Image overlays default to a 3s hold in composeTimeline; the window is the
      // whole point of this op, so it is always stated explicitly.
      durationSec: window.durationSec,
      muteAudio: true,
      effects: {
        opacity,
        transform: overlayTransform({
          position,
          scale,
          marginFrac,
          sourceAspect: overlay.height > 0 ? overlay.width / overlay.height : 1,
          targetAspect,
        }),
      },
    })),
    targetWidth: base.width,
    targetHeight: base.height,
    window,
  };
}

// ---------------------------------------------------------------------------
// Browser side: measure, plan, encode
// ---------------------------------------------------------------------------

/** Natural size + duration of a video blob, from a detached `<video>` element.
 *  Metadata only — no decode, no mediabunny, nothing that belongs in the worker. */
export function measureVideo(blob: Blob): Promise<MeasuredBase> {
  const url = URL.createObjectURL(blob);
  return new Promise<MeasuredBase>((resolve, reject) => {
    const element = document.createElement('video');
    element.preload = 'metadata';
    element.muted = true;

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
      fn();
    };
    const timer = window.setTimeout(
      () => finish(() => reject(new Error('Timed out reading the clip'))),
      15_000,
    );

    element.addEventListener('loadedmetadata', () =>
      finish(() =>
        resolve({
          blob,
          width: element.videoWidth,
          height: element.videoHeight,
          durationSec: Number.isFinite(element.duration) ? element.duration : 0,
        }),
      ),
    );
    element.addEventListener('error', () =>
      finish(() => reject(new Error('The connected clip could not be read'))),
    );
    element.src = url;
  });
}

async function measureImage(source: string): Promise<MeasuredSource> {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not read the overlay image (${response.status})`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    return { blob, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/**
 * The runner `runAction` dispatches for both overlay ids.
 *
 * Every overlay edge is read, not just the first: `video.overlay` declares
 * `overlay-in` with `max: 4`, so four connected images are four burn-ins sharing one
 * window and one placement.
 */
export async function runOverlayAction(
  args: RunActionArgs,
  config: Record<string, unknown>,
): Promise<NodeOutput> {
  const baseInput = args.inputs.find((input) => input.handle === 'in');
  if (!baseInput?.blob) throw new Error('Connect a clip to burn into');

  const overlayInputs = args.inputs.filter((input) => input.handle === 'overlay-in');
  if (overlayInputs.length === 0) throw new Error('Connect an image to burn in');

  const base = await measureVideo(baseInput.blob);
  const overlays = await Promise.all(
    overlayInputs.map(async (input) => {
      // The executor resolves image ports to a URL and video ports to bytes; an
      // overlay that arrived as bytes (a collection fan-out item) is already readable.
      if (input.imageUrl) return measureImage(input.imageUrl);
      if (input.blob) return measureImage(URL.createObjectURL(input.blob));
      throw new Error('The connected image has no readable source');
    }),
  );

  const plan = buildOverlayPlan({ actionId: args.actionId, base, overlays, config });
  const result = await runTimelineInWorker({
    items: plan.items,
    overlays: plan.overlays,
    targetWidth: plan.targetWidth,
    targetHeight: plan.targetHeight,
    signal: args.signal,
    onProgress: ({ progress }) => args.onProgress?.(progress),
  });
  return { type: 'video', url: result.objectUrl, sizeBytes: result.blob.size };
}
