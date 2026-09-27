// Review comments as editing-app markers: CSV, a DaVinci Resolve marker EDL,
// Final Cut Pro FCPXML and Premiere Pro (FCP7 xmeml) marker XML. Pure functions;
// the caller supplies the asset's MEASURED frame rate, because a marker that
// lands one frame off is a note about the wrong frame.
//
// One frame rule everywhere: a comment at `timeMs` sits on the frame being shown
// at that instant, floor(timeMs · fps / 1000). Timecodes are SOURCE timecodes: the
// file's embedded start timecode (its tmcd track) plus that frame, drop-frame
// when the file says so, so a marker lines up with the clip's own timecode in
// the editor. Markers ride on the clip (FCPXML asset-clip with a media reference,
// xmeml clipitem with a file), not on a bare sequence. NTSC rates keep their exact
// 1001 denominator in FCPXML and their ntsc flag in xmeml.

import type { MediaComment } from '@continuum/contracts';

export type FrameRate = { num: number; den: number };

export type ExportComment = {
  id: string;
  author: string;
  body: string;
  timeMs: number;
  endMs: number | null;
  createdAt: string;
  resolved: boolean;
  visibility: string;
};

// Where the file's own timecode starts: a frame count at the timecode base (the
// tmcd track's first sample) and whether it counts drop-frame.
export type SourceTimecode = { startFrame: number; dropFrame: boolean };

export const ZERO_SOURCE_TIMECODE: SourceTimecode = { startFrame: 0, dropFrame: false };

export type ExportContext = {
  assetName: string;
  rate: FrameRate;
  durationMs: number;
  /** The file name the editor relinks the clip to. */
  fileName?: string;
  source?: SourceTimecode;
};

export const COMMENT_EXPORT_FORMATS = ['csv', 'edl', 'fcpxml', 'premiere'] as const;
export type CommentExportFormat = (typeof COMMENT_EXPORT_FORMATS)[number];

const STANDARD_RATES: readonly FrameRate[] = [
  { num: 24000, den: 1001 },
  { num: 24, den: 1 },
  { num: 25, den: 1 },
  { num: 30000, den: 1001 },
  { num: 30, den: 1 },
  { num: 48, den: 1 },
  { num: 50, den: 1 },
  { num: 60000, den: 1001 },
  { num: 60, den: 1 },
  { num: 120, den: 1 },
];

export function framesPerSecond(rate: FrameRate): number {
  return rate.num / rate.den;
}

// A container's average packet rate wobbles around the true rate (29.9701…),
// so a measurement within 0.04% of a broadcast rate IS that rate. The window is
// tighter than the 0.1% that separates 29.97 from 30, and the nearest wins.
export function snapFrameRate(measuredFps: number): FrameRate {
  if (!Number.isFinite(measuredFps) || measuredFps <= 0) {
    throw new Error(`Unusable frame rate: ${measuredFps}`);
  }
  const error = (rate: FrameRate) => Math.abs(framesPerSecond(rate) - measuredFps) / measuredFps;
  const nearest = [...STANDARD_RATES].sort((a, b) => error(a) - error(b))[0];
  return nearest && error(nearest) < 0.0004
    ? nearest
    : { num: Math.round(measuredFps * 1000), den: 1000 };
}

// The 1e-6 absorbs float error on a time that sits exactly on a frame boundary.
export function frameAtMs(ms: number, rate: FrameRate): number {
  return Math.max(0, Math.floor((ms * rate.num) / (rate.den * 1000) + 1e-6));
}

// The first whole millisecond inside `frame`: seeking here shows that frame, and
// frameAtMs maps it straight back.
export function msForFrame(frame: number, rate: FrameRate): number {
  return Math.ceil((frame * rate.den * 1000) / rate.num);
}

export function timecodeBase(rate: FrameRate): number {
  return Math.round(framesPerSecond(rate));
}

// Drop-frame only exists for the NTSC rates that count at 30 or 60.
export function dropsFrames(rate: FrameRate, dropFrame: boolean): boolean {
  const base = timecodeBase(rate);
  return dropFrame && rate.den === 1001 && (base === 30 || base === 60);
}

