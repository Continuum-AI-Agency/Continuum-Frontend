import { ACTION_DEFS, type ActionId } from '@continuum/contracts';
import type { TimelineWorkerItem } from '../../workers/spliceWorkerProtocol';
import {
  blurEffects,
  chromaKeyEffects,
  coverScale,
  cropDimensions,
  cropEffects,
  type Dimensions,
  effectPresetEffects,
  filterEffects,
  gradeEffects,
  kenBurnsEffects,
  padDimensions,
  parseAspectRatio,
  splitRanges,
  stitchItems,
} from '../actions/videoOps';
import type { ClipEffectSpec } from '../render/effectSpec';
import { loadMediabunny } from './appendRange';
import { composeTimeline } from './composeTimeline';
import { renderReverse } from './reverseRange';
import type { SpliceProgress, SpliceResult } from './spliceClips';

// Which engine runs each re-encoding action, keyed by the catalog id.
//
// This registry is the reason `splicer.worker.ts` and `spliceWorkerProtocol.ts` can be
// frozen after Canvas V3 Wave 2: a new video op is an entry HERE, not a new message
// kind, a new handler and a new client function. The worker's `start_action` handler
// is one lookup.
//
// Only ops whose `execution` is `'worker'` belong here. The registry asserts that
// itself at lookup time rather than trusting the caller — a sync op routed through the
// worker would spin up a whole mediabunny pipeline to rotate a JPEG.
//
// Wave 3 note on SHAPE: almost every engine below is a `composeTimeline` call over a
// single item carrying a `ClipEffectSpec`. That is not laziness for its own sake — the
// timeline renderer is the ONLY path that threads an effect spec into the frame loop
// (see `speedTimelineItem`), it already owns letterboxing, aspect targets, overlay
// compositing, transitions and the audio mixdown, and it is frozen. An op that fits
// through it costs a config mapper in `utils/actions/videoOps.ts` and nothing else.
// The two that do not fit — reverse and boomerang, which need frames the decoder has
// not reached — get their own pipeline in `reverseRange.ts`.

export interface ActionEngineArgs {
  /** The op's inputs, keyed by the handle the edge landed on. */
  inputs: { handle: string; blob: Blob }[];
  /** Already parsed against the op's own schema by the worker handler. */
  config: Record<string, unknown>;
  videoBitrate?: number;
  audioBitrate?: number;
  signal?: AbortSignal;
  onProgress?: (progress: SpliceProgress) => void;
}

/** The shape `SpliceWorkerOutbound`'s `result` frame already demands. */
export interface ActionEngineResult {
  blob: Blob;
  width: number;
  height: number;
  durationSec: number;
}

export type ActionEngine = (args: ActionEngineArgs) => Promise<ActionEngineResult>;

/** The blob wired to `handle`, or a clear error naming what is missing. */
export function requireInput(args: ActionEngineArgs, handle: string): Blob {
  const found = args.inputs.find((input) => input.handle === handle);
  if (!found) throw new Error(`Nothing is connected to this action's "${handle}" input`);
  return found.blob;
}

/** Every blob on `handle`, in wiring order — for the ports whose `max` is above 1. */
function allInputs(args: ActionEngineArgs, handle: string): Blob[] {
  const found = args.inputs.filter((input) => input.handle === handle).map((input) => input.blob);
  if (found.length === 0)
    throw new Error(`Nothing is connected to this action's "${handle}" input`);
  return found;
}

const toResult = (result: SpliceResult): ActionEngineResult => ({
  blob: result.blob,
  width: result.width,
  height: result.height,
  durationSec: result.durationSec,
});

/** avc refuses odd dimensions; `composeTimeline` rounds too, but the crop's cover
 *  factor has to be computed against the size actually encoded. */
const evenDimensions = (dimensions: Dimensions): Dimensions => ({
  width: dimensions.width - (dimensions.width % 2),
  height: dimensions.height - (dimensions.height % 2),
});

interface ClipFacts {
  width: number;
  height: number;
  durationSec: number;
}

/**
 * Size and duration of a clip, from the container.
 *
 * The DOM probe in `nodes/timeline/mediaProbe.ts` cannot be reused here: it creates a
 * `<video>` element, and every engine in this file runs inside the splicer worker.
 */
