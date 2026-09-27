// Review comments as editing-app markers: CSV, a DaVinci Resolve marker EDL,
// Final Cut Pro FCPXML and Premiere Pro (FCP7 xmeml) marker XML. Pure functions;
// the caller supplies the asset's MEASURED frame rate, because a marker that
// lands one frame off is a note about the wrong frame.
//
// One frame rule everywhere: a comment at `timeMs` sits on the frame being shown
// at that instant, floor(timeMs · fps / 1000). Timecodes are non-drop-frame and
// start at 00:00:00:00 (the asset's own first frame); NTSC rates keep their exact
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

export type ExportContext = {
  assetName: string;
  rate: FrameRate;
  durationMs: number;
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

export function timecodeForFrame(frame: number, rate: FrameRate): string {
  const base = timecodeBase(rate);
  const two = (n: number) => String(n).padStart(2, '0');
  const frames = frame % base;
  const totalSeconds = Math.floor(frame / base);
  return `${two(Math.floor(totalSeconds / 3600))}:${two(Math.floor(totalSeconds / 60) % 60)}:${two(totalSeconds % 60)}:${two(frames)}`;
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
  const rows = markerSpans(comments, context.rate).map(({ comment, inFrame, outFrame }) => [
    comment.id,
    comment.author,
    timecodeForFrame(inFrame, context.rate),
    timecodeForFrame(outFrame, context.rate),
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
  const lines = [`TITLE: ${title} review`, 'FCM: NON-DROP FRAME', ''];
  markerSpans(comments, context.rate).forEach(({ comment, inFrame, outFrame }, index) => {
    const event = String(index + 1).padStart(3, '0');
    const tcIn = timecodeForFrame(inFrame, context.rate);
    const tcOut = timecodeForFrame(inFrame + 1, context.rate);
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

export function commentsToFcpxml(comments: ExportComment[], context: ExportContext): string {
  const { rate } = context;
  const durationFrames = Math.max(1, frameAtMs(context.durationMs, rate));
  const duration = fcpTime(durationFrames, rate);
  const name = xml(context.assetName);
  const markers = markerSpans(comments, rate).map(
    ({ comment, inFrame, outFrame }) =>
      `            <marker start="${fcpTime(inFrame, rate)}" duration="${fcpTime(outFrame - inFrame, rate)}" value="${xml(markerText(comment))}" note="${xml(comment.id)}"/>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE fcpxml>',
    '<fcpxml version="1.10">',
    '  <resources>',
    `    <format id="r1" frameDuration="${rate.den}/${rate.num}s"/>`,
    `    <asset id="r2" name="${name}" start="0s" duration="${duration}" hasVideo="1" format="r1"/>`,
    '  </resources>',
    '  <library>',
    '    <event name="Continuum review">',
    `      <project name="${name} review">`,
    `        <sequence format="r1" duration="${duration}" tcStart="0s" tcFormat="NDF">`,
    '          <spine>',
    `            <asset-clip ref="r2" name="${name}" offset="0s" start="0s" duration="${duration}" format="r1">`,
    ...markers.map((marker) => `  ${marker}`),
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

// Premiere imports FCP7 xmeml; sequence markers carry in/out in frames of the
// sequence timebase, and an out of -1 marks a single-frame marker.
export function commentsToPremiereXml(comments: ExportComment[], context: ExportContext): string {
  const { rate } = context;
  const ntsc = rate.den === 1001 ? 'TRUE' : 'FALSE';
  const rateXml = `<rate><timebase>${timecodeBase(rate)}</timebase><ntsc>${ntsc}</ntsc></rate>`;
  const durationFrames = Math.max(1, frameAtMs(context.durationMs, rate));
  const name = xml(context.assetName);
  const markers = markerSpans(comments, rate).map(({ comment, inFrame, outFrame }) =>
    [
      '    <marker>',
      `      <name>${xml(comment.author)}</name>`,
      `      <comment>${xml(comment.body)}</comment>`,
      `      <in>${inFrame}</in>`,
      `      <out>${comment.endMs === null ? -1 : outFrame}</out>`,
      '    </marker>',
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
    `    <timecode>${rateXml}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>`,
    '    <media><video><track>',
    `      <clipitem><name>${name}</name><duration>${durationFrames}</duration>${rateXml}<start>0</start><end>${durationFrames}</end><in>0</in><out>${durationFrames}</out></clipitem>`,
    '    </track></video></media>',
    ...markers,
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