// SMPTE timecode for an absolute frame count. Drop-frame skips frame NUMBERS
// :00 and :01 (:00-:03 at 60) at the start of every minute except each tenth, so
// the label keeps pace with the wall clock; the frames themselves all exist.
export function timecodeForFrame(frame: number, rate: FrameRate, dropFrame = false): string {
  const base = timecodeBase(rate);
  const two = (n: number) => String(n).padStart(2, '0');
  let count = Math.max(0, frame);
  const df = dropsFrames(rate, dropFrame);
  if (df) {
    const dropped = base === 60 ? 4 : 2;
    const perTenMinutes = base * 600 - dropped * 9;
    const perMinute = base * 60 - dropped;
    const tens = Math.floor(count / perTenMinutes);
    const rest = count % perTenMinutes;
    count +=
      dropped * 9 * tens +
      (rest > dropped ? dropped * Math.floor((rest - dropped) / perMinute) : 0);
  }
  const frames = count % base;
  const totalSeconds = Math.floor(count / base);
  const separator = df ? ';' : ':';
  return `${two(Math.floor(totalSeconds / 3600) % 24)}:${two(Math.floor(totalSeconds / 60) % 60)}:${two(totalSeconds % 60)}${separator}${two(frames)}`;
}

// The inverse: an SMPTE string back to its absolute frame count.
export function framesForTimecode(timecode: string, rate: FrameRate, dropFrame = false): number {
  const [h = 0, m = 0, sec = 0, f = 0] = timecode.split(/[:;.]/).map(Number);
  const base = timecodeBase(rate);
  const totalMinutes = h * 60 + m;
  const nominal = (totalMinutes * 60 + sec) * base + f;
  if (!dropsFrames(rate, dropFrame)) return nominal;
  const dropped = base === 60 ? 4 : 2;
  return nominal - dropped * (totalMinutes - Math.floor(totalMinutes / 10));
}

// The source timecode of a moment in the file.
export function sourceTimecodeAtMs(
  ms: number,
  rate: FrameRate,
  source: SourceTimecode = ZERO_SOURCE_TIMECODE,
): string {
  return timecodeForFrame(source.startFrame + frameAtMs(ms, rate), rate, source.dropFrame);
}

type MarkerSpan = { comment: ExportComment; inFrame: number; outFrame: number };

// A point comment is one frame long; a range covers its last frame too, so an
// out-point is exclusive and never equal to the in-point.
function markerSpans(comments: ExportComment[], rate: FrameRate): MarkerSpan[] {
  return [...comments]
    .sort((a, b) => a.timeMs - b.timeMs || a.createdAt.localeCompare(b.createdAt))
    .map((comment) => {
      const inFrame = frameAtMs(comment.timeMs, rate);
      const outFrame =
        comment.endMs === null
          ? inFrame + 1
          : Math.max(inFrame + 1, frameAtMs(comment.endMs, rate) + 1);
      return { comment, inFrame, outFrame };
    });
}