async function probeClip(blob: Blob): Promise<ClipFacts> {
  const mb = await loadMediabunny();
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('The connected clip has no video track');
    const width = await track.getCodedWidth();
    const height = await track.getCodedHeight();
    const durationSec = await input.computeDuration();
    if (width <= 0 || height <= 0) throw new Error('The connected clip has no readable size');
    if (!(durationSec > 0)) throw new Error('The connected clip has no duration');
    return { width, height, durationSec };
  } finally {
    try {
      (input as unknown as { dispose?: () => void }).dispose?.();
    } catch {
      // noop
    }
  }
}

/** A solid colour frame, for the pad ops whose background is not the letterbox black. */
async function solidPlate(dimensions: Dimensions, color: string): Promise<Blob> {
  const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, dimensions.width, dimensions.height);
  return canvas.convertToBlob({ type: 'image/png' });
}

/**
 * Speed change, as a one-item timeline.
 *
 * The obvious route — `spliceSingleSource` with `effects.speed` — does not exist:
 * `SpliceSingleSourceOptions` carries no `effects` field and never passes one to
 * `appendRange`, so `speedFor()` there is permanently 1. `composeTimeline` is the only
 * path that threads a `ClipEffectSpec` through to the frame loop, and a timeline of one
 * item is exactly a single clip. Zero new engine code, and `appendRange.ts` /
 * `composeTimeline.ts` stay untouched.
 *
 * Audio is dropped on a speed change (`appendRange.ts:188` — pitch-preserving resampling
 * needs a resampler nobody has written). That ceiling is already stated in the op's own
 * catalog description, so the user is told before they run it, not after.
 */
export function speedTimelineItem(blob: Blob, config: Record<string, unknown>): TimelineWorkerItem {
  // A non-numeric rate means an unparsed or hand-edited config; 1 is the identity, so
  // the clip comes back unchanged instead of the encoder receiving NaN.
  const rate = typeof config.rate === 'number' && Number.isFinite(config.rate) ? config.rate : 1;
  return { itemId: 'action-speed', kind: 'video', blob, effects: { speed: rate } };
}

/**
 * The shape nine of these ops share: one clip in, one effect spec, one clip out.
 *
 * `targetFor` is how crop and pad ride the same helper — they differ from the colour
 * ops only in also naming an output frame size.
 */
function singleClipEngine(
  itemId: string,
  effectsFor: (config: Record<string, unknown>, facts: ClipFacts) => ClipEffectSpec,
  targetFor?: (config: Record<string, unknown>, facts: ClipFacts) => Dimensions,
): ActionEngine {
  return async (args) => {
    const blob = requireInput(args, 'in');
    // Probing costs one container read; skip it for the ops that never look at the
    // source's size, which is most of them.
    const facts: ClipFacts =
      targetFor || effectsFor.length > 1
        ? await probeClip(blob)
        : { width: 0, height: 0, durationSec: 0 };
    const target = targetFor?.(args.config, facts);
    const result = await composeTimeline({
      items: [{ itemId, kind: 'video', blob, effects: effectsFor(args.config, facts) }],
      ...(target ? { targetWidth: target.width, targetHeight: target.height } : {}),
      videoBitrate: args.videoBitrate,
      audioBitrate: args.audioBitrate,
      signal: args.signal,
      onProgress: args.onProgress,
    });
    return toResult(result);
  };
}

/** The output frame for an aspect-ratio op; the source's own ratio when it is unset. */
function aspectTarget(
  config: Record<string, unknown>,
  facts: ClipFacts,
  fit: (width: number, height: number, ratio: number) => Dimensions,
): Dimensions {
  const ratio = parseAspectRatio(config.aspectRatio) ?? facts.width / facts.height;
  return evenDimensions(fit(facts.width, facts.height, ratio));
}

/**
 * A still plate under a video layer.
 *
 * Both ops that need it — greenscreen and a coloured pad — want the CLIP composited
 * over something, and `composeTimeline`'s base track always fills black behind a frame
 * (`drawLetterboxed`). Its OVERLAY track does not: `drawEffectFrame` skips the fill
 * precisely so layers can stack. So the plate becomes the base item and the clip
 * becomes the overlay — which is also what makes the chroma key visible, since keying
 * happens in `drawEffectFrame` and needs something behind it to reveal.
 */
