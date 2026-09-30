import { spawnSync } from 'node:child_process';
import type { EditorClip, EditorProjectV2 } from '@continuum/contracts';

// Caption timing, judged per frame — never by OCR read-back (read-back fills hidden words).
// Two exports of the same revision, one burning captions and one with captionMode 'none',
// are decoded over the caption band only, and judged twice:
//   · LINES — inside every caption line's window the band differs; outside all of them it
//     matches within encoder noise.
//   · WORDS — the spoken word is filled with the highlight colour, so every word change is
//     a per-frame event: the highlight must jump within a frame of when the project says
//     the next word starts, and be lit exactly while a word is being spoken. The old
//     compositor read clip-relative word times as timeline times: its line windows were
//     right, but its highlight ran early by the clip's start — only the WORDS judge sees it.

export type CaptionWindow = { text: string; startSec: number; endSec: number };

/**
 * When each caption line should be on screen: from its clip's start plus its first word's
 * time to its clip's end (a line holds until its clip ends). Word times are seconds from
 * the clip's own start (editorCaptionWordSchema).
 */
export function captionWindows(project: EditorProjectV2): CaptionWindow[] {
  return project.tracks
    .filter((track) => track.kind === 'caption' && track.enabled && !track.muted)
    .flatMap((track): EditorClip[] => track.clips)
    .flatMap((clip) =>
      clip.kind === 'caption' && clip.enabled
        ? [
            {
              text: clip.text,
              startSec: clip.timelineStartSec + (clip.words[0]?.startSec ?? 0),
              endSec: clip.timelineStartSec + clip.durationSec,
            },
          ]
        : [],
    )
    .sort((left, right) => left.startSec - right.startSec);
}

/**
 * Frame indices to judge. Frame i shows time i/fps; a line is drawn while t ∈ [start, end).
 * Inside frames keep one frame clear of each edge (the frame on an edge may round either
 * way); outside frames keep one frame clear of every window.
 */
export function classifyFrames(frameCount: number, fps: number, windows: CaptionWindow[]) {
  const frame = 1 / fps;
  const at = (index: number) => index / fps;
  const inside = windows.map((window) => {
    const clear: number[] = [];
    for (let index = 0; index < frameCount; index++) {
      const t = at(index);
      if (t >= window.startSec + frame - 1e-9 && t <= window.endSec - frame + 1e-9)
        clear.push(index);
    }
    if (clear.length > 0) return clear;
    const middle = Math.round(((window.startSec + window.endSec) / 2) * fps);
    return middle < frameCount ? [middle] : [];
  });
  const outside: number[] = [];
  for (let index = 0; index < frameCount; index++) {
    const t = at(index);
    if (
      windows.every(
        (window) => t < window.startSec - frame - 1e-9 || t > window.endSec + frame + 1e-9,
      )
    )
      outside.push(index);
  }
  const firstStart = windows[0]?.startSec ?? Number.POSITIVE_INFINITY;
  return { inside, outside, beforeFirst: outside.filter((index) => at(index) < firstStart) };
}

/** Luma pixels that moved more than this are glyph, not encoder noise. */
const STRONG_DELTA = 40;

export type BandScore = { meanAbs: number; strongFrac: number };

export function bandScore(left: Uint8Array, right: Uint8Array): BandScore {
  let sum = 0;
  let strong = 0;
  for (let index = 0; index < left.length; index++) {
    const delta = Math.abs((left[index] ?? 0) - (right[index] ?? 0));
    sum += delta;
    if (delta > STRONG_DELTA) strong += 1;
  }
  return { meanAbs: sum / left.length, strongFrac: strong / left.length };
}

/**
 * The rows the captions occupy on the output: centred on the caption clips' y, two and a
 * half font sizes either way (a wrapped two-line block plus its outline).
 */
export function captionBand(project: EditorProjectV2, outHeight: number) {
  const clips = project.tracks
    .filter((track) => track.kind === 'caption')
    .flatMap((track): EditorClip[] => track.clips)
    .flatMap((clip) => (clip.kind === 'caption' ? [clip] : []));
  const centre = (clips[0]?.transform.position.y ?? 0.58) * outHeight;
  const fontPx =
    (Math.max(0, ...clips.map((clip) => clip.style.fontSizePx)) / project.canvas.height) *
    outHeight;
  const half = Math.max(80, fontPx * 2.5);
  const top = Math.max(0, Math.floor((centre - half) / 2) * 2);
  const bottom = Math.min(outHeight, Math.ceil((centre + half) / 2) * 2);
  return { top, height: bottom - top };
}