function markerText(comment: ExportComment): string {
  return `${comment.author}: ${comment.body}`.replace(/\s+/g, ' ').trim();
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function commentsToCsv(comments: ExportComment[], context: ExportContext): string {
  const header = [
    'Comment ID',
    'Author',
    'Timecode In',
    'Timecode Out',
    'Frame In',
    'Frame Out',
    'Time In (ms)',
    'Time Out (ms)',
    'Frame Rate',
    'Comment',
    'Status',
    'Visibility',
    'Created At',
  ];
  const fps = framesPerSecond(context.rate).toFixed(3);
  const source = context.source ?? ZERO_SOURCE_TIMECODE;
  const tc = (frame: number) =>
    timecodeForFrame(source.startFrame + frame, context.rate, source.dropFrame);
  const rows = markerSpans(comments, context.rate).map(({ comment, inFrame, outFrame }) => [
    comment.id,
    comment.author,
    tc(inFrame),
    tc(outFrame),
    inFrame,
    outFrame,
    comment.timeMs,
    comment.endMs ?? comment.timeMs,
    fps,
    comment.body,
    comment.resolved ? 'resolved' : 'open',
    comment.visibility,
    comment.createdAt,
  ]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

// Resolve reads timeline markers from a CMX3600 EDL: the record-in of each event
// is the marker frame, `|M:` its name, `|D:` its duration in frames.
export function commentsToResolveEdl(comments: ExportComment[], context: ExportContext): string {
  const title = context.assetName.replace(/[\r\n]+/g, ' ');
  const source = context.source ?? ZERO_SOURCE_TIMECODE;
  const df = dropsFrames(context.rate, source.dropFrame);
  const tc = (frame: number) => timecodeForFrame(source.startFrame + frame, context.rate, df);
  const lines = [`TITLE: ${title} review`, `FCM: ${df ? 'DROP FRAME' : 'NON-DROP FRAME'}`, ''];
  markerSpans(comments, context.rate).forEach(({ comment, inFrame, outFrame }, index) => {
    const event = String(index + 1).padStart(3, '0');
    const tcIn = tc(inFrame);
    const tcOut = tc(inFrame + 1);
    lines.push(`${event}  001      V     C        ${tcIn} ${tcOut} ${tcIn} ${tcOut}  `);
    lines.push(
      ` |C:ResolveColorBlue |M:${markerText(comment).replaceAll('|', '/')} |D:${outFrame - inFrame}`,
    );
    lines.push('');
  });
  return lines.join('\r\n');
}

function xml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

// FCPXML time is a rational number of seconds; frame n is n·den/num exactly.
function fcpTime(frames: number, rate: FrameRate): string {
  return frames === 0 ? '0s' : `${frames * rate.den}/${rate.num}s`;
}

// A file:// URL for the editor to relink against. Only the name is known here —
// the editor resolves it in the project's media, as it does for any moved file.
function fileUrl(fileName: string, prefix: string): string {
  return `${prefix}${encodeURIComponent(fileName)}`;
}

export function commentsToFcpxml(comments: ExportComment[], context: ExportContext): string {
  const { rate } = context;
  const source = context.source ?? ZERO_SOURCE_TIMECODE;
  const df = dropsFrames(rate, source.dropFrame);
  const durationFrames = Math.max(1, frameAtMs(context.durationMs, rate));
  const duration = fcpTime(durationFrames, rate);
  // The clip's first frame IS its start timecode; marker times are in the clip's
  // own time, so each sits at start + frame.
  const start = fcpTime(source.startFrame, rate);
  const name = xml(context.assetName);
  const fileName = context.fileName ?? context.assetName;
  const markers = markerSpans(comments, rate).map(
    ({ comment, inFrame, outFrame }) =>
      `              <marker start="${fcpTime(source.startFrame + inFrame, rate)}" duration="${fcpTime(outFrame - inFrame, rate)}" value="${xml(markerText(comment))}" note="${xml(comment.id)}"/>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE fcpxml>',
    '<fcpxml version="1.10">',
    '  <resources>',
    `    <format id="r1" frameDuration="${rate.den}/${rate.num}s"/>`,
    `    <asset id="r2" name="${name}" start="${start}" duration="${duration}" hasVideo="1" format="r1">`,
    `      <media-rep kind="original-media" src="${xml(fileUrl(fileName, 'file:///'))}"/>`,
    '    </asset>',
    '  </resources>',
    '  <library>',
    '    <event name="Continuum review">',
    `      <project name="${name} review">`,
    `        <sequence format="r1" duration="${duration}" tcStart="${start}" tcFormat="${df ? 'DF' : 'NDF'}">`,
    '          <spine>',
    `            <asset-clip ref="r2" name="${name}" offset="${start}" start="${start}" duration="${duration}" format="r1" tcFormat="${df ? 'DF' : 'NDF'}">`,
    ...markers,
    '            </asset-clip>',
    '          </spine>',
    '        </sequence>',
    '      </project>',
    '    </event>',
    '  </library>',
    '</fcpxml>',
    '',
  ].join('\n');
}

// Premiere imports FCP7 xmeml. The markers sit on the clipitem, whose file carries
// the source timecode, so they travel with the clip; their in/out are frames of
// the clip (0 = its first frame) and an out of -1 marks a single-frame marker.
export function commentsToPremiereXml(comments: ExportComment[], context: ExportContext): string {
  const { rate } = context;
  const source = context.source ?? ZERO_SOURCE_TIMECODE;
  const df = dropsFrames(rate, source.dropFrame);
  const ntsc = rate.den === 1001 ? 'TRUE' : 'FALSE';
  const rateXml = `<rate><timebase>${timecodeBase(rate)}</timebase><ntsc>${ntsc}</ntsc></rate>`;
  const durationFrames = Math.max(1, frameAtMs(context.durationMs, rate));
  const name = xml(context.assetName);
  const fileName = context.fileName ?? context.assetName;
  const timecodeXml = `<timecode>${rateXml}<string>${timecodeForFrame(source.startFrame, rate, df)}</string><frame>${source.startFrame}</frame><displayformat>${df ? 'DF' : 'NDF'}</displayformat></timecode>`;
  const markers = markerSpans(comments, rate).map(({ comment, inFrame, outFrame }) =>
    [
      '          <marker>',
      `            <name>${xml(comment.author)}</name>`,
      `            <comment>${xml(comment.body)}</comment>`,
      `            <in>${inFrame}</in>`,
      `            <out>${comment.endMs === null ? -1 : outFrame}</out>`,
      '          </marker>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE xmeml>',
    '<xmeml version="4">',
    '  <sequence>',
    `    <name>${name} review</name>`,
    `    <duration>${durationFrames}</duration>`,
    `    ${rateXml}`,
    `    ${timecodeXml}`,
    '    <media><video><track>',
    '      <clipitem id="clipitem-1">',
    `        <name>${name}</name>`,
    `        <duration>${durationFrames}</duration>`,
    `        ${rateXml}`,
    `        <start>0</start><end>${durationFrames}</end><in>0</in><out>${durationFrames}</out>`,
    '        <file id="file-1">',
    `          <name>${xml(fileName)}</name>`,
    `          <pathurl>${xml(fileUrl(fileName, 'file://localhost/'))}</pathurl>`,
    `          ${rateXml}`,
    `          <duration>${durationFrames}</duration>`,
    `          ${timecodeXml}`,
    '          <media><video/></media>',
    '        </file>',
    ...markers,
    '      </clipitem>',
    '    </track></video></media>',
    '  </sequence>',
    '</xmeml>',
    '',
  ].join('\n');
}

export const COMMENT_EXPORT_FILES: Record<
  CommentExportFormat,
  { extension: string; contentType: string; build: typeof commentsToCsv }
> = {
  csv: { extension: 'csv', contentType: 'text/csv; charset=utf-8', build: commentsToCsv },
  edl: { extension: 'edl', contentType: 'text/plain; charset=utf-8', build: commentsToResolveEdl },
  fcpxml: {
    extension: 'fcpxml',
    contentType: 'application/xml; charset=utf-8',
    build: commentsToFcpxml,
  },
  premiere: {
    extension: 'xml',
    contentType: 'application/xml; charset=utf-8',
    build: commentsToPremiereXml,
  },
};

// The markers of one version: every live comment whose thread is pinned to a
// moment on that version's cut. A reply rides at its thread's timecode, so a
// conversation lands on the editor's timeline as one stack. A comment with no
// version pin belongs to the head (see commentVersions.anchorVersionId).
export function exportCommentsForVersion(
  comments: MediaComment[],
  params: {
    versionId: string | null;
    headVersionId: string | null;
    authorOf: (c: MediaComment) => string;
  },
): ExportComment[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  return comments.flatMap((comment) => {
    const root = (comment.parentCommentId && byId.get(comment.parentCommentId)) || comment;
    const annotation = root.annotation;
    if (annotation?.kind !== 'time') return [];
    if ((root.versionId ?? params.headVersionId) !== params.versionId) return [];
    return [
      {
        id: comment.id,
        author: params.authorOf(comment),
        body: comment.body,
        timeMs: annotation.timeMs,
        endMs: annotation.endMs ?? null,
        createdAt: comment.createdAt,
        resolved: Boolean(root.resolvedAt),
        visibility: comment.visibility ?? 'internal',
      },
    ];
  });
}
