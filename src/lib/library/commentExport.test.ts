import { describe, expect, it } from 'bun:test';
import {
  commentsToCsv,
  commentsToFcpxml,
  commentsToPremiereXml,
  commentsToResolveEdl,
  type ExportComment,
  exportCommentsForVersion,
  frameAtMs,
  framesForTimecode,
  msForFrame,
  snapFrameRate,
  timecodeForFrame,
} from './commentExport';

const NTSC = { num: 30000, den: 1001 };
const PAL = { num: 25, den: 1 };

const comment = (overrides: Partial<ExportComment>): ExportComment => ({
  id: 'c1',
  author: 'Ana Ruiz',
  body: 'Logo too small',
  timeMs: 0,
  endMs: null,
  createdAt: '2026-09-27T10:00:00.000Z',
  resolved: false,
  visibility: 'internal',
  ...overrides,
});

describe('frame rate', () => {
  it('snaps a measured NTSC rate to its exact 1001 fraction', () => {
    expect(snapFrameRate(29.97002997)).toEqual(NTSC);
    expect(snapFrameRate(23.976)).toEqual({ num: 24000, den: 1001 });
    expect(snapFrameRate(25.0001)).toEqual(PAL);
    expect(snapFrameRate(30)).toEqual({ num: 30, den: 1 });
    expect(snapFrameRate(29.9701)).toEqual(NTSC);
  });

  it('keeps an unusual rate instead of forcing a standard one', () => {
    expect(snapFrameRate(12.5)).toEqual({ num: 12500, den: 1000 });
  });

  it('refuses a rate that cannot place a frame', () => {
    expect(() => snapFrameRate(0)).toThrow();
    expect(() => snapFrameRate(Number.NaN)).toThrow();
  });

  it('maps every frame start back onto the same frame', () => {
    for (const rate of [NTSC, PAL, { num: 24000, den: 1001 }, { num: 60, den: 1 }]) {
      for (let frame = 0; frame < 2000; frame += 7) {
        expect(frameAtMs(msForFrame(frame, rate), rate)).toBe(frame);
      }
    }
  });

  it('places a time inside a frame on that frame', () => {
    expect(frameAtMs(1000, PAL)).toBe(25);
    expect(frameAtMs(1039, PAL)).toBe(25);
    expect(frameAtMs(1040, PAL)).toBe(26);
    expect(frameAtMs(1001, NTSC)).toBe(30);
  });

  it('writes non-drop timecode at the rounded timebase', () => {
    expect(timecodeForFrame(0, PAL)).toBe('00:00:00:00');
    expect(timecodeForFrame(25 * 3661 + 24, PAL)).toBe('01:01:01:24');
    expect(timecodeForFrame(30, NTSC)).toBe('00:00:01:00');
  });
});

const context = { assetName: 'Spot "A" & B', rate: PAL, durationMs: 10_000 };
const comments = [
  comment({ id: 'range', timeMs: 2000, endMs: 3000, body: 'Range, "quoted"' }),
  comment({ id: 'point', timeMs: 1040 }),
];

describe('CSV', () => {
  it('lists markers in time order with frames and escaped text', () => {
    const lines = commentsToCsv(comments, context).trim().split('\r\n');
    expect(lines[0]).toStartWith('Comment ID,Author,Timecode In');
    expect(lines[1]).toStartWith('point,Ana Ruiz,00:00:01:01,00:00:01:02,26,27,1040,1040');
    expect(lines[2]).toContain('range,Ana Ruiz,00:00:02:00,00:00:03:01,50,76');
    expect(lines[2]).toContain('"Range, ""quoted"""');
  });
});

describe('Resolve EDL', () => {
  it('puts each marker on its record-in frame with a frame duration', () => {
    const edl = commentsToResolveEdl(comments, context);
    expect(edl).toContain('FCM: NON-DROP FRAME');
    expect(edl).toContain(
      '001  001      V     C        00:00:01:01 00:00:01:02 00:00:01:01 00:00:01:02',
    );
    expect(edl).toContain('|M:Ana Ruiz: Logo too small |D:1');
    expect(edl).toContain('002  001      V     C        00:00:02:00 00:00:02:01');
    expect(edl).toContain('|D:26');
  });
});

describe('FCPXML', () => {
  it('writes rational marker times at the exact frame duration', () => {
    const fcpxml = commentsToFcpxml(comments, { ...context, rate: NTSC });
    expect(fcpxml).toContain('frameDuration="1001/30000s"');
    // 1040 ms at 29.97 → frame 31; 31 · 1001 / 30000 s.
    expect(fcpxml).toContain(`<marker start="${31 * 1001}/30000s" duration="1001/30000s"`);
    expect(fcpxml).toContain('name="Spot &quot;A&quot; &amp; B"');
  });
});