async function plateComposite(args: {
  engine: ActionEngineArgs;
  itemId: string;
  plate: Blob;
  plateEffects?: ClipEffectSpec;
  clip: Blob;
  clipEffects?: ClipEffectSpec;
  target: Dimensions;
  durationSec: number;
}): Promise<ActionEngineResult> {
  const result = await composeTimeline({
    items: [
      {
        itemId: `${args.itemId}-plate`,
        kind: 'image',
        blob: args.plate,
        durationSec: args.durationSec,
        ...(args.plateEffects ? { effects: args.plateEffects } : {}),
      },
    ],
    overlays: [
      {
        itemId: `${args.itemId}-clip`,
        kind: 'video',
        blob: args.clip,
        startSec: 0,
        ...(args.clipEffects ? { effects: args.clipEffects } : {}),
      },
    ],
    targetWidth: args.target.width,
    targetHeight: args.target.height,
    videoBitrate: args.engine.videoBitrate,
    audioBitrate: args.engine.audioBitrate,
    signal: args.engine.signal,
    onProgress: args.engine.onProgress,
  });
  return toResult(result);
}

const videoPad: ActionEngine = async (args) => {
  const blob = requireInput(args, 'in');
  const facts = await probeClip(blob);
  const target = aspectTarget(args.config, facts, padDimensions);
  const background =
    typeof args.config.background === 'string' ? args.config.background : '#000000';

  // The shared letterbox already fills black, so the default background needs no plate
  // and keeps the fast sequential decode.
  if (background.toLowerCase() === '#000000') {
    const result = await composeTimeline({
      items: [{ itemId: 'action-pad', kind: 'video', blob }],
      targetWidth: target.width,
      targetHeight: target.height,
      videoBitrate: args.videoBitrate,
      audioBitrate: args.audioBitrate,
      signal: args.signal,
      onProgress: args.onProgress,
    });
    return toResult(result);
  }

  return plateComposite({
    engine: args,
    itemId: 'action-pad',
    plate: await solidPlate(target, background),
    clip: blob,
    target,
    durationSec: facts.durationSec,
  });
};

const videoGreenscreen: ActionEngine = async (args) => {
  const clip = requireInput(args, 'in');
  const background = requireInput(args, 'background-in');
  const facts = await probeClip(clip);
  const target = evenDimensions({ width: facts.width, height: facts.height });

  // The background fills the frame rather than letterboxing into it — bars behind a
  // keyed subject would read as a broken key, not as a deliberate fit.
  const bitmap = await createImageBitmap(background);
  const plateEffects: ClipEffectSpec = {
    transform: { scale: coverScale(bitmap.width, bitmap.height, target.width, target.height) },
  };
  bitmap.close();

  return plateComposite({
    engine: args,
    itemId: 'action-greenscreen',
    plate: background,
    plateEffects,
    clip,
    clipEffects: chromaKeyEffects(args.config),
    target,
    durationSec: facts.durationSec,
  });
};

const videoStitch: ActionEngine = async (args) => {
  const blobs = allInputs(args, 'in');
  // Says what it GOT, not what the user must do. "Connect at least two clips" was the
  // whole of #304: it fired on a node with two clips connected, because the resolver
  // above had handed this engine one of them, and the message sent the reporter to
  // check their wiring — the one thing that was not wrong.
  if (blobs.length < 2) {
    throw new Error(`Stitch received ${blobs.length} clip — it needs at least two to join`);
  }
  const result = await composeTimeline({
    items: stitchItems(blobs, args.config),
    videoBitrate: args.videoBitrate,
    audioBitrate: args.audioBitrate,
    signal: args.signal,
    onProgress: args.onProgress,
  });
  return toResult(result);
};

const videoReverse: ActionEngine = async (args) =>
  toResult(
    await renderReverse({
      blob: requireInput(args, 'in'),
      videoBitrate: args.videoBitrate,
      audioBitrate: args.audioBitrate,
      signal: args.signal,
      onProgress: args.onProgress,
    }),
  );

