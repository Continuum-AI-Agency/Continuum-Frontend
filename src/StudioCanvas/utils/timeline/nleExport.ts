// Client-side NLE interchange for the Video Editor timeline: CMX3600 EDL and FCPXML.
//
// Pure string building, no DOM, no mediabunny, no network — an editor can hand the
// timeline to Premiere/Resolve/Final Cut without a render and without a server round
// trip. Kept free of React and of `TimelineItem` internals so the goldens are plain
// data and the same functions run in a unit test, in the dialog, and in a bench probe.

/** One placement, already resolved to output time. */
export interface NleClip {
  id: string;
  /** Shown as the clip/asset name in both formats. */
  name: string;
  /** Absolute start on the output timeline (the EDL record in). */
  timelineStartSec: number;
  durationSec: number;
  /** Offset into the source media (the EDL source in). */
  sourceInSec: number;
  /**
   * Length of the cross-dissolve INTO this clip, when it has one. Emitted as the
   * CMX two-line C+D pair; an EDL that wrote a bare cut here would be silently
   * dropping an edit the timeline actually contains.
   */
  dissolveInSec?: number;
}

/**
 * `model.layout.clips` → `NleClip[]`.
 *
 * Typed structurally rather than against `TimelineItem`/`ClipLayout` on purpose: it
 * keeps this module free of the editor's types, so a golden test builds its input as
 * plain data instead of standing up a document.
 */
export function nleClipsFrom(
  placements: readonly {
    item: {
      id: string;
      sourceNodeId: string;
      trimStartSec?: number;
      transition?: { type: string; durationSec: number };
    };
    startSec: number;
    durationSec: number;
  }[],
  nameFor: (sourceNodeId: string, index: number) => string,
): NleClip[] {
  return placements.map((placement, index) => ({
    id: placement.item.id,
    name: nameFor(placement.item.sourceNodeId, index),
    timelineStartSec: placement.startSec,
    durationSec: placement.durationSec,
    sourceInSec: placement.item.trimStartSec ?? 0,
    ...(placement.item.transition?.type === 'crossDissolve'
      ? { dissolveInSec: placement.item.transition.durationSec }
      : {}),
  }));
}

export interface NleExportOptions {
  title?: string;
  /**
   * Frames per second for the timecode grid. Defaults to 30, which is not a guess:
   * `assertSupportedTimelineEditorExport` rejects any project that is not exactly
   * 30 fps, and the V2 projection defaults to 30/1. It stays a parameter because
   * this module does not own that law.
   */
  fps?: number;
}

export interface FcpxmlOptions extends NleExportOptions {
  width?: number;
  height?: number;
}

const DEFAULT_FPS = 30;
const DEFAULT_TITLE = 'Continuum Timeline';

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** Whole frames at `fps`, rounded — a timecode grid has no half frames. */
export function framesFor(seconds: number, fps = DEFAULT_FPS): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round(seconds * fps);
}

/**
 * `HH:MM:SS:FF`, non-drop-frame.
 *
 * Hours wrap at 24: a CMX3600 timecode field is two digits, and an EDL carrying `27`
 * in it is a file some decks and some NLEs refuse outright.
 */
export function timecodeFor(seconds: number, fps = DEFAULT_FPS): string {
  const total = framesFor(seconds, fps);
  const hours = Math.floor(total / (3600 * fps)) % 24;
  const minutes = Math.floor(total / (60 * fps)) % 60;
  const secs = Math.floor(total / fps) % 60;
  const frames = total % fps;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}:${pad2(frames)}`;
}

/**
 * CMX3600 EDL.
 *
 * Column widths are fixed-width by convention, not by taste — the format predates
 * delimiters and a reader counts characters. They are pinned by a golden test.
 */
export function toEdlCmx3600(clips: readonly NleClip[], options: NleExportOptions = {}): string {
  const fps = options.fps ?? DEFAULT_FPS;
  const lines = [`TITLE: ${options.title ?? DEFAULT_TITLE}`, 'FCM: NON-DROP FRAME', ''];

  clips.forEach((clip, index) => {
    const event = String(index + 1).padStart(3, '0');
    const sourceIn = timecodeFor(clip.sourceInSec, fps);
    const sourceOut = timecodeFor(clip.sourceInSec + clip.durationSec, fps);
    const recordIn = timecodeFor(clip.timelineStartSec, fps);
    const recordOut = timecodeFor(clip.timelineStartSec + clip.durationSec, fps);
    // `AX` is the CMX reel id for "auxiliary / no reel", which is what a file-based
    // source is. The FROM CLIP NAME comment underneath is how every modern NLE
    // actually relinks the media.
    // Event cols 1-3, reel 6-14, channel 15-20, transition at 21 — the CMX3600 grid.
    const head = `${event}  ${'AX'.padEnd(8)} ${'V'.padEnd(6)}`;

    const dissolve = clip.dissolveInSec ?? 0;
    if (dissolve > 0) {
      // The standard pair: a zero-length cut that establishes the outgoing frame,
      // then the dissolve itself carrying its length in frames.
      lines.push(`${head}C        ${sourceIn} ${sourceIn} ${recordIn} ${recordIn}`);
      const frames = String(framesFor(dissolve, fps)).padStart(3, '0');
      lines.push(`${head}D    ${frames} ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`);
    } else {
      lines.push(`${head}C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`);
    }
    lines.push(`* FROM CLIP NAME: ${clip.name}`);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * XML-escape a value that came from user-entered clip or project names.
 *
 * A clip called `A & B` must not produce a file no parser will open. This is a trust
 * boundary, not a nicety.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** FCPXML expresses time as an exact rational, which is why the timecodes compare exactly. */
const rational = (seconds: number, fps: number): string => `${framesFor(seconds, fps)}/${fps}s`;

/** FCPXML 1.10 — the interchange Final Cut Pro and Resolve both read. */
export function toFcpxml(clips: readonly NleClip[], options: FcpxmlOptions = {}): string {
  const fps = options.fps ?? DEFAULT_FPS;
  const title = escapeXml(options.title ?? DEFAULT_TITLE);
  const width = options.width ?? 1080;
  const height = options.height ?? 1920;
  const totalSec = clips.reduce(
    (max, clip) => Math.max(max, clip.timelineStartSec + clip.durationSec),
    0,
  );

  const assets = clips
    .map((clip, index) => {
      const name = escapeXml(clip.name);
      // The asset must be long enough to contain the trimmed range, or an importer
      // clamps the clip back to the asset length and the timing silently changes.
      const assetDuration = rational(clip.sourceInSec + clip.durationSec, fps);
      return `    <asset id="r${index + 1}" name="${name}" start="0s" duration="${assetDuration}" hasVideo="1" format="r0"/>`;
    })
    .join('\n');

  const spine = clips
    .map((clip, index) => {
      const name = escapeXml(clip.name);
      return `          <asset-clip ref="r${index + 1}" name="${name}" offset="${rational(clip.timelineStartSec, fps)}" start="${rational(clip.sourceInSec, fps)}" duration="${rational(clip.durationSec, fps)}" format="r0"/>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<fcpxml version="1.10">
  <resources>
    <format id="r0" name="FFVideoFormat${height}p${fps}" frameDuration="1/${fps}s" width="${width}" height="${height}"/>
${assets}
  </resources>
  <library>
    <event name="${title}">
      <project name="${title}">
        <sequence format="r0" duration="${rational(totalSec, fps)}" tcStart="0s" tcFormat="NDF">
          <spine>
${spine}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}
