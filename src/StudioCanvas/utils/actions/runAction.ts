import { ACTION_DEFS, type ActionId } from '@continuum/contracts';
import type { NodeOutput } from '../../types/execution';
import { runActionInWorker } from '../../workers/spliceWorkerClient';
import { parseDataUrl } from '../dataUrl';
import { parseActionConfig } from './actionConfig';
import { canvasToDataUrl, type DrawableImage, rotateImage } from './imageOps';
import { findReplace } from './textOps';

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
}

export interface RunActionArgs {
  actionId: ActionId;
  inputs: ResolvedActionInput[];
  /** Raw `node.data.config`; parsed against the op's schema before anything runs. */
  config: unknown;
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

/**
 * The in-page ops. `frameExtract`'s executor branch is the shape being followed:
 * resolve the input, do the work locally, hand back an output — no network, no worker.
 *
 * Three entries this wave, one per execution class, so the whole seam is proven:
 * an image op, a text op, and (via the worker table) a video op. Wave 3's action
 * shells add rows here and in `utils/splice/actionEngines.ts`; neither of them has to
 * touch this dispatcher, the protocol, or the executor.
 */
const SYNC_OPS: Partial<Record<ActionId, SyncOp>> = {
  'image.rotate': async (args, config) => {
    const image = await loadImage(inputFor(args, 'in'));
    const rotated = await rotateImage(image, config.degrees as number);
    const dataUrl = await canvasToDataUrl(rotated);
    const parsed = parseDataUrl(dataUrl);
    return {
      type: 'image',
      base64: parsed?.base64 ?? '',
      mimeType: parsed?.mimeType ?? 'image/png',
    };
  },
  'text.findReplace': async (args, config) => ({
    type: 'text',
    value: findReplace(inputFor(args, 'in').text ?? '', {
      find: config.find as string,
      replace: config.replace as string,
      caseSensitive: config.caseSensitive as boolean,
    }),
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
const WORKER_OPS_WITH_ENGINES = new Set<ActionId>(['video.speed']);

/**
 * Every op with a runner today. The node UI greys out the rest rather than lying.
 *
 * Note what this must NOT be: `execution === 'worker'` is a statement about WHERE an op
 * would run, not about whether anything runs it. Treating the whole worker half as
 * implemented put an enabled Run button on all nineteen video ops, eighteen of which
 * would fail inside the worker — the precise failure this function exists to prevent.
 */
export function isImplementedAction(actionId: ActionId): boolean {
  return actionId in SYNC_OPS || WORKER_OPS_WITH_ENGINES.has(actionId);
}

export async function runAction(args: RunActionArgs): Promise<NodeOutput> {
  const def = ACTION_DEFS[args.actionId];
  // The trust boundary. Every op's schema parses from `{}`, so an unconfigured node
  // gets the op's defaults instead of a crash, and a hand-edited canvas row cannot
  // smuggle an out-of-range value past the op.
  const config = parseActionConfig(args.actionId, args.config);

  if (def.execution === 'worker') {
    const inputs = def.inputs.map((port) => {
      const resolved = inputFor(args, port.handle);
      if (!resolved.blob) throw new Error(`The input on "${port.handle}" has no readable bytes`);
      return { handle: port.handle, blob: resolved.blob };
    });
    const result = await runActionInWorker({
      actionId: args.actionId,
      inputs,
      config,
      signal: args.signal,
      onProgress: ({ progress }) => args.onProgress?.(progress),
    });
    return { type: 'video', url: result.objectUrl, sizeBytes: result.blob.size };
  }

  const op = SYNC_OPS[args.actionId];
  if (!op) throw new Error(`${def.label} is not implemented yet`);
  return op(args, config);
}
