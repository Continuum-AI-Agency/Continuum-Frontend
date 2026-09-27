'use client';

// How review surfaces label a moment in a video: wall-clock (m:ss), SMPTE source
// timecode (the file's own start timecode plus the frame, drop-frame when the file
// counts that way — what the editor's timeline shows), or a bare frame number.
// One per-viewer preference shared by the player, the comment list and the editor
// view, remembered in localStorage (a convenience: losing it only resets the view).

import { useSyncExternalStore } from 'react';
import { formatTimecode } from '@/components/library/detail/annotationGeometry';
import {
  type FrameRate,
  frameAtMs,
  type SourceTimecode,
  sourceTimecodeAtMs,
} from '@/lib/library/commentExport';

export const TIMECODE_DISPLAY_MODES = ['clock', 'smpte', 'frames'] as const;
export type TimecodeDisplayMode = (typeof TIMECODE_DISPLAY_MODES)[number];

export const TIMECODE_MODE_LABELS: Record<TimecodeDisplayMode, string> = {
  clock: 'm:ss',
  smpte: 'Timecode',
  frames: 'Frames',
};

const STORAGE_KEY = 'library.review.timecodeDisplay';
const listeners = new Set<() => void>();
let current: TimecodeDisplayMode | null = null;

function read(): TimecodeDisplayMode {
  if (current) return current;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    current = TIMECODE_DISPLAY_MODES.find((mode) => mode === stored) ?? 'clock';
  } catch {
    current = 'clock';
  }
  return current;
}

export function setTimecodeDisplay(mode: TimecodeDisplayMode) {
  current = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
  for (const listener of listeners) listener();
}

export function nextTimecodeDisplay(mode: TimecodeDisplayMode): TimecodeDisplayMode {
  return TIMECODE_DISPLAY_MODES[
    (TIMECODE_DISPLAY_MODES.indexOf(mode) + 1) % TIMECODE_DISPLAY_MODES.length
  ] as TimecodeDisplayMode;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTimecodeDisplay(): TimecodeDisplayMode {
  return useSyncExternalStore(subscribe, read, () => 'clock');
}

// The label for a moment. SMPTE and frames need the file's rate; until it is
// known the label stays wall-clock rather than guessing a rate.
export function formatStageTime(
  ms: number,
  mode: TimecodeDisplayMode,
  rate: FrameRate | null,
  source: SourceTimecode | null,
): string {
  if (mode === 'clock' || !rate) return formatTimecode(ms);
  if (mode === 'frames') return `f${frameAtMs(ms, rate)}`;
  return sourceTimecodeAtMs(ms, rate, source ?? undefined);
}

export function formatStageRange(
  timeMs: number,
  endMs: number | null,
  mode: TimecodeDisplayMode,
  rate: FrameRate | null,
  source: SourceTimecode | null,
): string {
  const start = formatStageTime(timeMs, mode, rate, source);
  return endMs === null ? start : `${start}–${formatStageTime(endMs, mode, rate, source)}`;
}
