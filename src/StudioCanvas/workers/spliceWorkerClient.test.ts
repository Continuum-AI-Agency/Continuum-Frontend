import { afterEach, describe, expect, it } from 'bun:test';
import {
  runActionInWorker,
  runSingleSourceSpliceInWorker,
  runSpliceInWorker,
  runTimelineInWorker,
  setTimelineExportCodecPreference,
} from './spliceWorkerClient';
import type {
  SpliceWorkerInbound,
  SpliceWorkerOutbound,
  TimelineWorkerItem,
  WorkerClipInput,
} from './spliceWorkerProtocol';

type Listener = (event: unknown) => void;

class FakeWorker {
  posted: SpliceWorkerInbound[] = [];
  terminated = false;
  private messageListeners = new Set<Listener>();
  private errorListeners = new Set<Listener>();
  private messageErrorListeners = new Set<Listener>();

  addEventListener(type: string, listener: Listener): void {
    if (type === 'message') this.messageListeners.add(listener);
    else if (type === 'error') this.errorListeners.add(listener);
    else if (type === 'messageerror') this.messageErrorListeners.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    if (type === 'message') this.messageListeners.delete(listener);
    else if (type === 'error') this.errorListeners.delete(listener);
    else if (type === 'messageerror') this.messageErrorListeners.delete(listener);
  }

  postMessage(message: SpliceWorkerInbound): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: SpliceWorkerOutbound): void {
    const event = { data: message };
    for (const listener of this.messageListeners) listener(event);
  }

  emitError(message: string): void {
    const event = { message };
    for (const listener of this.errorListeners) listener(event);
  }

  emitMessageError(): void {
    const event = {};
    for (const listener of this.messageErrorListeners) listener(event);
  }
}

const fakeBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });

function makeClips(count = 2): WorkerClipInput[] {
  return Array.from({ length: count }, (_, index) => ({
    slotId: `slot-${index}`,
    blob: new Blob([new Uint8Array([index])], { type: 'video/mp4' }),
  }));
}

