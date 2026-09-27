// Timed transcription shared by the Library's two transcribers: analyze_media (an edge
// function, which imports this file by path) windows a video or a recording of up to 20
// minutes; the Backend chunks anything longer through Continuum-Render and stitches it.
// Same instruction, same schema, same parsing on both sides, so a transcript reads the
// same whichever path made it. Pure — no imports, no I/O.

export const TRANSCRIBE_SYSTEM_INSTRUCTION = [
  'You are a precise transcription engine for short-form video captions.',
  'Transcribe ONLY the intelligible spoken words in the attached audio (ignore music,',
  'background noise, and sound effects) into short caption segments.',
  'Each segment is roughly one short phrase or sentence (aim for 3-8 words) with accurate',
  '`startSec` and `endSec` timestamps in SECONDS from the start of the audio.',
  'Segments must be in chronological order and must not overlap.',
  'Keep the text clean and lightly punctuated, suitable for on-screen burn-in.',
  'If there is no clear speech, return an empty segments array. Never invent words.',
].join('\n');

// Gemini responseSchema (structured output). Plain object literal, matching the
// clip-plan convention.
export const CAPTION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          startSec: { type: 'number' },
          endSec: { type: 'number' },
          text: { type: 'string' },
        },
        required: ['startSec', 'endSec', 'text'],
      },
    },
  },
  required: ['segments'],
} as const;

export type CaptionSegment = { startSec: number; endSec: number; text: string };

// Read the model's text from a generateContent response (candidates[0] parts).
export function extractGeminiText(payload: unknown): string {
  const candidates = (
    payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  )?.candidates;
  const parts = candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part?.text ?? '').join('');
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

// Parse the model's segments into validated, clamped, ordered CaptionSegments.
// Tolerant: accepts `{segments:[...]}` or a bare array; never throws. Drops
// segments with non-finite times, empty text, or non-positive duration; clamps to
// `durationSec` when provided.
export function parseSegmentsResponse(
  raw: string,
  opts: { durationSec?: number } = {},
): CaptionSegment[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return [];
  }
  const rawSegments = Array.isArray(parsed) ? parsed : (parsed as { segments?: unknown })?.segments;
  if (!Array.isArray(rawSegments)) return [];

  const max =
    opts.durationSec && Number.isFinite(opts.durationSec)
      ? opts.durationSec
      : Number.POSITIVE_INFINITY;
  const cleaned: CaptionSegment[] = [];
  for (const item of rawSegments as Array<Record<string, unknown>>) {
    const start = Number(item.startSec);
    const end = Number(item.endSec);
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!Number.isFinite(start) || !Number.isFinite(end) || !text) continue;
    const clampedStart = Math.max(0, Math.min(start, max));
    const clampedEnd = Math.max(clampedStart, Math.min(end, max));
    if (clampedEnd - clampedStart <= 0) continue;
    cleaned.push({ startSec: clampedStart, endSec: clampedEnd, text });
  }
  return cleaned.sort((a, b) => a.startSec - b.startSec);
}

/**
 * Past this, a recording is transcribed by the Backend (chunked through Continuum-Render,
 * off the edge function's wall clock) and handed to analyze_media as a finished transcript.
 * Equal to analyze_media's MAX_LONG_FORM_SEC.
 */
export const LIBRARY_LONG_RECORDING_SEC = 20 * 60;
/** Chunk length for the Backend path: ten minutes of mono 32 kb/s MP3 is ~2.4 MB inline. */
export const LIBRARY_TRANSCRIPTION_CHUNK_SEC = 10 * 60;

export const WINDOW_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    ...CAPTION_RESPONSE_SCHEMA.properties,
    language: {
      type: 'string',
      nullable: true,
      description: 'BCP-47 code of the main spoken language, e.g. "en", "es". Null if no speech.',
    },
  },
  required: ['segments', 'language'],
} as const;

// Measured 2026-09-27: given a video_metadata window, Gemini reports FILE time (a clip
// starting at 11 s answered 11.35 s) even when asked for clip time, so file time is what
// the prompt asks for. A window whose every segment starts before the window itself was
// answered clip-relative after all and is shifted; everything is then kept inside the
// window so neighbouring windows never repeat a line.
const WINDOW_EDGE_TOLERANCE_SEC = 1;

export function placeWindowSegments(
  segments: readonly CaptionSegment[],
  window: { startSec: number; endSec: number },
): CaptionSegment[] {
  const clipRelative =
    window.startSec > 0 &&
    segments.length > 0 &&
    segments.every((segment) => segment.startSec < window.startSec);
  const offset = clipRelative ? window.startSec : 0;
  return segments
    .map((segment) => ({
      text: segment.text,
      startSec: segment.startSec + offset,
      endSec: Math.min(segment.endSec + offset, window.endSec),
    }))
    .filter(
      (segment) =>
        segment.startSec >= window.startSec - WINDOW_EDGE_TOLERANCE_SEC &&
        segment.startSec < window.endSec &&
        segment.endSec > segment.startSec,
    );
}

export function parseWindowLanguage(raw: string): string | null {
  try {
    const parsed = JSON.parse(stripFences(raw)) as { language?: unknown };
    return typeof parsed.language === 'string' && parsed.language.trim()
      ? parsed.language.trim()
      : null;
  } catch {
    return null;
  }
}

