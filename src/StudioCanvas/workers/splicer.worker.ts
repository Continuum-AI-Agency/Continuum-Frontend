/// <reference lib="webworker" />

import { ACTION_DEFS, actionDef } from '@continuum/contracts';
import { type CaptionFontPayload, registerCaptionFonts } from '@/lib/clips/captionFonts';
import { actionEngine, renderSplitParts } from '../utils/splice/actionEngines';
import { composeTimeline } from '../utils/splice/composeTimeline';
import { spliceClips } from '../utils/splice/spliceClips';
import { spliceSingleSource } from '../utils/splice/spliceSingleSource';
import { checkSpliceSupport } from '../utils/splice/webcodecsSupport';
import type { SpliceWorkerInbound, SpliceWorkerOutbound } from './spliceWorkerProtocol';

declare const self: DedicatedWorkerGlobalScope;

let aborted = false;
let activeAbortController: AbortController | null = null;

function post(message: SpliceWorkerOutbound): void {
  self.postMessage(message);
}

/**
 * Register the job's caption faces on this worker's FontFaceSet BEFORE any frame is drawn.
 *
 * A worker never inherits document.fonts, so without this an OffscreenCanvas resolves
 * `ctx.font = '400 119px "Anton", ...'` straight to Helvetica and does not say so. Six
 * presets whose identity is their typeface would all render identically, and every other
 * check in the system would still be green — which is why the render bench asserts that
 * two registered faces produce different text bounding boxes.
 *
 * registerCaptionFonts is idempotent by family, so calling this per job is cheap after the
 * first. A face that will not parse is dropped rather than failing the render: the caption
 * still draws, in the fallback stack.
 */
async function ensureJobFonts(payloads: CaptionFontPayload[] | undefined): Promise<void> {
  if (!payloads || payloads.length === 0) return;
  await registerCaptionFonts(payloads);
}

async function handleStart(input: Extract<SpliceWorkerInbound, { kind: 'start' }>): Promise<void> {
  const support = await checkSpliceSupport();
  if (!support.ok) {
    post({ kind: 'support', ok: false, reason: support.reason });
    return;
  }

  activeAbortController = new AbortController();

  try {
    const result = await spliceClips({
      clips: input.clips.map((clip) => ({
        slotId: clip.slotId,
        blob: clip.blob,
        trimStartSec: clip.trimStartSec,
        trimEndSec: clip.trimEndSec,
        muteAudio: clip.muteAudio,
      })),
      videoBitrate: input.videoBitrate,
      audioBitrate: input.audioBitrate,
      signal: activeAbortController.signal,
      onProgress: ({ progress, processedClips, totalClips }) => {
        if (aborted) return;
        post({ kind: 'progress', progress, processedClips, totalClips });
      },
    });

    if (aborted) return;

    post({
      kind: 'result',
      blob: result.blob,
      width: result.width,
      height: result.height,
      durationSec: result.durationSec,
    });
  } catch (error) {
    if (aborted) return;
    const message = error instanceof Error ? error.message : String(error);
    post({ kind: 'error', message });
  } finally {
    activeAbortController = null;
  }
}

async function handleStartSingleSource(
  input: Extract<SpliceWorkerInbound, { kind: 'start_single_source' }>,
): Promise<void> {
  const support = await checkSpliceSupport();
  if (!support.ok) {
    post({ kind: 'support', ok: false, reason: support.reason });
    return;
  }

  await ensureJobFonts(input.captionFonts);
  activeAbortController = new AbortController();

  try {
    const result = await spliceSingleSource({
      blob: input.blob,
      ranges: input.ranges,
      maxShortEdgePx: input.maxShortEdgePx,
      captionWords: input.captionWords,
      captionCues: input.captionCues,
      captionStyle: input.captionStyle,
      videoBitrate: input.videoBitrate,
      audioBitrate: input.audioBitrate,
      signal: activeAbortController.signal,
      onProgress: ({ progress, processedClips, totalClips }) => {
        if (aborted) return;
        post({ kind: 'progress', progress, processedClips, totalClips });
      },
    });

    if (aborted) return;

    post({
      kind: 'result',
      blob: result.blob,
      width: result.width,
      height: result.height,
      durationSec: result.durationSec,
    });
  } catch (error) {
    if (aborted) return;
    const message = error instanceof Error ? error.message : String(error);
    post({ kind: 'error', message });
  } finally {
    activeAbortController = null;
  }
}

