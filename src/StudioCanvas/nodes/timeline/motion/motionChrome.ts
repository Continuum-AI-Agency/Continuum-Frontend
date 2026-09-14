export type PlaybackMode = 'once' | 'loop' | 'pingpong';
export type MotionTimeUnit = 's' | 'ms';

export const PLAYBACK_MODES: PlaybackMode[] = ['once', 'loop', 'pingpong'];

export function cyclePlaybackMode(mode: PlaybackMode): PlaybackMode {
  const index = PLAYBACK_MODES.indexOf(mode);
  return PLAYBACK_MODES[(index + 1) % PLAYBACK_MODES.length] ?? 'once';
}

export function formatMotionTime(sec: number, unit: MotionTimeUnit): string {
  const clamped = Math.max(0, sec);
  if (unit === 'ms') return `${Math.round(clamped * 1000)}`;
  const totalMs = Math.round(clamped * 1000);
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function parseMotionTime(value: string, unit: MotionTimeUnit): number | null {
  const trimmed = value.trim();
  if (unit === 'ms') {
    const ms = Number(trimmed);
    return Number.isFinite(ms) ? Math.max(0, ms / 1000) : null;
  }
  const match = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (match) {
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const ms = Number((match[3] ?? '0').padEnd(3, '0'));
    return minutes * 60 + seconds + ms / 1000;
  }
  const asNumber = Number(trimmed);
  return Number.isFinite(asNumber) ? Math.max(0, asNumber) : null;
}

export function nextPlayhead(input: {
  playheadSec: number;
  dtSec: number;
  totalSec: number;
  mode: PlaybackMode;
  direction: 1 | -1;
}): { playheadSec: number; direction: 1 | -1; stop: boolean } {
  if (input.totalSec <= 0) return { playheadSec: 0, direction: 1, stop: true };
  const raw = input.playheadSec + input.dtSec * input.direction;
  if (input.mode === 'once') {
    if (input.direction > 0 && raw >= input.totalSec) {
      return { playheadSec: input.totalSec, direction: 1, stop: true };
    }
    if (input.direction < 0 && raw <= 0) {
      return { playheadSec: 0, direction: 1, stop: true };
    }
    return {
      playheadSec: Math.max(0, Math.min(raw, input.totalSec)),
      direction: input.direction,
      stop: false,
    };
  }
  if (input.mode === 'loop') {
    const wrapped = ((raw % input.totalSec) + input.totalSec) % input.totalSec;
    return { playheadSec: wrapped, direction: 1, stop: false };
  }
  if (raw >= input.totalSec) {
    const overflow = raw - input.totalSec;
    return { playheadSec: Math.max(0, input.totalSec - overflow), direction: -1, stop: false };
  }
  if (raw <= 0) {
    return { playheadSec: Math.min(input.totalSec, -raw), direction: 1, stop: false };
  }
  return { playheadSec: raw, direction: input.direction, stop: false };
}

export const MOTION_STYLE_TONE: Record<string, string> = {
  fade: 'bg-muted text-foreground',
  move: 'bg-primary/15 text-primary',
  scale: 'bg-secondary/20 text-foreground',
  rotate: 'bg-primary/10 text-primary',
};