/** One inline audio chunk (a slice cut by Continuum-Render), asked for its speech + language. */
export function buildInlineChunkTranscribeRequestBody(args: {
  audioBase64: string;
  mimeType: string;
  spanSec: number;
}) {
  return {
    systemInstruction: { parts: [{ text: TRANSCRIBE_SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Transcribe the speech in this recording (about ${args.spanSec.toFixed(0)} seconds). Give timestamps in seconds from its start, and the spoken language.`,
          },
          { inlineData: { mimeType: args.mimeType, data: args.audioBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 32768,
      responseMimeType: 'application/json',
      responseSchema: WINDOW_RESPONSE_SCHEMA,
    },
  };
}

export type ChunkTranscript = {
  /** Where the chunk's audio starts and ends in the recording (it overlaps its neighbours). */
  startSec: number;
  endSec: number;
  /** The span this chunk answers for; segments starting inside it are kept. Defaults to
   *  the whole chunk (no overlap). */
  ownedFromSec?: number;
  ownedToSec?: number;
  segments: readonly CaptionSegment[];
  language: string | null;
};

/** How far either side of a cut two chunks' copies of one line are compared. */
const SEAM_WINDOW_SEC = 60;
/** Lines are the same line when most of the shorter one's words are in the other. */
const SAME_LINE_WORD_SHARE = 0.8;
/** A line shorter than this ("Okay.") is too common to prove two copies are one line. */
const SEAM_MIN_WORDS = 3;

const lineWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

/** Same line heard twice: a clipped copy, or one with a misheard name ("Ico" / "Aiko"). */
export function sameLine(a: string, b: string): boolean {
  const [x, y] = [lineWords(a), lineWords(b)];
  if (Math.min(x.length, y.length) < SEAM_MIN_WORDS) return false;
  const [shorter, longer] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)];
  const shared = shorter.filter((word) => longer.has(word)).length;
  return shared / shorter.length >= SAME_LINE_WORD_SHARE;
}

/**
 * Chunks, each timed from its own start, → one transcript in recording time. Chunks overlap
 * so no sentence is cut at a boundary, and each seam is read as the UNION of what the two
 * chunks heard there:
 *  - a line both heard (matched by its words, clipped or misheard copies included) is kept
 *    once, from the LATER chunk — it heard the line near its own start, where the timing is
 *    exact; the earlier chunk's clock has drifted by then (measured 2026-09-27: Gemini skips
 *    silence, so after a 10 s pause chunk 1 put a line 10 s early, on the wrong side of 600 s);
 *  - a line only one of them heard is kept (measured: chunk 1 sometimes misses the last
 *    line before the cut entirely, and the later chunk heard it in its lead-in);
 *  - a fragment clipped at the very start of the later chunk's audio is never kept.
 * Away from the seams each chunk answers for its own span. Language is the one most chunks
 * heard.
 */
export function stitchChunkTranscripts(chunks: readonly ChunkTranscript[]): {
  segments: CaptionSegment[];
  language: string | null;
} {
  type Placed = CaptionSegment & { keep: 'owned' | 'seam' | 'drop' };
  const ordered = [...chunks].sort((a, b) => a.startSec - b.startSec);
  const placed: Placed[][] = ordered.map((chunk) =>
    chunk.segments
      .map((segment) => ({
        text: segment.text,
        startSec: segment.startSec + chunk.startSec,
        endSec: Math.min(segment.endSec + chunk.startSec, chunk.endSec),
        keep: 'owned' as Placed['keep'],
      }))
      .filter((segment) => segment.endSec > segment.startSec),
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const later = ordered[index] as ChunkTranscript;
    const seam = later.ownedFromSec ?? later.startSec;
    const heardLater = (placed[index] ?? []).filter(
      (segment) =>
        segment.startSec >= later.startSec + 1 && segment.startSec < seam + SEAM_WINDOW_SEC,
    );
    // The later chunk's lead-in (before the seam, past its clipped first second) is kept.
    for (const segment of heardLater) if (segment.startSec < seam) segment.keep = 'seam';
    for (const earlier of placed[index - 1] ?? []) {
      if (earlier.startSec < seam - SEAM_WINDOW_SEC) continue;
      if (heardLater.some((segment) => sameLine(segment.text, earlier.text))) {
        earlier.keep = 'drop';
      } else if (earlier.startSec >= seam) {
        // Heard past the seam by the earlier chunk only: the later one missed it.
        earlier.keep = 'seam';
      }
    }
  }
  const segments = placed
    .flatMap((list, index) => {
      const chunk = ordered[index] as ChunkTranscript;
      const ownedFrom = chunk.ownedFromSec ?? chunk.startSec;
      const ownedTo = chunk.ownedToSec ?? chunk.endSec;
      return list.filter(
        (segment) =>
          segment.keep === 'seam' ||
          (segment.keep === 'owned' && segment.startSec >= ownedFrom && segment.startSec < ownedTo),
      );
    })
    .map(({ text, startSec, endSec }) => ({ text, startSec, endSec }))
    .sort((a, b) => a.startSec - b.startSec);
  const votes = new Map<string, number>();
  for (const chunk of chunks) {
    if (chunk.language) votes.set(chunk.language, (votes.get(chunk.language) ?? 0) + 1);
  }
  const language = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { segments, language };
}
