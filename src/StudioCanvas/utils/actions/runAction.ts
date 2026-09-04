import { ACTION_DEFS, type ActionId, actionDef, type BrandTypeInputs } from '@continuum/contracts';
import type { NodeOutput } from '../../types/execution';
import { runActionInWorker } from '../../workers/spliceWorkerClient';
import { parseDataUrl } from '../dataUrl';
import { parseAspectRatio } from '../pixel/cropPad';
import { parseActionConfig } from './actionConfig';
import { buildFrameGrid, extractFrames, extractSceneChangeFrames } from './extractFrames';
import {
  applyBlur,
  applyColorFilter,
  applyColorGrade,
  applyColorTint,
  applyFilterColor,
  type BlurKind,
  canvasToDataUrl,
  cropToAspect,
  type DrawableImage,
  duplicateValue,
  type FilterColorMode,
  flipImage,
  padToAspect,
  rotateImage,
  type TintBlend,
} from './imageOps';
import { setImageText } from './imageText';
import { isOverlayActionId, runImageOverlayAction, runOverlayAction } from './overlayOp';
import { concatText, findReplace, type SplitTextMode, splitText } from './textOps';
import { runLongExposureAction } from './videoOps';

// The one dispatcher for the action catalog.
//
// It returns a `NodeOutput` and deliberately never writes to the store: that is what
// makes it safe to call N times concurrently under the batch fan-out, and it keeps the
// executor's `setNodeOutput` the single place a node's output is committed.
//
// The split between sync and worker is the catalog's, not this file's — an op that
// re-encodes video goes to the splicer worker, anything whose output is a still or text
// runs in the page. `ACTION_DEFS[id].execution` is the authority, and the registry test
// asserts it is equivalent to `output === 'video'`.

/** One resolved input, already fetched into something the ops can read. */
export interface ResolvedActionInput {
  handle: string;
  /** Set for image inputs: a data URL or a signed http(s) URL. */
  imageUrl?: string;
  /** Set for video inputs: the bytes, because the worker re-encodes them. */
  blob?: Blob;
  /** Set for text inputs. */
  text?: string;
  /**
   * `media.assets` id of whatever produced this input, when it has one.
   *
   * Only the ops that hand work to the BACKEND need it, and they need it for one
   * reason: it is what lets the result be registered as a derivative OF something
   * rather than as an orphan. A pixel op ignores it entirely.
   */
  assetId?: string;
  /**
   * The node that produced this input. Carried so an op that REQUIRES `assetId` can
   * mint the missing pointer against that node — registering the bytes it already
   * holds — instead of refusing a run over media the Library can absorb.
   */
  sourceNodeId?: string;
}

