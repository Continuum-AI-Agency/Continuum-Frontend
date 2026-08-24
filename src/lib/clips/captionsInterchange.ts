import {
  type CaptionCue,
  type CaptionWord,
  captionCueText,
  wordsForCaptionText,
} from '../../StudioCanvas/utils/splice/captionCues';
import type { CaptionStyle } from './clipCaptionStyle';

// SRT and WebVTT import/export. Pure — no DOM, no canvas — so it unit-tests against string
// goldens.
//
// The two formats are not symmetric and it matters:
//
//   SRT has NO SPECIFICATION. No RFC, no W3C recommendation, no grammar — it is a
//   convention crystallised out of one application's output, and every parser in the world
//   disagrees at the edges. Worse, a cue is an atomic (start, end, text) triple with no
//   inline timing construct, so EVERY word-level fact is lost on export and cannot be
//   recovered on import.
//
//   WebVTT is a W3C spec, mandates UTF-8, and has cue timestamps — so word timings survive
//   a round trip, and emphasis survives as a class. It is the format to prefer.
//
// Each defensive branch below costs exactly one silently-missing cue if it is removed. They
// are not paranoia; every one of them is a documented failure in the wild.

const BOM = '﻿';
/** CRLF, bare LF and bare CR are all real. A lone CR makes a naive split see ONE line —
 *  zero cues, no error at all, which is the worst possible failure shape. */
const LINE_BREAK = /\r\n|\r|\n/;
/** ASS/SSA override tags leaking into SRT. Players pass them straight through into the
 *  visible caption, so an imported file full of {\an8} burns "{\an8}" into the video. */
const ASS_OVERRIDE = /\{\\[^}]*\}/g;
/** Unofficial HTML-derived inline markup. Strip the tags, keep the words. */
const INLINE_MARKUP = /<\/?(?:b|i|u|font)(?:\s[^>]*)?>/gi;
/** A legacy SubRip extension that appends coordinates AFTER the end timestamp. */
const LEGACY_COORDS = /\s+X1:\d+\s+X2:\d+\s+Y1:\d+\s+Y2:\d+\s*$/;

/**
 * `[HH:]MM:SS[,.]mmm`.
 *
 * Hours are two-OR-MORE digits: files longer than 99 hours exist and a strict `\d{2}:`
 * rejects them. Hours are optional because WebVTT says so — `01:23.456` is a legal VTT
 * timestamp and not a legal SRT one.
 */
