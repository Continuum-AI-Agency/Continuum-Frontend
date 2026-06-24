import type { CaptionWord } from '../utils/splice/captionCues';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';

export type WorkerClipInput = {
  slotId: string;
  blob: Blob;
  trimStartSec?: number;
  trimEndSec?: number;
  muteAudio?: boolean;
};

export type SingleSourceWorkerRange = {
  startSec: number;
  endSec: number;
  muteAudio?: boolean;
};

// One resolved Video Editor (timelineEditor) item. Structurally matches
// composeTimeline's TimelineRenderItem so it passes straight through.
export type TimelineWorkerItem = {
  itemId: string;
  kind: 'video' | 'image';
  blob: Blob;
  trimStartSec?: number;
  trimEndSec?: number;
  durationSec?: number;
  muteAudio?: boolean;
};

export type SpliceWorkerInbound =
  | {
      kind: 'start';
      clips: WorkerClipInput[];
      videoBitrate?: number;
      audioBitrate?: number;
    }
  | {
      kind: 'start_single_source';
      blob: Blob;
      ranges: SingleSourceWorkerRange[];
      maxShortEdgePx?: number;
      captionWords?: CaptionWord[];
      captionStyle?: CaptionStyle;
      videoBitrate?: number;
      audioBitrate?: number;
    }
  | {
      kind: 'start_timeline';
      items: TimelineWorkerItem[];
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
