export type WorkerClipInput = {
  slotId: string;
  blob: Blob;
  trimStartSec?: number;
  trimEndSec?: number;
  muteAudio?: boolean;
};

export type SpliceWorkerInbound =
  | {
      kind: 'start';
      clips: WorkerClipInput[];
      videoBitrate?: number;
      audioBitrate?: number;
    }
  | { kind: 'cancel' };

export type SpliceWorkerOutbound =
  | {
      kind: 'progress';
      progress: number;
      processedClips: number;
      totalClips: number;
    }
  | { kind: 'support'; ok: false; reason: string }
  | {
      kind: 'result';
      blob: Blob;
      width: number;
      height: number;
      durationSec: number;
    }
  | { kind: 'error'; message: string };
