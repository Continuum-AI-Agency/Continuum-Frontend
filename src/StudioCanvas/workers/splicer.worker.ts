/// <reference lib="webworker" />

import { ACTION_DEFS } from '@continuum/contracts';
import { actionEngine } from '../utils/splice/actionEngines';
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

  activeAbortController = new AbortController();

  try {
    const result = await spliceSingleSource({
      blob: input.blob,
      ranges: input.ranges,
      maxShortEdgePx: input.maxShortEdgePx,
      captionWords: input.captionWords,
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

  activeAbortController = new AbortController();

  try {
    const result = await composeTimeline({
      items: input.items,
      overlays: input.overlays,
      audioTracks: input.audioTracks,
      videoBitrate: input.videoBitrate,
      audioBitrate: input.audioBitrate,
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
    const engine = actionEngine(input.actionId);
    // The trust boundary for stored node config. Every op's schema parses from `{}`,
    // so an unconfigured node gets the op's defaults rather than a crash — and a
    // hand-edited canvas row cannot smuggle an out-of-range value into the encoder.
    const config = ACTION_DEFS[input.actionId].config.parse(input.config ?? {}) as Record<
      string,
      unknown
    >;
    const result = await engine({
      inputs: input.inputs,
      config,
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