export type Probe = {
  codec: string;
  width: number;
  height: number;
  videoSec: number;
  frames: number;
  fps: number;
  audio: string;
};

export function ffprobe(path: string): Probe {
  const out = spawnSync(
    'ffprobe',
    ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', path],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const probe = JSON.parse(out.stdout || '{"streams":[]}') as {
    streams: Array<{
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      duration?: string;
      nb_read_frames?: string;
      avg_frame_rate?: string;
    }>;
  };
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const [num, den] = (video?.avg_frame_rate ?? '0/1').split('/').map(Number);
  return {
    codec: video?.codec_name ?? '',
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    videoSec: Number(video?.duration ?? 0),
    frames: Number(video?.nb_read_frames ?? 0),
    fps: den ? (num ?? 0) / den : 0,
    audio: probe.streams.find((stream) => stream.codec_type === 'audio')?.codec_name ?? '',
  };
}

/** Every frame's caption band at half resolution, luma by default (halving averages out noise). */
export function decodeBand(
  path: string,
  width: number,
  band: { top: number; height: number },
  pixelFormat: 'gray' | 'rgb24' = 'gray',
): Uint8Array[] {
  const outW = width / 2;
  const outH = band.height / 2;
  const out = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      path,
      '-vf',
      `crop=${width}:${band.height}:0:${band.top},scale=${outW}:${outH},format=${pixelFormat}`,
      '-fps_mode',
      'passthrough',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    { maxBuffer: 1024 * 1024 * 1024 },
  );
  if (out.status !== 0) throw new Error(`band decode failed: ${out.stderr?.toString()}`);
  const size = outW * outH * (pixelFormat === 'rgb24' ? 3 : 1);
  const bytes = new Uint8Array(out.stdout.buffer, out.stdout.byteOffset, out.stdout.byteLength);
  const frames: Uint8Array[] = [];
  for (let offset = 0; offset + size <= bytes.length; offset += size)
    frames.push(bytes.subarray(offset, offset + size));
  return frames;
}

// ── words ─────────────────────────────────────────────────────────────────────────────

/** The compositor's highlight fill for `highlightMode: 'word'` (DEFAULT_CAPTION_STYLE). */
const HIGHLIGHT_MODE = 'word';

/**
 * The word being spoken at each frame ('' for none), by the compositor's own rule: a line
 * is drawn while t ∈ [clip start, clip end) and its word is lit while t ∈ [clip start +
 * word start, clip start + word end). Only lines that highlight their words count.
 */
export function spokenWordPerFrame(
  project: EditorProjectV2,
  frameCount: number,
  fps: number,
): string[] {
  const words = project.tracks
    .filter((track) => track.kind === 'caption' && track.enabled && !track.muted)
    .flatMap((track): EditorClip[] => track.clips)
    .flatMap((clip) =>
      clip.kind === 'caption' && clip.enabled && clip.highlightMode === HIGHLIGHT_MODE
        ? clip.words.map((word, index) => ({
            key: `${clip.id}#${index}`,
            startSec: clip.timelineStartSec + word.startSec,
            endSec: Math.min(
              clip.timelineStartSec + word.endSec,
              clip.timelineStartSec + clip.durationSec,
            ),
          }))
        : [],
    );
  return Array.from({ length: frameCount }, (_, index) => {
    const t = index / fps;
    return words.find((word) => t >= word.startSec && t < word.endSec)?.key ?? '';
  });
}

/**
 * The highlight the captions added to one frame: pixels that are highlight-yellow in the
 * burned export and that the captions changed (the bare export differs there), so a yellow
 * wall behind the text is never mistaken for a spoken word.
 */
export function highlightMask(rgb: Uint8Array, burnedGray: Uint8Array, bareGray: Uint8Array) {
  const mask = new Uint8Array(burnedGray.length);
  for (let index = 0; index < mask.length; index++) {
    const r = rgb[index * 3] ?? 0;
    const g = rgb[index * 3 + 1] ?? 0;
    const b = rgb[index * 3 + 2] ?? 0;
    const yellow = r >= 170 && g >= 130 && b <= 110 && r - b >= 110 && g <= r + 20;
    const added = Math.abs((burnedGray[index] ?? 0) - (bareGray[index] ?? 0)) > STRONG_DELTA;
    mask[index] = yellow && added ? 1 : 0;
  }
  return mask;
}

const count = (mask: Uint8Array) => mask.reduce((sum, value) => sum + value, 0);
const changed = (left: Uint8Array, right: Uint8Array) => {
  let total = 0;
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) total += 1;
  return total;
};

