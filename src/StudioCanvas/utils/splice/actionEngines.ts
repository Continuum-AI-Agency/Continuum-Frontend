import { ACTION_DEFS, type ActionId } from '@continuum/contracts';
import type { TimelineWorkerItem } from '../../workers/spliceWorkerProtocol';
import { composeTimeline } from './composeTimeline';
import type { SpliceProgress } from './spliceClips';

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

const videoSpeed: ActionEngine = async (args) => {
  const result = await composeTimeline({
    items: [speedTimelineItem(requireInput(args, 'in'), args.config)],
    videoBitrate: args.videoBitrate,
    audioBitrate: args.audioBitrate,
    signal: args.signal,
    onProgress: args.onProgress,
  });
  return {
    blob: result.blob,
    width: result.width,
    height: result.height,
    durationSec: result.durationSec,
  };
};

/**
 * Deliberately near-empty. Canvas V3 declares all 32 ops up front so the menu, the node
 * and the graph rules agree from day one; an op with no engine simply has no entry, and
 * `actionEngine()` refuses it by name instead of failing somewhere deep in mediabunny.
 * Wave 3's `a-actions-video` shell fills the rest.
 */
export const ACTION_ENGINES: Partial<Record<ActionId, ActionEngine>> = {
  'video.speed': videoSpeed,
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