const videoBoomerang: ActionEngine = async (args) =>
  toResult(
    await renderReverse({
      blob: requireInput(args, 'in'),
      boomerang: true,
      overlapSec:
        typeof args.config.overlapSec === 'number' && Number.isFinite(args.config.overlapSec)
          ? args.config.overlapSec
          : 0,
      videoBitrate: args.videoBitrate,
      audioBitrate: args.audioBitrate,
      signal: args.signal,
      onProgress: args.onProgress,
    }),
  );

/**
 * `video.split` — every part, as its own clip.
 *
 * The catalog's only `outputsCollection` worker op. The worker's `start_action`
 * handler routes here BEFORE the engine table when `outputsCollection` is set, and
 * posts every part on the result frame's `parts` field with the first part in the
 * frame's top-level fields.
 */
export async function renderSplitParts(args: ActionEngineArgs): Promise<ActionEngineResult[]> {
  const blob = requireInput(args, 'in');
  const { durationSec } = await probeClip(blob);
  const ranges = splitRanges(durationSec, args.config);
  const parts: ActionEngineResult[] = [];
  for (const [index, range] of ranges.entries()) {
    const result = await composeTimeline({
      items: [
        {
          itemId: `action-split-${index}`,
          kind: 'video',
          blob,
          trimStartSec: range.startSec,
          trimEndSec: range.endSec,
        },
      ],
      videoBitrate: args.videoBitrate,
      audioBitrate: args.audioBitrate,
      signal: args.signal,
      onProgress: ({ progress }) =>
        args.onProgress?.({
          progress: (index + progress) / ranges.length,
          processedClips: index,
          totalClips: ranges.length,
        }),
    });
    parts.push(toResult(result));
  }
  return parts;
}

/**
 * The video ops with a worker engine.
 *
 * Missing on purpose, each for a reason that is written down rather than implied:
 *   video.subtitles  — the caption engine's own shell (Wave 3, `s-subtitles`)
 *   video.overlay / video.watermark — the burn-in shell (Wave 3, `g-burnins`)
 * `video.longExposure`, `video.extractFrames` and `video.frameGrid` are `sync`/image
 * ops and belong in `runAction`'s `SYNC_OPS`, not here.
 */
export const ACTION_ENGINES: Partial<Record<ActionId, ActionEngine>> = {
  'video.grade': singleClipEngine('action-grade', gradeEffects),
  'video.filter': singleClipEngine('action-filter', filterEffects),
  'video.effect': singleClipEngine('action-effect', effectPresetEffects),
  'video.blur': singleClipEngine('action-blur', blurEffects),
  'video.kenBurns': singleClipEngine('action-ken-burns', kenBurnsEffects),
  'video.speed': singleClipEngine(
    'action-speed',
    (config) => speedTimelineItem(new Blob(), config).effects ?? {},
  ),
  'video.crop': singleClipEngine(
    'action-crop',
    (config, facts) =>
      cropEffects(facts.width, facts.height, aspectTarget(config, facts, cropDimensions)),
    (config, facts) => aspectTarget(config, facts, cropDimensions),
  ),
  'video.pad': videoPad,
  'video.greenscreen': videoGreenscreen,
  'video.stitch': videoStitch,
  'video.reverse': videoReverse,
  'video.boomerang': videoBoomerang,
  // The worker's `outputsCollection` branch calls `renderSplitParts` directly and never
  // consults this entry; it exists so the engine table stays equal to the ops the node
  // UI enables, and it hands any single-result caller the FIRST part — the same blob
  // the result frame carries in its top-level fields.
  'video.split': async (args) => {
    const [first] = await renderSplitParts(args);
    if (!first) throw new Error('Split produced no parts');
    return first;
  },
};

/** The engine for an op, or a refusal that says which of the two things went wrong. */
export function actionEngine(actionId: ActionId): ActionEngine {
  const def = ACTION_DEFS[actionId];
  if (def.execution !== 'worker') {
    throw new Error(`${def.label} runs in the page, not the worker`);
  }
  const engine = ACTION_ENGINES[actionId];
  if (!engine) throw new Error(`${def.label} is not implemented yet`);
  return engine;
}