/** Highlight pixels (half resolution) at or under this are encoder noise: the word is dark. */
export const UNLIT_MAX_PX = 12;
/** A move from one word to the next changes at least this many highlight pixels. */
export const LIT_MIN_PX = 40;
/** A word change is judged only when no other change is this close, so the jump is its own. */
const ISOLATION_FRAMES = 3;

export type WordTiming = {
  /** Word changes whose jump was looked for, and how far off each was (frames; + = late). */
  offsets: number[];
  /** The word changes more than a frame off, for the report. */
  off: { frame: number; offset: number; from: string; to: string; jumps: number[] }[];
  /** Word changes with no highlight jump anywhere near them. */
  unseen: number;
  /** Frames a word should be lit (a frame clear of its edges) that were dark. */
  darkWhileSpoken: number;
  /** Those frames, for the report: frame, word, highlight pixels. */
  dark: { frame: number; key: string; px: number }[];
  litFrames: number;
  /** Frames no word should be lit (a frame clear of any word) that were lit. */
  litWhileSilent: number;
  silentFrames: number;
};

/** Judge the highlight against the words, frame by frame. */
export function judgeWordTiming(keys: string[], masks: Uint8Array[]): WordTiming {
  const lit = masks.map(count);
  const jump = masks.map((mask, index) =>
    index === 0 ? 0 : changed(masks[index - 1] ?? mask, mask),
  );
  const events: number[] = [];
  for (let index = 1; index < keys.length; index++)
    if (keys[index] !== keys[index - 1]) events.push(index);
  const offsets: number[] = [];
  const off: WordTiming['off'] = [];
  let unseen = 0;
  for (const [order, event] of events.entries()) {
    const before = events[order - 1] ?? Number.NEGATIVE_INFINITY;
    const after = events[order + 1] ?? Number.POSITIVE_INFINITY;
    if (event - before <= ISOLATION_FRAMES || after - event <= ISOLATION_FRAMES) continue;
    const from = keys[event - 1] ?? '';
    const to = keys[event] ?? '';
    const first = Math.max(1, event - ISOLATION_FRAMES);
    const last = Math.min(keys.length - 1, event + ISOLATION_FRAMES);
    // A word lighting up from nothing is on from the frame it rises past the noise floor
    // (a fresh glyph's chroma sharpens over the next P-frames, so its biggest jump comes
    // late); one going dark is off from the frame it falls back to it; a move from one
    // word to the next is where the highlight jumps most.
    let best = -1;
    let seen = false;
    const on = (index: number) => (lit[index] ?? 0) > UNLIT_MAX_PX;
    for (let index = first; index <= last && best < 0; index++) {
      if (!from && on(index) && !on(index - 1)) best = index;
      if (!to && !on(index) && on(index - 1)) best = index;
    }
    if (from && to) {
      for (let index = first; index <= last; index++)
        if (best < 0 || (jump[index] ?? 0) > (jump[best] ?? 0)) best = index;
      seen = best >= 0 && (jump[best] ?? 0) >= LIT_MIN_PX;
    } else seen = best >= 0;
    if (!seen) unseen += 1;
    else offsets.push(best - event);
    if (seen && Math.abs(best - event) > 1)
      off.push({
        frame: event,
        offset: best - event,
        from,
        to,
        jumps: jump.slice(event - ISOLATION_FRAMES, event + ISOLATION_FRAMES + 1),
      });
  }
  const steady = (index: number) =>
    keys[index] === keys[index - 1] && keys[index] === keys[index + 1];
  let darkWhileSpoken = 0;
  const dark: WordTiming['dark'] = [];
  let litFrames = 0;
  let litWhileSilent = 0;
  let silentFrames = 0;
  for (let index = 1; index < keys.length - 1; index++) {
    if (!steady(index)) continue;
    if (keys[index]) {
      litFrames += 1;
      if ((lit[index] ?? 0) <= UNLIT_MAX_PX) {
        darkWhileSpoken += 1;
        dark.push({ frame: index, key: keys[index] ?? '', px: lit[index] ?? 0 });
      }
    } else {
      silentFrames += 1;
      if ((lit[index] ?? 0) > UNLIT_MAX_PX) litWhileSilent += 1;
    }
  }
  return { offsets, off, unseen, darkWhileSpoken, dark, litFrames, litWhileSilent, silentFrames };
}

/** Every frame's caption band as half-resolution RGB. */
export function decodeBandRgb(
  path: string,
  width: number,
  band: { top: number; height: number },
): Uint8Array[] {
  return decodeBand(path, width, band, 'rgb24');
}