describe('runSpliceInWorker', () => {
  it('rejects synchronously when fewer than two clips are supplied', async () => {
    await expect(runSpliceInWorker({ clips: makeClips(1) })).rejects.toThrow(/at least two clips/i);
  });

  it('posts a start message with the supplied clips and bitrates', async () => {
    const worker = new FakeWorker();
    const promise = runSpliceInWorker({
      clips: makeClips(2),
      videoBitrate: 1_000_000,
      audioBitrate: 128_000,
      workerFactory: () => worker as unknown as Worker,
    });

    expect(worker.posted).toHaveLength(1);
    const message = worker.posted[0];
    expect(message.kind).toBe('start');
    if (message.kind === 'start') {
      expect(message.clips).toHaveLength(2);
      expect(message.videoBitrate).toBe(1_000_000);
      expect(message.audioBitrate).toBe(128_000);
    }

    worker.emit({
      kind: 'result',
      blob: fakeBlob,
      width: 1920,
      height: 1080,
      durationSec: 6,
    });

    await promise;
  });

  it('forwards progress messages to the onProgress callback', async () => {
    const worker = new FakeWorker();
    const events: Array<{ progress: number; processedClips: number; totalClips: number }> = [];

    const promise = runSpliceInWorker({
      clips: makeClips(),
      onProgress: (p) => events.push(p),
      workerFactory: () => worker as unknown as Worker,
    });

    worker.emit({ kind: 'progress', progress: 0.25, processedClips: 0, totalClips: 2 });
    worker.emit({ kind: 'progress', progress: 0.75, processedClips: 1, totalClips: 2 });
    worker.emit({ kind: 'result', blob: fakeBlob, width: 640, height: 360, durationSec: 4 });

    await promise;

    expect(events).toEqual([
      { progress: 0.25, processedClips: 0, totalClips: 2 },
      { progress: 0.75, processedClips: 1, totalClips: 2 },
    ]);
  });

  it('resolves with blob, objectUrl, and dimensions on result', async () => {
    const worker = new FakeWorker();
    const promise = runSpliceInWorker({
      clips: makeClips(),
      workerFactory: () => worker as unknown as Worker,
    });

    worker.emit({ kind: 'result', blob: fakeBlob, width: 1280, height: 720, durationSec: 8 });

    const result = await promise;
    expect(result.blob).toBe(fakeBlob);
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(result.durationSec).toBe(8);
    expect(result.objectUrl).toMatch(/^blob:/);
    expect(worker.terminated).toBe(true);

    URL.revokeObjectURL(result.objectUrl);
  });

  it('rejects with the reported reason on a support message', async () => {
    const worker = new FakeWorker();
    const promise = runSpliceInWorker({
      clips: makeClips(),
      workerFactory: () => worker as unknown as Worker,
    });

    worker.emit({ kind: 'support', ok: false, reason: 'WebCodecs missing in worker scope' });

    await expect(promise).rejects.toThrow(/WebCodecs missing in worker scope/);
    expect(worker.terminated).toBe(true);
  });

  it('rejects with the message on an error event', async () => {
    const worker = new FakeWorker();
    const promise = runSpliceInWorker({
      clips: makeClips(),
      workerFactory: () => worker as unknown as Worker,
    });

    worker.emit({ kind: 'error', message: 'Clip 2 has no video track' });

    await expect(promise).rejects.toThrow(/Clip 2 has no video track/);
    expect(worker.terminated).toBe(true);
  });

  it('rejects when the worker itself crashes via the error event', async () => {
    const worker = new FakeWorker();
    const promise = runSpliceInWorker({
      clips: makeClips(),
      workerFactory: () => worker as unknown as Worker,
    });

    worker.emitError('uncaught: oom');

    await expect(promise).rejects.toThrow(/oom/);
    expect(worker.terminated).toBe(true);
  });

  it('posts cancel and terminates when the abort signal fires', async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const promise = runSpliceInWorker({
      clips: makeClips(),
      signal: controller.signal,
      workerFactory: () => worker as unknown as Worker,
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    const cancelMessage = worker.posted.find((m) => m.kind === 'cancel');
    expect(cancelMessage).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(worker.terminated).toBe(true);
  });

  it('rejects synchronously if the signal is already aborted before invocation', async () => {
    const controller = new AbortController();
    controller.abort();
    let factoryCalled = false;
    await expect(
      runSpliceInWorker({
        clips: makeClips(),
        signal: controller.signal,
        workerFactory: () => {
          factoryCalled = true;
          return new FakeWorker() as unknown as Worker;
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(factoryCalled).toBe(false);
  });
});

describe('runTimelineInWorker export codec', () => {
  const items: TimelineWorkerItem[] = [{ itemId: 'item-1', kind: 'video', blob: fakeBlob }];
  const finish = async (worker: FakeWorker, promise: Promise<{ objectUrl: string }>) => {
    worker.emit({ kind: 'result', blob: fakeBlob, width: 640, height: 360, durationSec: 2 });
    URL.revokeObjectURL((await promise).objectUrl);
  };

  afterEach(() => setTimelineExportCodecPreference(null));

  it('threads videoCodec and container into the start_timeline frame', async () => {
    const worker = new FakeWorker();
    const promise = runTimelineInWorker({
      items,
      videoCodec: 'vp9',
      container: 'webm',
      workerFactory: () => worker as unknown as Worker,
    });

    const message = worker.posted[0];
    expect(message.kind).toBe('start_timeline');
    if (message.kind === 'start_timeline') {
      expect(message.videoCodec).toBe('vp9');
      expect(message.container).toBe('webm');
    }
    await finish(worker, promise);
  });

  it('leaves both fields unset when nothing chose a codec (prior behavior)', async () => {
    const worker = new FakeWorker();
    const promise = runTimelineInWorker({
      items,
      workerFactory: () => worker as unknown as Worker,
    });

    const message = worker.posted[0];
    if (message.kind === 'start_timeline') {
      expect(message.videoCodec).toBeUndefined();
      expect(message.container).toBeUndefined();
    }
    await finish(worker, promise);
  });

  it('fills unset fields from the dialog preference, and explicit options win', async () => {
    setTimelineExportCodecPreference({ videoCodec: 'hevc', container: 'mp4' });

    const preferred = new FakeWorker();
    const preferredPromise = runTimelineInWorker({
      items,
      workerFactory: () => preferred as unknown as Worker,
    });
    const preferredMessage = preferred.posted[0];
    if (preferredMessage.kind === 'start_timeline') {
      expect(preferredMessage.videoCodec).toBe('hevc');
      expect(preferredMessage.container).toBe('mp4');
    }
    await finish(preferred, preferredPromise);

    const explicit = new FakeWorker();
    const explicitPromise = runTimelineInWorker({
      items,
      videoCodec: 'avc',
      container: 'mp4',
      workerFactory: () => explicit as unknown as Worker,
    });
    const explicitMessage = explicit.posted[0];
    if (explicitMessage.kind === 'start_timeline') {
      expect(explicitMessage.videoCodec).toBe('avc');
    }
    await finish(explicit, explicitPromise);
  });
});

describe('runActionInWorker', () => {
  it('passes a collection result frame’s parts through to the caller', async () => {
    const worker = new FakeWorker();
    const promise = runActionInWorker({
      actionId: 'video.split',
      inputs: [{ handle: 'in', blob: fakeBlob }],
      config: {},
      workerFactory: () => worker as unknown as Worker,
    });

    const parts = [
      { blob: new Blob([new Uint8Array([1])]), width: 640, height: 360, durationSec: 2 },
      { blob: new Blob([new Uint8Array([2])]), width: 640, height: 360, durationSec: 3 },
    ];
    worker.emit({
      kind: 'result',
      blob: parts[0].blob,
      width: 640,
      height: 360,
      durationSec: 2,
      parts,
    });

    const result = await promise;
    expect(result.parts).toEqual(parts);
    expect(result.blob).toBe(parts[0].blob);
    URL.revokeObjectURL(result.objectUrl);
  });

  it('leaves parts undefined on a single-blob result frame', async () => {
    const worker = new FakeWorker();
    const promise = runActionInWorker({
      actionId: 'video.reverse',
      inputs: [{ handle: 'in', blob: fakeBlob }],
      config: {},
      workerFactory: () => worker as unknown as Worker,
    });

    worker.emit({ kind: 'result', blob: fakeBlob, width: 640, height: 360, durationSec: 3 });

    const result = await promise;
    expect(result.parts).toBeUndefined();
    URL.revokeObjectURL(result.objectUrl);
  });
});

describe('runSingleSourceSpliceInWorker', () => {
  const sourceBlob = new Blob([new Uint8Array([9, 9, 9])], { type: 'video/mp4' });
  const ranges = [
    { startSec: 0, endSec: 12 },
    { startSec: 14, endSec: 30 },
  ];

  it('rejects synchronously when no ranges are supplied', async () => {
    await expect(runSingleSourceSpliceInWorker({ blob: sourceBlob, ranges: [] })).rejects.toThrow(
      /at least one range/i,
    );
  });

  it('posts a start_single_source message with the blob, ranges, quality cap, and bitrates', async () => {
    const worker = new FakeWorker();
    const promise = runSingleSourceSpliceInWorker({
      blob: sourceBlob,
      ranges,
      maxShortEdgePx: 720,
      videoBitrate: 2_000_000,
      audioBitrate: 96_000,
      workerFactory: () => worker as unknown as Worker,
    });

    expect(worker.posted).toHaveLength(1);
    const message = worker.posted[0];
    expect(message.kind).toBe('start_single_source');
    if (message.kind === 'start_single_source') {
      expect(message.blob).toBe(sourceBlob);
      expect(message.ranges).toHaveLength(2);
      expect(message.maxShortEdgePx).toBe(720);
      expect(message.videoBitrate).toBe(2_000_000);
      expect(message.audioBitrate).toBe(96_000);
    }

    worker.emit({ kind: 'result', blob: fakeBlob, width: 720, height: 1280, durationSec: 27 });
    const result = await promise;
    expect(result.objectUrl).toMatch(/^blob:/);
    expect(worker.terminated).toBe(true);
    URL.revokeObjectURL(result.objectUrl);
  });

  it('rejects with the reason on a support message', async () => {
    const worker = new FakeWorker();
    const promise = runSingleSourceSpliceInWorker({
      blob: sourceBlob,
      ranges,
      workerFactory: () => worker as unknown as Worker,
    });
    worker.emit({ kind: 'support', ok: false, reason: 'H.264 unsupported' });
    await expect(promise).rejects.toThrow(/H\.264 unsupported/);
  });

  it('posts cancel and terminates when the abort signal fires', async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const promise = runSingleSourceSpliceInWorker({
      blob: sourceBlob,
      ranges,
      signal: controller.signal,
      workerFactory: () => worker as unknown as Worker,
    });

    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.posted.find((m) => m.kind === 'cancel')).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(worker.terminated).toBe(true);
  });
});
