import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import type { ClipEffectSpec } from '../utils/render/effectSpec';
import type { ClipTransition } from '../utils/render/transitions';
import type { CaptionCue, CaptionWord } from '../utils/splice/captionCues';

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
  volume?: number;
  audioFadeInSec?: number;
  audioFadeOutSec?: number;
  effects?: ClipEffectSpec;
  transition?: ClipTransition;
};

// One overlay-track placement. Structurally matches composeTimeline's
// TimelineOverlayRenderItem so it passes straight through the worker.
export type TimelineOverlayWorkerItem = {
  itemId: string;
  kind: 'video' | 'image';
  blob: Blob;
  startSec: number;
  trimStartSec?: number;
  trimEndSec?: number;
  durationSec?: number;
  muteAudio?: boolean;
  volume?: number;
  audioFadeInSec?: number;
  audioFadeOutSec?: number;
  effects?: ClipEffectSpec;
};

export type TimelineAudioWorkerItem = {
  itemId: string;
  blob: Blob;
  startSec: number;
  trimStartSec?: number;
  trimEndSec?: number;
  volume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
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
      overlays?: TimelineOverlayWorkerItem[];
      audioTracks?: TimelineAudioWorkerItem[];
      videoBitrate?: number;
      audioBitrate?: number;
      targetWidth?: number;
      targetHeight?: number;
      // Auto-caption words (output-time) + style, burned in when present.
      captionCues?: CaptionCue[];
      captionWords?: CaptionWord[];
      captionStyle?: CaptionStyle;
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