describe('Premiere xmeml', () => {
  it('writes in/out frames, -1 out for a single frame', () => {
    const xmeml = commentsToPremiereXml(comments, { ...context, rate: NTSC });
    expect(xmeml).toContain('<rate><timebase>30</timebase><ntsc>TRUE</ntsc></rate>');
    expect(xmeml).toMatch(/<in>31<\/in>\s*<out>-1<\/out>/);
    expect(xmeml).toContain(`<in>${frameAtMs(2000, NTSC)}</in>`);
    expect(xmeml).toContain(`<out>${frameAtMs(3000, NTSC) + 1}</out>`);
  });
});

describe('exportCommentsForVersion', () => {
  const row = (id: string, extra: Record<string, unknown>) => ({
    id,
    brandId: 'b',
    assetId: 'a',
    body: id,
    mentions: [],
    attachments: [],
    createdAt: `2026-09-27T10:00:0${id.length}.000Z`,
    updatedAt: '2026-09-27T10:00:00.000Z',
    ...extra,
  });

  it('keeps timed threads of the version, replies at their root time', () => {
    const exported = exportCommentsForVersion(
      [
        row('root', { versionId: 'v2', annotation: { kind: 'time', timeMs: 500, endMs: 900 } }),
        row('reply', { versionId: 'v2', parentCommentId: 'root' }),
        row('legacy', { versionId: null, annotation: { kind: 'time', timeMs: 100 } }),
        row('old', { versionId: 'v1', annotation: { kind: 'time', timeMs: 100 } }),
        row('pin', { versionId: 'v2', annotation: { kind: 'point', x: 0.5, y: 0.5 } }),
      ],
      { versionId: 'v2', headVersionId: 'v2', authorOf: () => 'Ana' },
    );
    expect(exported.map((c) => [c.id, c.timeMs, c.endMs])).toEqual([
      ['root', 500, 900],
      ['reply', 500, 900],
      ['legacy', 100, null],
    ]);
  });
});

describe('source timecode', () => {
  it('counts drop-frame at 29.97: minute labels skip ;00 and ;01 except each tenth', () => {
    expect(timecodeForFrame(1799, NTSC, true)).toBe('00:00:59;29');
    expect(timecodeForFrame(1800, NTSC, true)).toBe('00:01:00;02');
    expect(timecodeForFrame(17982, NTSC, true)).toBe('00:10:00;00');
    expect(timecodeForFrame(107892, NTSC, true)).toBe('01:00:00;00');
  });

  it('round-trips drop-frame and non-drop strings to frame counts', () => {
    for (const frame of [0, 1799, 1800, 17981, 17982, 107892, 123456]) {
      expect(framesForTimecode(timecodeForFrame(frame, NTSC, true), NTSC, true)).toBe(frame);
      expect(framesForTimecode(timecodeForFrame(frame, PAL), PAL)).toBe(frame);
    }
  });

  it('ignores a drop-frame flag on a rate that cannot drop', () => {
    expect(timecodeForFrame(1500, PAL, true)).toBe('00:01:00:00');
  });

  const source = { startFrame: 107892, dropFrame: true };
  const withSource = {
    assetName: 'Spot',
    fileName: 'spot a.mov',
    rate: NTSC,
    durationMs: 10_000,
    source,
  };

  it('offsets EDL record times by the start timecode and declares drop-frame', () => {
    const edl = commentsToResolveEdl(comments, withSource);
    expect(edl).toContain('FCM: DROP FRAME');
    // 1040 ms → frame 31 → 01:00:00;00 + 31 frames.
    expect(edl).toContain('01:00:01;01 01:00:01;02 01:00:01;01 01:00:01;02');
  });

  it('anchors FCPXML markers on a clip with a media reference at the source start', () => {
    const fcpxml = commentsToFcpxml(comments, withSource);
    expect(fcpxml).toContain(`start="${107892 * 1001}/30000s"`);
    expect(fcpxml).toContain('<media-rep kind="original-media" src="file:///spot%20a.mov"/>');
    expect(fcpxml).toContain(`<marker start="${(107892 + 31) * 1001}/30000s"`);
    expect(fcpxml).toContain('tcFormat="DF"');
  });

  it('puts Premiere markers inside a clipitem whose file carries the timecode', () => {
    const xmeml = commentsToPremiereXml(comments, withSource);
    const clip = xmeml.slice(xmeml.indexOf('<clipitem'), xmeml.indexOf('</clipitem>'));
    expect(clip).toContain('<pathurl>file://localhost/spot%20a.mov</pathurl>');
    expect(clip).toContain(
      '<string>01:00:00;00</string><frame>107892</frame><displayformat>DF</displayformat>',
    );
    expect(clip).toMatch(/<marker>[\s\S]*<in>31<\/in>/);
  });

  it('writes source timecodes in the CSV', () => {
    const lines = commentsToCsv(comments, withSource).trim().split('\r\n');
    expect(lines[1]).toContain('01:00:01;01');
  });
});