const TIMESTAMP = /^(?:(\d{2,}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/;

/** ONE OR MORE spaces or tabs around the arrow. A hard-coded single space is
 *  non-conformant and silently drops every cue that uses two. */
const ARROW = /[ \t]+-->[ \t]+/;

export type CaptionImport = {
  cues: CaptionCue[];
  /** Human-readable facts about what the file could not carry. Shown in the import toast. */
  warnings: string[];
  /** False when word timings were SYNTHESISED rather than read. Per-word motion visibly
   *  drifts against speech on synthesised timings, so the UI must not offer it. */
  hasRealWordTimings: boolean;
};

function parseTimestamp(raw: string): number | null {
  const match = TIMESTAMP.exec(raw.trim());
  if (!match) return null;
  const [, hours, minutes, seconds, fraction] = match;
  const ms = Number(fraction.padEnd(3, '0'));
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds) + ms / 1000;
}

function formatTimestamp(totalSec: number, separator: ',' | '.'): string {
  const clamped = Math.max(0, totalSec);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  // Round, do not truncate: truncating loses up to a millisecond every single cue and the
  // drift is systematically early.
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(ms % 1000, 3)}`;
}

function splitBlocks(text: string): string[][] {
  const lines = text
    .replace(/^﻿/, '') // a BOM makes a strict integer parse drop cue 1 entirely
    .split(LINE_BREAK);
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

function cleanPayloadLine(line: string): string {
  return line
    .replace(ASS_OVERRIDE, '')
    .replace(INLINE_MARKUP, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

/** The timing line of a block, wherever it sits. The index line is a FRAMING TOKEN only —
 *  files start at 0, at 1000, skip, duplicate and run out of order, and players "largely
 *  ignore the value but expect the line to be there". Never treat it as identity. */
function findTiming(block: string[]): { startSec: number; endSec: number; at: number } | null {
  for (let i = 0; i < Math.min(block.length, 3); i += 1) {
    const line = block[i].replace(LEGACY_COORDS, '');
    if (!line.includes('-->')) continue;
    const [rawStart, rawRest] = line.split(ARROW);
    if (rawRest === undefined) continue;
    const startSec = parseTimestamp(rawStart);
    // Cue SETTINGS (position:, line:, align:) trail the end timestamp.
    const endSec = parseTimestamp(rawRest.trim().split(/\s+/)[0] ?? '');
    if (startSec === null || endSec === null) continue;
    return { startSec, endSec, at: i };
  }
  return null;
}

/** Cue settings we can actually honour. `vertical`, `size` and `region` have nowhere to go. */
function parseCueSettings(rest: string): {
  style?: CaptionCue['style'];
  dropped: string[];
} {
  const dropped: string[] = [];
  const position: { xFrac?: number; yFrac?: number } = {};
  for (const token of rest.trim().split(/\s+/).slice(1)) {
    const [key, value] = token.split(':');
    if (!key || value === undefined) continue;
    const percent = Number.parseFloat(value);
    if (key === 'position' && Number.isFinite(percent)) position.xFrac = percent / 100;
    else if (key === 'line' && value.endsWith('%') && Number.isFinite(percent)) {
      position.yFrac = percent / 100;
    } else if (key === 'vertical' || key === 'size' || key === 'region') dropped.push(key);
  }
  if (position.xFrac === undefined && position.yFrac === undefined) return { dropped };
  return {
    style: { position: { xFrac: position.xFrac ?? 0.5, yFrac: position.yFrac ?? 0.88 } },
    dropped,
  };
}

/**
 * Read the word timings out of a VTT payload's cue timestamp tags.
 *
 * `<00:00:16.420><c.w>the</c>` — the tag is a standalone marker with no closing form; the
 * span after it is the word it starts. Returns null when the cue carries no tags at all,
 * which is the signal to fall back to synthesis.
 */
function wordsFromVttPayload(
  payload: string,
  cueStartSec: number,
  cueEndSec: number,
): CaptionWord[] | null {
  if (!/<\d{1,2}:\d{2}[:.]/.test(payload)) return null;

  const words: CaptionWord[] = [];
  // Split on every angle-bracketed token, keeping the tokens.
  const parts = payload.split(/(<[^>]*>)/).filter((part) => part !== '');
  let pendingStart = cueStartSec;
  let emphasis = false;

  for (const part of parts) {
    if (part.startsWith('<')) {
      const inner = part.slice(1, -1);
      const asTime = parseTimestamp(inner);
      if (asTime !== null) {
        pendingStart = asTime;
        continue;
      }
      if (inner.startsWith('/')) continue;
      // A class token: <c.w.em>. `.em` is how emphasis survives a VTT round trip.
      emphasis = /(^|\.)em(\.|$)/.test(inner);
      continue;
    }
    const text = cleanPayloadLine(part);
    if (text === '') continue;
    for (const token of text.split(/\s+/)) {
      if (!token) continue;
      words.push({
        text: token,
        startSec: pendingStart,
        endSec: cueEndSec,
        ...(emphasis ? { emphasis: true } : {}),
      });
    }
    emphasis = false;
  }
  if (words.length === 0) return null;
  // A tag marks ONE instant, so a word's end is the next word's start. An inter-word
  // silence is therefore indistinguishable from a word that ran long — a real and
  // unavoidable fidelity loss of the format, not a bug here.
  for (let i = 0; i < words.length - 1; i += 1) words[i].endSec = words[i + 1].startSec;
  words[words.length - 1].endSec = cueEndSec;
  return words;
}

function buildCue(
  id: string,
  startSec: number,
  endSec: number,
  payload: string,
  words: CaptionWord[] | null,
  style: CaptionCue['style'],
): CaptionCue | null {
  const text = payload.trim();
  // Never emit an empty cue: the separator blank line and an empty payload are the same
  // character, and parsers split roughly 50/50 on whether that is a cue or a resync.
  if (text === '') return null;
  const cue: CaptionCue = {
    id,
    startSec,
    endSec,
    words: words ?? wordsForCaptionText(text, startSec, endSec),
  };
  if (style) cue.style = style;
  return cue;
}

function parseBlocks(text: string, format: 'srt' | 'vtt'): CaptionImport {
  const warnings: string[] = [];
  const cues: CaptionCue[] = [];
  let droppedBlocks = 0;
  let sawTimestampTags = false;
  let sawMultiLine = false;
  const droppedSettings = new Set<string>();

  const blocks = splitBlocks(text);
  for (const block of blocks) {
    const head = block[0]?.trim().toUpperCase() ?? '';
    // VTT structural blocks. NOTE may appear anywhere; STYLE and REGION are only honoured
    // before the first cue by a conformant parser, and we render our own styles anyway.
    if (format === 'vtt' && (head.startsWith('WEBVTT') || head === 'NOTE' || head === 'STYLE')) {
      continue;
    }
    if (format === 'vtt' && (head === 'REGION' || head.startsWith('NOTE '))) continue;

    const timing = findTiming(block);
    if (!timing) {
      droppedBlocks += 1;
      continue;
    }
    // `end == start` renders for zero frames, i.e. invisibly, and `end < start` breaks
    // files. The VTT parsing algorithm never checks either; validate it ourselves.
    if (!(timing.endSec > timing.startSec)) {
      droppedBlocks += 1;
      continue;
    }

    const payloadLines = block.slice(timing.at + 1);
    if (payloadLines.length > 1) sawMultiLine = true;
    const rawPayload = payloadLines.join(' ');

    let words: CaptionWord[] | null = null;
    if (format === 'vtt') {
      words = wordsFromVttPayload(rawPayload, timing.startSec, timing.endSec);
      if (words) sawTimestampTags = true;
    }

    const settings =
      format === 'vtt'
        ? parseCueSettings(block[timing.at].split(ARROW)[1] ?? '')
        : { style: undefined, dropped: [] as string[] };
    for (const key of settings.dropped) droppedSettings.add(key);

    const payload = payloadLines.map(cleanPayloadLine).filter(Boolean).join(' ');
    const cue = buildCue(
      `caption-${cues.length + 1}`,
      timing.startSec,
      timing.endSec,
      payload,
      words,
      settings.style,
    );
    if (cue) cues.push(cue);
    else droppedBlocks += 1;
  }

  if (text.includes('X-TIMESTAMP-MAP')) {
    // An HLS header (RFC 8216 §3.5), not part of W3C WebVTT, carrying a 90kHz MPEG-TS
    // offset. Ignoring it silently produces captions offset by however far that clock had
    // advanced, so say so rather than importing something quietly wrong.
    warnings.push('This file carries an HLS X-TIMESTAMP-MAP offset, which was not applied.');
  }
  if (droppedBlocks > 0) {
    warnings.push(`${droppedBlocks} block(s) had no usable timing and were skipped.`);
  }
  if (sawMultiLine) {
    warnings.push('Line breaks inside cues were dropped — captions re-wrap when rendered.');
  }
  if (droppedSettings.size > 0) {
    warnings.push(`Unsupported cue settings ignored: ${[...droppedSettings].sort().join(', ')}.`);
  }
  if (!sawTimestampTags && cues.length > 0) {
    warnings.push(
      'This file has no per-word timings, so they were estimated from word length. ' +
        'Per-word animations will drift against the speech.',
    );
  }
  return { cues, warnings, hasRealWordTimings: sawTimestampTags };
}

export function parseSrt(text: string): CaptionImport {
  return parseBlocks(text, 'srt');
}

export function parseVtt(text: string): CaptionImport {
  return parseBlocks(text, 'vtt');
}

/** Dispatch on the header, because the extension lies often enough to matter. */
export function parseCaptionFile(text: string): CaptionImport {
  return text.replace(/^﻿/, '').trimStart().toUpperCase().startsWith('WEBVTT')
    ? parseVtt(text)
    : parseSrt(text);
}

/**
 * `-->` is forbidden inside a payload in BOTH formats — the parser scans any line for the
 * substring to decide whether a block is a timing line, so a payload containing it at the
 * top of a block is misparsed as one.
 */
const escapeArrow = (text: string): string => text.replace(/-->/g, '--&gt;');

/**
 * Export SRT.
 *
 * EVERYTHING word-level is lost here, totally and irreversibly: per-word timings, emphasis,
 * confidence, position. SRT has no inline timing construct to carry any of it. Export VTT
 * when that matters.
 *
 * `&` is deliberately NOT escaped: SRT has no XML escaping convention and players render
 * `&amp;` literally, so escaping it would put the entity text on screen.
 */
export function toSrt(cues: readonly CaptionCue[]): string {
  return cues
    .map((cue, index) => {
      const start = formatTimestamp(cue.startSec, ',');
      const end = formatTimestamp(cue.endSec, ',');
      return `${index + 1}\n${start} --> ${end}\n${escapeArrow(captionCueText(cue))}\n`;
    })
    .join('\n');
}

const escapeVtt = (text: string): string =>
  escapeArrow(text.replace(/&/g, '&amp;').replace(/</g, '&lt;'));

/**
 * Export WebVTT with per-word cue timestamps.
 *
 * Two things that make the difference between a karaoke VTT and an ordinary one, and both
 * are easy to miss:
 *
 *   A timestamp tag ON ITS OWN renders nothing and reveals nothing — the whole cue is
 *   painted at the cue's start time. The karaoke effect exists only because `:past` and
 *   `:future` match nodes relative to those markers and CSS then styles them, which is why
 *   the STYLE block below is emitted alongside.
 *
 *   `::cue()` with an argument matches only WebVTT INTERNAL node objects; bare text between
 *   timestamps is a LEAF and cannot be matched. Every word must be wrapped in a `<c>` span
 *   or there is nothing for the selector to hit. That is the single most common reason a
 *   hand-written karaoke VTT does nothing at all.
 *
 * Note what still cannot survive: our motion. Inside a `:past`/`:future` selector the spec
 * allows only colour, opacity, visibility, text-decoration, text-shadow, background and
 * outline — font-weight and any transform are dropped on the floor. An exported VTT can
 * never reproduce a per-word pop; burn-in is the only place that motion exists.
 */
export function toVtt(cues: readonly CaptionCue[], style?: CaptionStyle): string {
  const textColor = style?.textColor ?? '#ffffff';
  const highlightColor = style?.highlightColor ?? '#ffd400';
  const emphasisColor = style?.emphasis?.color ?? highlightColor;

  // Scoped to a class we only emit ourselves: Blink and WebKit both implement `:past` as
  // `:not(:future)`, so an unscoped rule can light up an entire untagged cue.
  const styleBlock = [
    'STYLE',
    `::cue(.w) { color: ${textColor}; }`,
    `::cue(.w:past) { color: ${highlightColor}; }`,
    `::cue(.em) { color: ${emphasisColor}; }`,
  ].join('\n');

  const body = cues.map((cue, index) => {
    const start = formatTimestamp(cue.startSec, '.');
    const end = formatTimestamp(cue.endSec, '.');
    const payload = cue.words
      .map((word) => {
        const classes = word.emphasis ? 'c.w.em' : 'c.w';
        const span = `<${classes}>${escapeVtt(word.text)}</c>`;
        // The spec requires a cue timestamp to be strictly GREATER than the cue's start,
        // so the first word carries no tag — it starts when the cue does anyway.
        return word.startSec > cue.startSec
          ? `<${formatTimestamp(word.startSec, '.')}>${span}`
          : span;
      })
      .join(' ');
    return `caption-${index + 1}\n${start} --> ${end} align:center\n${payload}\n`;
  });

  // "WEBVTT" then TWO OR MORE line terminators. With only one blank line the file is
  // malformed and browsers reject the entire track.
  return `WEBVTT\n\n${styleBlock}\n\n${body.join('\n')}`;
}

export { BOM };