async function handleStartTimeline(
  input: Extract<SpliceWorkerInbound, { kind: 'start_timeline' }>,
): Promise<void> {
  const support = await checkSpliceSupport();
  if (!support.ok) {
    post({ kind: 'support', ok: false, reason: support.reason });
    return;
  }

  await ensureJobFonts(input.captionFonts);
  activeAbortController = new AbortController();

  try {
    const result = await composeTimeline({
      items: input.items,
      overlays: input.overlays,
      audioTracks: input.audioTracks,
      videoBitrate: input.videoBitrate,
      audioBitrate: input.audioBitrate,
      videoCodec: input.videoCodec,
      container: input.container,
      frameRate: input.frameRate,
      targetWidth: input.targetWidth,
      targetHeight: input.targetHeight,
      captionCues: input.captionCues,
      captionWords: input.captionWords,
      captionStyle: input.captionStyle,
      signal: activeAbortController.signal,
      onProgress: ({ progress, processedClips, totalClips }) => {
        if (aborted) return;
        post({ kind: 'progress', progress, processedClips, totalClips });
      },
    });

    if (aborted) return;

    post({
      kind: 'result',
      blob: result.blob,
      width: result.width,
      height: result.height,
      durationSec: result.durationSec,
    });
  } catch (error) {
    if (aborted) return;
    const message = error instanceof Error ? error.message : String(error);
    post({ kind: 'error', message });
  } finally {
    activeAbortController = null;
  }
}

/**
 * One handler for the whole action catalog. Same envelope as its three siblings —
 * support gate, abort controller, try/catch, result frame — with the body replaced by
 * a registry lookup, so a new video op never edits this file.
 */
async function handleStartAction(
  input: Extract<SpliceWorkerInbound, { kind: 'start_action' }>,
): Promise<void> {
  const support = await checkSpliceSupport();
  if (!support.ok) {
    post({ kind: 'support', ok: false, reason: support.reason });
    return;
  }

  activeAbortController = new AbortController();

  try {
    // The trust boundary for stored node config. Every op's schema parses from `{}`,
    // so an unconfigured node gets the op's defaults rather than a crash — and a
    // hand-edited canvas row cannot smuggle an out-of-range value into the encoder.
    const config = ACTION_DEFS[input.actionId].config.parse(input.config ?? {}) as Record<
      string,
      unknown
    >;
    const engineArgs = {
      inputs: input.inputs,
      config,
      videoBitrate: input.videoBitrate,
      audioBitrate: input.audioBitrate,
      signal: activeAbortController.signal,
      onProgress: (progress: { progress: number; processedClips: number; totalClips: number }) => {
        if (aborted) return;
        post({
          kind: 'progress',
          progress: progress.progress,
          processedClips: progress.processedClips,
          totalClips: progress.totalClips,
        });
      },
    };

    // Collection ops (today: video.split) render every part; the result frame keeps
    // the FIRST part in its top-level fields so single-result consumers stay correct.
    if (actionDef(input.actionId)?.outputsCollection) {
      const parts = await renderSplitParts(engineArgs);
      if (aborted) return;
      const [first] = parts;
      if (!first) throw new Error(`${ACTION_DEFS[input.actionId].label} produced no parts`);
      post({
        kind: 'result',
        blob: first.blob,
        width: first.width,
        height: first.height,
        durationSec: first.durationSec,
        parts,
      });
      return;
    }

    const engine = actionEngine(input.actionId);
    const result = await engine(engineArgs);

    if (aborted) return;

    post({
      kind: 'result',
      blob: result.blob,
      width: result.width,
      height: result.height,
      durationSec: result.durationSec,
    });
  } catch (error) {
    if (aborted) return;
    const message = error instanceof Error ? error.message : String(error);
    post({ kind: 'error', message });
  } finally {
    activeAbortController = null;
  }
}

self.addEventListener('message', (event: MessageEvent<SpliceWorkerInbound>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.kind === 'cancel') {
    aborted = true;
    activeAbortController?.abort();
    return;
  }

  if (message.kind === 'start') {
    void handleStart(message);
    return;
  }

  if (message.kind === 'start_single_source') {
    void handleStartSingleSource(message);
    return;
  }

  if (message.kind === 'start_timeline') {
    void handleStartTimeline(message);
    return;
  }

  if (message.kind === 'start_action') {
    void handleStartAction(message);
  }
});
