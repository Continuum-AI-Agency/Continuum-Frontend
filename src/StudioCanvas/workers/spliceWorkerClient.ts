import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import type { CaptionCue, CaptionWord } from '../utils/splice/captionCues';
import type {
  SingleSourceWorkerRange,
  SpliceWorkerInbound,
  SpliceWorkerOutbound,
  TimelineOverlayWorkerItem,
  TimelineWorkerItem,
  WorkerClipInput,
} from './spliceWorkerProtocol';

export type WorkerSpliceProgress = {
  progress: number;
  processedClips: number;
  totalClips: number;
};

export type RunSpliceInWorkerOptions = {
  clips: WorkerClipInput[];
  videoBitrate?: number;
  audioBitrate?: number;
  signal?: AbortSignal;
  onProgress?: (progress: WorkerSpliceProgress) => void;
  workerFactory?: () => Worker;
};

export type RunSingleSourceSpliceInWorkerOptions = {
  blob: Blob;
  ranges: SingleSourceWorkerRange[];
  maxShortEdgePx?: number;
  captionWords?: CaptionWord[];
  captionStyle?: CaptionStyle;
  videoBitrate?: number;
  audioBitrate?: number;
  signal?: AbortSignal;
  onProgress?: (progress: WorkerSpliceProgress) => void;
  workerFactory?: () => Worker;
};

export type RunTimelineInWorkerOptions = {
  items: TimelineWorkerItem[];
  overlays?: TimelineOverlayWorkerItem[];
  videoBitrate?: number;
  audioBitrate?: number;
  targetWidth?: number;
  targetHeight?: number;
  captionCues?: CaptionCue[];
  captionWords?: CaptionWord[];
  captionStyle?: CaptionStyle;
  signal?: AbortSignal;
  onProgress?: (progress: WorkerSpliceProgress) => void;
  workerFactory?: () => Worker;
};

export type WorkerSpliceResult = {
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
  durationSec: number;
};

type WorkerJobOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: WorkerSpliceProgress) => void;
  workerFactory?: () => Worker;
};

const TERMINATE_GRACE_MS = 100;

function createDefaultWorker(): Worker {
  return new Worker(new URL('./splicer.worker.ts', import.meta.url), {
    type: 'module',
    name: 'studio-splicer',
  });
}

// Shared worker lifecycle: spawn, relay progress, resolve on result, reject on
// support/error/crash/abort. The start message (a `start` or `start_single_source`
// frame) is the only difference between the two public entry points.
function runWorkerJob(
  startMessage: Extract<
    SpliceWorkerInbound,
    { kind: 'start' | 'start_single_source' | 'start_timeline' }
  >,
  options: WorkerJobOptions,
): Promise<WorkerSpliceResult> {
  const { signal, onProgress, workerFactory } = options;

  return new Promise<WorkerSpliceResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Splice aborted', 'AbortError'));
      return;
    }

    const worker = (workerFactory ?? createDefaultWorker)();
    let settled = false;
    let terminateTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      worker.removeEventListener('message', onMessage as EventListener);
      worker.removeEventListener('error', onError as EventListener);
      worker.removeEventListener('messageerror', onMessageError as EventListener);
      signal?.removeEventListener('abort', onAbort);
      if (terminateTimer) {
        clearTimeout(terminateTimer);
        terminateTimer = null;
      }
    };

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onMessage = (event: MessageEvent<SpliceWorkerOutbound>) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;

      switch (message.kind) {
        case 'progress':
          onProgress?.({
            progress: message.progress,
            processedClips: message.processedClips,
            totalClips: message.totalClips,
          });
          return;
        case 'result':
          settle(() => {
            const objectUrl = URL.createObjectURL(message.blob);
            worker.terminate();
            resolve({
              blob: message.blob,
              objectUrl,
              width: message.width,
              height: message.height,
              durationSec: message.durationSec,
            });
          });
          return;
        case 'support':
          settle(() => {
            worker.terminate();
            reject(new Error(message.reason));
          });
          return;
        case 'error':
          settle(() => {
            worker.terminate();
            reject(new Error(message.message));
          });
          return;
      }
    };

    const onError = (event: ErrorEvent) => {
      settle(() => {
        worker.terminate();
        reject(new Error(event.message || 'Worker crashed'));
      });
    };

    const onMessageError = () => {
      settle(() => {
        worker.terminate();
        reject(new Error('Worker message could not be deserialized'));
      });
    };

    const onAbort = () => {
      settle(() => {
        try {
          worker.postMessage({ kind: 'cancel' } satisfies SpliceWorkerInbound);
        } catch {
          // worker may already be dead — fall through to terminate
        }
        terminateTimer = setTimeout(() => {
          worker.terminate();
        }, TERMINATE_GRACE_MS);
        reject(new DOMException('Splice aborted', 'AbortError'));
      });
    };

    worker.addEventListener('message', onMessage as EventListener);
    worker.addEventListener('error', onError as EventListener);
    worker.addEventListener('messageerror', onMessageError as EventListener);
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.postMessage(startMessage satisfies SpliceWorkerInbound);
  });
}

export function runSpliceInWorker(options: RunSpliceInWorkerOptions): Promise<WorkerSpliceResult> {
  const { clips, videoBitrate, audioBitrate } = options;
  if (clips.length < 2) {
    return Promise.reject(new Error('Splice requires at least two clips'));
  }
  return runWorkerJob({ kind: 'start', clips, videoBitrate, audioBitrate }, options);
}

export function runSingleSourceSpliceInWorker(
  options: RunSingleSourceSpliceInWorkerOptions,
): Promise<WorkerSpliceResult> {
  const { blob, ranges, maxShortEdgePx, captionWords, captionStyle, videoBitrate, audioBitrate } =
    options;
  if (ranges.length < 1) {
    return Promise.reject(new Error('Single-source splice requires at least one range'));
  }
  return runWorkerJob(
    {
      kind: 'start_single_source',
      blob,
      ranges,
      maxShortEdgePx,
      captionWords,
      captionStyle,
      videoBitrate,
      audioBitrate,
    },
    options,
  );
}

export function runTimelineInWorker(
  options: RunTimelineInWorkerOptions,
): Promise<WorkerSpliceResult> {
  const {
    items,
    overlays,
    videoBitrate,
    audioBitrate,
    targetWidth,
    targetHeight,
    captionCues,
    captionWords,
    captionStyle,
  } = options;
  if (items.length < 1) {
    return Promise.reject(new Error('Timeline requires at least one item'));
  }
  return runWorkerJob(
    {
      kind: 'start_timeline',
      items,
      overlays,
      videoBitrate,
      audioBitrate,
      targetWidth,
      targetHeight,
      captionCues,
      captionWords,
      captionStyle,
    },
    options,
  );
}
