import { describe, expect, it } from 'bun:test';
import {
  escapeXml,
  framesFor,
  type NleClip,
  nleClipsFrom,
  timecodeFor,
  toEdlCmx3600,
  toFcpxml,
} from './nleExport';

const CLIPS: NleClip[] = [
  { id: 'a', name: 'clip-1', timelineStartSec: 0, durationSec: 5, sourceInSec: 0 },
  { id: 'b', name: 'clip-2', timelineStartSec: 5, durationSec: 2.5, sourceInSec: 1.5 },
  { id: 'c', name: 'clip-3', timelineStartSec: 7.5, durationSec: 3, sourceInSec: 0 },
];

describe('timecodeFor', () => {
  it('formats HH:MM:SS:FF at 30 fps non-drop', () => {
    expect(timecodeFor(0)).toBe('00:00:00:00');
    expect(timecodeFor(1)).toBe('00:00:01:00');
    expect(timecodeFor(1.5)).toBe('00:00:01:15');
    expect(timecodeFor(61.1)).toBe('00:01:01:03');
    expect(timecodeFor(3600)).toBe('01:00:00:00');
  });

  it('wraps hours at 24 — a two-digit CMX field cannot hold more', () => {
    expect(timecodeFor(24 * 3600)).toBe('00:00:00:00');
    expect(timecodeFor(25 * 3600)).toBe('01:00:00:00');
  });

  it('rounds to whole frames rather than truncating', () => {
    // 0.4834s * 30 = 14.5 frames -> 15, not 14.
    expect(framesFor(0.4834)).toBe(15);
    expect(timecodeFor(0.4834)).toBe('00:00:00:15');
  });

  it('treats a negative or non-finite duration as zero', () => {
    expect(framesFor(-3)).toBe(0);
    expect(framesFor(Number.NaN)).toBe(0);
  });

  it('honours a non-30 fps grid', () => {
    expect(timecodeFor(1, 24)).toBe('00:00:01:00');
    expect(timecodeFor(1.5, 24)).toBe('00:00:01:12');
  });
});

describe('toEdlCmx3600', () => {
  it('matches the fixed-width CMX3600 golden', () => {
    expect(toEdlCmx3600(CLIPS, { title: 'Bench Timeline' })).toBe(
      [
        'TITLE: Bench Timeline',
        'FCM: NON-DROP FRAME',
        '',
        '001  AX       V     C        00:00:00:00 00:00:05:00 00:00:00:00 00:00:05:00',
        '* FROM CLIP NAME: clip-1',
        '',
        '002  AX       V     C        00:00:01:15 00:00:04:00 00:00:05:00 00:00:07:15',
        '* FROM CLIP NAME: clip-2',
        '',
        '003  AX       V     C        00:00:00:00 00:00:03:00 00:00:07:15 00:00:10:15',
        '* FROM CLIP NAME: clip-3',
        '',
      ].join('\n'),
    );
  });

  it('emits the two-line C+D pair for a dissolve rather than dropping it', () => {
    const lines = toEdlCmx3600([{ ...CLIPS[1], dissolveInSec: 1 }]).split('\n');
    const events = lines.filter((line) => line.startsWith('001'));
    expect(events).toHaveLength(2);
    expect(events[0]).toContain(' C ');
    // Dissolve length in frames, zero-padded to 3: 1s at 30fps.
    expect(events[1]).toContain('D    030 ');
    expect(events[1]).toContain('00:00:05:00 00:00:07:15');
  });

  it('produces only the header for an empty timeline', () => {
    expect(toEdlCmx3600([])).toBe('TITLE: Continuum Timeline\nFCM: NON-DROP FRAME\n');
  });
});

describe('toFcpxml', () => {
  // `bun-test-setup.ts` installs happy-dom's window but does not hoist DOMParser to a
  // global, so reach it through the window rather than editing a setup file every
  // other suite in the app also loads.
  const parse = (xml: string): Document =>
    new window.DOMParser().parseFromString(xml, 'application/xml');

  it('parses, with one asset-clip per timeline clip', () => {
    const doc = parse(toFcpxml(CLIPS, { title: 'Bench Timeline' }));
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.getElementsByTagName('asset-clip')).toHaveLength(3);
    expect(doc.documentElement.getAttribute('version')).toBe('1.10');
  });

  it('carries timecodes as exact rationals matching the timeline', () => {
    const doc = parse(toFcpxml(CLIPS));
    const clips = [...doc.getElementsByTagName('asset-clip')];
    expect(clips.map((clip) => clip.getAttribute('offset'))).toEqual([
      '0/30s',
      '150/30s',
      '225/30s',
    ]);
    expect(clips.map((clip) => clip.getAttribute('duration'))).toEqual([
      '150/30s',
      '75/30s',
      '90/30s',
    ]);
    expect(clips.map((clip) => clip.getAttribute('start'))).toEqual(['0/30s', '45/30s', '0/30s']);
    // Sequence length is the last clip's end: 7.5 + 3 = 10.5s.
    expect(doc.getElementsByTagName('sequence')[0].getAttribute('duration')).toBe('315/30s');
  });

  it('declares the requested frame size on the format resource', () => {
    const doc = parse(toFcpxml(CLIPS, { width: 1920, height: 1080 }));
    const format = doc.getElementsByTagName('format')[0];
    expect(format.getAttribute('width')).toBe('1920');
    expect(format.getAttribute('height')).toBe('1080');
    expect(format.getAttribute('frameDuration')).toBe('1/30s');
  });

  it('gives each asset enough length to contain its trimmed range', () => {
    const doc = parse(toFcpxml(CLIPS));
    // clip-2 is trimmed in at 1.5s for 2.5s, so its asset must run to 4s.
    expect(doc.getElementsByTagName('asset')[1].getAttribute('duration')).toBe('120/30s');
  });

  it('escapes names so an ampersand cannot produce an unopenable file', () => {
    const doc = parse(toFcpxml([{ ...CLIPS[0], name: 'A & B <raw>' }], { title: 'Q&A' }));
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.getElementsByTagName('asset-clip')[0].getAttribute('name')).toBe('A & B <raw>');
  });

  it('parses with no clips at all', () => {
    const doc = parse(toFcpxml([]));
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.getElementsByTagName('asset-clip')).toHaveLength(0);
  });
});

describe('escapeXml', () => {
  it('escapes the five XML entities', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });
});

describe('nleClipsFrom', () => {
  it('maps layout placements, carrying trim and cross-dissolves', () => {
    const clips = nleClipsFrom(
      [
        { item: { id: 'a', sourceNodeId: 'n1' }, startSec: 0, durationSec: 4 },
        {
          item: {
            id: 'b',
            sourceNodeId: 'n2',
            trimStartSec: 2,
            transition: { type: 'crossDissolve', durationSec: 0.5 },
          },
          startSec: 4,
          durationSec: 3,
        },
        {
          item: { id: 'c', sourceNodeId: 'n3', transition: { type: 'fade', durationSec: 1 } },
          startSec: 7,
          durationSec: 2,
        },
      ],
      (sourceNodeId) => sourceNodeId,
    );
    expect(clips[0]).toEqual({
      id: 'a',
      name: 'n1',
      timelineStartSec: 0,
      durationSec: 4,
      sourceInSec: 0,
    });
    expect(clips[1].sourceInSec).toBe(2);
    expect(clips[1].dissolveInSec).toBe(0.5);
    // Only a cross-dissolve is a D event; a fade is not an EDL dissolve between clips.
    expect(clips[2].dissolveInSec).toBeUndefined();
  });
});