export interface RunActionArgs {
  actionId: ActionId;
  inputs: ResolvedActionInput[];
  /** Raw `node.data.config`; parsed against the op's schema before anything runs. */
  config: unknown;
  /**
   * Whatever brand shapes the caller could reach, for the ops whose output is a BRAND decision
   * rather than a pixel transform. `image.text` resolves its faces and its ink from these —
   * design system, brand book, kit, scrape, in that order — and refuses only when NO source
   * yields an ink, because a headline in a guessed colour is worse than one that failed.
   * Every field is optional: a read that failed and a value that is absent are the same thing.
   */
  brand?: BrandTypeInputs | null;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

const inputFor = (args: RunActionArgs, handle: string): ResolvedActionInput => {
  const found = args.inputs.find((input) => input.handle === handle);
  if (!found) throw new Error(`Nothing is connected to this action's "${handle}" input`);
  return found;
};

/** Decode an image input to something canvas can draw. */
async function loadImage(input: ResolvedActionInput): Promise<DrawableImage> {
  const source = input.imageUrl;
  if (!source) throw new Error('The connected image has no readable source');
  // `createImageBitmap` over an `<img>`: it works in a worker context too, it decodes
  // off the main thread, and it does not depend on the element ever being laid out.
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not read the connected image (${response.status})`);
  return (await createImageBitmap(await response.blob())) as DrawableImage;
}

type SyncOp = (args: RunActionArgs, config: Record<string, unknown>) => Promise<NodeOutput>;

/** A finished canvas as the `NodeOutput` an image op returns. */
async function imageOutput(canvas: OffscreenCanvas): Promise<NodeOutput> {
  const parsed = parseDataUrl(await canvasToDataUrl(canvas));
  return {
    type: 'image',
    base64: parsed?.base64 ?? '',
    mimeType: parsed?.mimeType ?? 'image/png',
  };
}

/** Several canvases as one collection, which is what the batch fan-out loops over. */
async function imageCollectionOutput(canvases: readonly OffscreenCanvas[]): Promise<NodeOutput> {
  return {
    type: 'collection',
    itemType: 'image',
    items: await Promise.all(canvases.map((canvas) => imageOutput(canvas))),
  };
}

/**
 * The bytes of a video input. Video always arrives as a `blob` — `resolveActionInputsFor`
 * fetches it whether the op is sync or worker — so a missing one is a wiring fault, not
 * a shape to guess at.
 */
function videoBlob(args: RunActionArgs, handle = 'in'): Blob {
  const blob = inputFor(args, handle).blob;
  if (!blob) throw new Error(`The clip on "${handle}" has no readable bytes`);
  return blob;
}

/**
 * `16:9` → 1.777…, refusing the ratios the schema's regex lets through but arithmetic
 * cannot use. `0:1` matches `^\d+:\d+$` and would silently produce a 0px canvas.
 */
function aspectFrom(config: Record<string, unknown>): number {
  const raw = String(config.aspectRatio ?? '1:1');
  const aspect = parseAspectRatio(raw);
  if (!aspect) throw new Error(`"${raw}" is not an aspect ratio this op can use`);
  return aspect;
}

/** Every input wired to one handle, in wiring order — for the ops whose port takes many. */
const inputsFor = (args: RunActionArgs, handle: string): ResolvedActionInput[] =>
  args.inputs.filter((input) => input.handle === handle);

/**
 * The in-page ops: resolve the input, do the work locally, hand back an output — no
 * network, no worker.
 *
 * Every entry is a thin adapter. The op itself lives in `imageOps` / `textOps` /
 * `extractFrames` as a plain function over a decoded image or a string, which is what
 * lets the catalog be unit-tested and benched without this dispatcher, and what keeps
 * adding an op to one line here.
 *
 * Config keys are read straight off the FROZEN contracts schema — `parseActionConfig`
 * has already filled the defaults and rejected out-of-range values, so a cast here is
 * reading a validated field, not trusting the caller. Where an op function accepts a
 * parameter the registry has no field for yet (a blur `kind`, a tint `blend`, a
 * filterColor `mode`), it is simply left undefined and the function's own default
 * applies — so widening the contract later is an enum edit with no work in this file.
 */
const SYNC_OPS: Partial<Record<ActionId, SyncOp>> = {
  'image.grade': async (args, config) =>
    imageOutput(
      applyColorGrade(await loadImage(inputFor(args, 'in')), {
        brightness: config.brightness as number,
        contrast: config.contrast as number,
        saturation: config.saturation as number,
        hueRotate: config.hueRotate as number,
        sepia: config.sepia as number,
        grayscale: config.grayscale as number,
        invert: config.invert as number,
        opacity: config.opacity as number,
        warmth: config.warmth as number | undefined,
      }),
    ),

  'image.filter': async (args, config) =>
    imageOutput(
      applyColorFilter(await loadImage(inputFor(args, 'in')), {
        preset: config.preset as string,
        intensity: config.intensity as number,
      }),
    ),

  'image.tint': async (args, config) =>
    imageOutput(
      applyColorTint(await loadImage(inputFor(args, 'in')), {
        color: config.color as string,
        amount: config.amount as number,
        intensity: config.intensity as number | undefined,
        blend: config.blend as TintBlend | undefined,
      }),
    ),

  'image.blur': async (args, config) =>
    imageOutput(
      applyBlur(await loadImage(inputFor(args, 'in')), {
        kind: config.kind as BlurKind | undefined,
        radiusPx: config.radiusPx as number,
        angleDeg: config.angleDeg as number | undefined,
        centerX: config.centerX as number | undefined,
        centerY: config.centerY as number | undefined,
        focusY: config.focusY as number | undefined,
        focusHeight: config.focusHeight as number | undefined,
        edgeThreshold: config.edgeThreshold as number | undefined,
        color: config.color as string | undefined,
        tolerance: config.tolerance as number | undefined,
        softness: config.softness as number | undefined,
      }),
    ),

  'image.rotate': async (args, config) =>
    imageOutput(
      await rotateImage(await loadImage(inputFor(args, 'in')), config.degrees as number, {
        expand: config.expand as boolean | undefined,
        background: config.background as string | undefined,
      }),
    ),

  'image.flip': async (args, config) =>
    imageOutput(
      flipImage(await loadImage(inputFor(args, 'in')), {
        horizontal: config.horizontal as boolean,
        vertical: config.vertical as boolean,
      }),
    ),

  // Remove / isolate / replace are ONE op with three verbs, so the three agree pixel
  // for pixel about what "this colour" means. The registry exposes only the default
  // verb today; `mode` and `replacement` are read here so widening it needs no code.
  'image.chromaKey': async (args, config) =>
    imageOutput(
      applyFilterColor(await loadImage(inputFor(args, 'in')), {
        color: config.color as string,
        tolerance: config.tolerance as number,
        softness: config.softness as number,
        mode: config.mode as FilterColorMode | undefined,
        replacement: config.replacement as string | undefined,
      }),
    ),

  'image.crop': async (args, config) =>
    imageOutput(cropToAspect(await loadImage(inputFor(args, 'in')), aspectFrom(config))),

  'image.duplicate': async (args, config) => {
    const input = inputFor(args, 'in');
    const item: NodeOutput = { type: 'image', mimeType: 'image/png', url: input.imageUrl };
    return {
      type: 'collection',
      itemType: 'image',
      items: duplicateValue(item, config.copies as number),
    };
  },

  'image.pad': async (args, config) =>
    imageOutput(
      padToAspect(
        await loadImage(inputFor(args, 'in')),
        aspectFrom(config),
        (config.background as string) ?? '#000000',
      ),
    ),

  // The one image op that reads the BRAND, not just the pixels: where the lines break and
  // what has to happen to the photo are measured by `planPlacement` against this very image,
  // and the ink comes from a design-system token that is never re-derived in the draw path.
  'image.overlay': (args, config) => runImageOverlayAction(args, config),
  'image.text': async (args, config) =>
    imageOutput(
      await setImageText({
        brand: args.brand,
        config,
        image: await loadImage(inputFor(args, 'in')),
        headline: inputFor(args, 'text-in').text ?? '',
      }),
    ),

  // Sync because the OUTPUT is a still: the frames decode in the page, the blend
  // accumulates on a canvas, and there is nothing for the splicer worker to re-encode.
  'video.longExposure': async (args, config) =>
    imageOutput((await runLongExposureAction(videoBlob(args), config)).canvas),

  // ── frames: sync because the OUTPUT is a still, even though the INPUT is a clip ──
  'video.extractFrames': async (args, config) => {
    const blob = videoBlob(args);
    const mode = config.mode as string;
    const frames =
      mode === 'sceneChange'
        ? await extractSceneChangeFrames(blob, {
            threshold: config.threshold as number | undefined,
          })
        : await extractFrames(blob, {
            mode: mode === 'interval' ? 'interval' : mode === 'single' ? 'single' : 'evenly',
            count: config.count as number,
            intervalSec: config.intervalSec as number,
            atSec: config.atSec as number | undefined,
          });
    return imageCollectionOutput(frames);
  },

  'video.frameGrid': async (args, config) => {
    const columns = config.columns as number;
    const rows = config.rows as number;
    // Sample exactly as many frames as there are cells: a grid with a hole in it
    // reads as a decode failure, and one with leftovers silently drops frames.
    const frames = await extractFrames(videoBlob(args), {
      mode: 'evenly',
      count: Math.max(1, columns * rows),
    });
    return imageOutput(
      buildFrameGrid(frames, {
        columns,
        rows,
        cellWidth: config.cellWidth as number | undefined,
        gap: config.gap as number | undefined,
        background: config.background as string | undefined,
      }),
    );
  },

  // ── text: pure string work, no decode at all ────────────────────────────────
  'text.split': async (args, config) => ({
    type: 'collection',
    itemType: 'text',
    items: splitText(inputFor(args, 'in').text ?? '', {
      mode: config.mode as SplitTextMode,
      separator: config.separator as string,
      trim: config.trim as boolean,
      skipEmpty: config.skipEmpty as boolean | undefined,
      size: config.size as number | undefined,
      maxParts: config.maxParts as number | null | undefined,
    }).map((value) => ({ type: 'text', value })),
  }),

  'text.findReplace': async (args, config) => ({
    type: 'text',
    value: findReplace(inputFor(args, 'in').text ?? '', {
      find: config.find as string,
      replace: config.replace as string,
      caseSensitive: config.caseSensitive as boolean,
      regex: config.regex as boolean | undefined,
      wholeWord: config.wholeWord as boolean | undefined,
    }),
  }),

  // The one op whose port takes MANY edges, so it filters rather than finds. Note the
  // live ceiling: `resolveActionInputsFor` resolves one edge per port, so today this
  // receives a single input however many are wired. The filter is what makes the op
  // correct the moment that is lifted, instead of quietly joining one string forever.
  'text.concat': async (args, config) => ({
    type: 'text',
    value: concatText(
      inputsFor(args, 'in').map((input) => input.text ?? ''),
      {
        separator: config.separator as string,
        prefix: config.prefix as string | undefined,
        suffix: config.suffix as string | undefined,
        trim: config.trim as boolean | undefined,
        skipEmpty: config.skipEmpty as boolean | undefined,
      },
    ),
  }),
};

/**
 * The worker ops that actually have an engine in `utils/splice/actionEngines.ts`.
 *
 * Declared here rather than imported from there on purpose: that module pulls
 * `composeTimeline`, and with it mediabunny, which must not enter the page bundle just
 * so a node can decide whether to enable its Run button. `actionEngines.test.ts`
 * asserts the two lists agree, so the duplication cannot drift.
 */
const WORKER_OPS_WITH_ENGINES = new Set<ActionId>([
  'video.grade',
  'video.filter',
  'video.effect',
  'video.blur',
  'video.speed',
  'video.kenBurns',
  'video.stitch',
  'video.split',
  'video.crop',
  'video.pad',
  'video.greenscreen',
  'video.reverse',
  'video.boomerang',
]);

/**
 * Ops that orchestrate on the MAIN thread (authenticated network I/O) and hand the
 * render to the worker themselves — they must not route through `start_action`.
 * The dynamic import keeps mediabunny out of the page bundle just so a node can
 * decide whether to enable its Run button.
 */
const ORCHESTRATED_OPS: Partial<Record<ActionId, SyncOp>> = {
  'video.subtitles': (args, config) =>
    import('./subtitlesOp').then((m) => m.runSubtitlesAction(args, config)),
  // Both cutout ops sit here rather than in SYNC_OPS/WORKER_OPS because the matting
  // runs on a GPU in Cloud Run: the runner's whole job is an authenticated call and
  // an SSE read. Note `image.removeBackground` declares `execution: 'sync'` to satisfy
  // the registry's worker⟺video invariant — this map is consulted first, so the
  // declaration never decides where it actually runs.
  'image.removeBackground': (args, config) =>
    import('./removeBackgroundOp').then((m) => m.runRemoveImageBackground(args, config)),
  // Live since 2026-08-31: the L4 quota landed and `continuum-matte-video` is
  // deployed in us-central1 running BiRefNet-portrait at stride 3 — the operating
  // point `matte:video:matrix` picked, at $0.0096 and 32s of task life for a 4s clip.
  //
  // It stays orchestrated rather than worker-side for the same reason as the image
  // op: the matting is a GPU job in Cloud Run, so the runner's whole job is an
  // authenticated call and an SSE read. That stream now carries real frame-by-frame
  // progress from the job, which matters here more than anywhere else in the canvas —
  // a clip spends its first ~3 minutes on Cloud Run scheduling and an image pull.
  'video.removeBackground': (args, config) =>
    import('./removeBackgroundOp').then((m) => m.runRemoveVideoBackground(args, config)),
};

/**
 * Every op with a runner today. The node UI greys out the rest rather than lying.
 *
 * Note what this must NOT be: `execution === 'worker'` is a statement about WHERE an op
 * would run, not about whether anything runs it. Treating the whole worker half as
 * implemented put an enabled Run button on all nineteen video ops, eighteen of which
 * would fail inside the worker — the precise failure this function exists to prevent.
 */
export function isImplementedAction(actionId: ActionId): boolean {
  return (
    actionId in SYNC_OPS ||
    actionId in ORCHESTRATED_OPS ||
    WORKER_OPS_WITH_ENGINES.has(actionId) ||
    isOverlayActionId(actionId)
  );
}

export async function runAction(args: RunActionArgs): Promise<NodeOutput> {
  const def = ACTION_DEFS[args.actionId];
  // The trust boundary. Every op's schema parses from `{}`, so an unconfigured node
  // gets the op's defaults instead of a crash, and a hand-edited canvas row cannot
  // smuggle an out-of-range value past the op.
  const config = parseActionConfig(args.actionId, args.config);

  const orchestrated = ORCHESTRATED_OPS[args.actionId];
  if (orchestrated) return orchestrated(args, config);

  // The burn-in pair builds its plan on the MAIN thread and posts `start_timeline`
  // rather than `start_action`: the corner arithmetic needs both aspect ratios, and
  // they are the only worker ops with an IMAGE port — which the branch below cannot
  // feed, because it demands bytes on every port while `resolveActionInputsFor`
  // resolves image ports to a URL.
  if (isOverlayActionId(args.actionId)) return runOverlayAction(args, config);

  if (def.execution === 'worker') {
    // ONE ENTRY PER WIRE, not per port. `def.inputs` is the PORT list, so mapping it
    // handed a `max: 20` port exactly one blob however many clips the resolver had
    // already put on that handle — and `video.stitch` died on "received 1 clip" with
    // two clips visibly connected (#304). The resolver was fixed in wave 1; this is the
    // bridge that threw its work away on the way to the worker.
    const inputs = def.inputs.flatMap((port) => {
      const wired = inputsFor(args, port.handle);
      if (wired.length === 0)
        throw new Error(`Nothing is connected to this action's "${port.handle}" input`);
      return wired.map((resolved) => {
        if (!resolved.blob) throw new Error(`The input on "${port.handle}" has no readable bytes`);
        return { handle: port.handle, blob: resolved.blob };
      });
    });
    const result = await runActionInWorker({
      actionId: args.actionId,
      inputs,
      config,
      signal: args.signal,
      onProgress: ({ progress }) => args.onProgress?.(progress),
    });
    // A collection op (video.split) sends every part alongside the first-part result
    // frame; the batch fan-out loops over the items like any other collection.
    if (actionDef(args.actionId)?.outputsCollection && result.parts) {
      // The client already minted a URL for the first-part blob; the collection mints
      // its own per item, so release the unused one instead of pinning the bytes.
      URL.revokeObjectURL(result.objectUrl);
      return {
        type: 'collection',
        itemType: 'video',
        items: result.parts.map((part) => ({
          type: 'video',
          url: URL.createObjectURL(part.blob),
          sizeBytes: part.blob.size,
        })),
      };
    }
    return { type: 'video', url: result.objectUrl, sizeBytes: result.blob.size };
  }

  const op = SYNC_OPS[args.actionId];
  if (!op) throw new Error(`${def.label} is not implemented yet`);
  return op(args, config);
}
