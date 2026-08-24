import type { ActionId } from '@continuum/contracts';
import type { CaptionFontPayload } from '@/lib/clips/captionFonts';
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
  speed?: number;
  volume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
};

// WOFF2 bytes ride WITH the job rather than being fetched worker-side: a worker has no
// document.fonts to inherit, and a caption drawn before its face is registered silently
// renders in Helvetica. They cross by structured clone, deliberately NOT in a transfer
// list — a transfer detaches the buffer on the main thread, and the page's own cache has
// to survive its document.fonts registration plus every repeat render.
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
      // Already grouped and already on the OUTPUT timeline. Wins over captionWords, the
      // same way start_timeline's cues do. Without this a preset's `grouping` cannot reach
      // the render at all: the worker would re-group the raw words at the engine default
      // of 6 words / 3.5s and every preset would come out with the same line lengths.
      captionCues?: CaptionCue[];
      captionStyle?: CaptionStyle;
      captionFonts?: CaptionFontPayload[];
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
      frameRate?: number;
      targetWidth?: number;
      targetHeight?: number;
      // Auto-caption words (output-time) + style, burned in when present.
      captionCues?: CaptionCue[];
      captionWords?: CaptionWord[];
      captionStyle?: CaptionStyle;
      captionFonts?: CaptionFontPayload[];
    }
  | {
      // ONE inbound op for the whole action catalog. A per-op message kind would put
      // this file back in every action shell's diff; the registry in
      // `utils/splice/actionEngines.ts` is what grows instead.
      kind: 'start_action';
      actionId: ActionId;
      // Handle-keyed rather than a single `blob`: `video.greenscreen`,
      // `video.watermark` and `video.overlay` are already in the shipped catalog with
      // TWO input ports, and widening the payload later would mean a protocol change
      // in a file the design freezes after this wave.
      inputs: { handle: string; blob: Blob }[];
      /** Raw `node.data.config`; the worker parses it against the op's own schema. */
      config: Record<string, unknown>;
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
      // Set only by `outputsCollection` ops (today: video.split). The top-level fields
      // stay the FIRST part so every single-result consumer keeps working unchanged.
      parts?: { blob: Blob; width: number; height: number; durationSec: number }[];
    }
  | { kind: 'error'; message: string };
