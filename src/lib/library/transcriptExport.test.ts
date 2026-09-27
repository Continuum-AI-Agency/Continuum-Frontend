import { describe, expect, it } from 'bun:test';
import { toSrt, toTxt, toVtt } from './transcriptExport';

const OUT_OF_ORDER = [
  { startMs: 1500, endMs: 3000, text: 'Nothing else.' },
  { startMs: 0, endMs: 1500, text: 'Cold pressed.' },
];

describe('toSrt', () => {
  it('numbers cues in spoken order with comma-millisecond timestamps', () => {
    expect(toSrt(OUT_OF_ORDER)).toBe(
      '1\n00:00:00,000 --> 00:00:01,500\nCold pressed.\n\n' +
        '2\n00:00:01,500 --> 00:00:03,000\nNothing else.\n',
    );
  });

  it('carries hours past the first hour', () => {
    expect(toSrt([{ startMs: 3_723_004, endMs: 36_000_000, text: 'Late line' }])).toBe(
      '1\n01:02:03,004 --> 10:00:00,000\nLate line\n',
    );
  });

  it('collapses a blank line inside a cue so it cannot split the cue', () => {
    expect(toSrt([{ startMs: 0, endMs: 10, text: 'one\n\ntwo' }])).toBe(
      '1\n00:00:00,000 --> 00:00:00,010\none\ntwo\n',
    );
  });

  it('is empty for no segments', () => {
    expect(toSrt([])).toBe('');
  });
});

describe('toVtt', () => {
  it('writes the WEBVTT header, the language when known, and dot-millisecond cues', () => {
    expect(toVtt(OUT_OF_ORDER, 'es')).toBe(
      'WEBVTT\nLanguage: es\n\n' +
        '00:00:00.000 --> 00:00:01.500\nCold pressed.\n\n' +
        '00:00:01.500 --> 00:00:03.000\nNothing else.\n',
    );
  });

  it('omits the language line when unknown and handles >1h timestamps', () => {
    expect(toVtt([{ startMs: 3_600_000, endMs: 3_601_250, text: 'Hour' }], null)).toBe(
      'WEBVTT\n\n01:00:00.000 --> 01:00:01.250\nHour\n',
    );
  });

  it('is a bare header for no segments', () => {
    expect(toVtt([])).toBe('WEBVTT\n');
  });
});

describe('toTxt', () => {
  it('writes the spoken lines in order without timecodes', () => {
    expect(toTxt('ignored', OUT_OF_ORDER)).toBe('Cold pressed.\nNothing else.\n');
  });

  it('falls back to the flat transcript when there are no timecodes', () => {
    expect(toTxt('  Just words.  ', [])).toBe('Just words.\n');
  });

  it('is empty when nothing was said', () => {
    expect(toTxt(null, [])).toBe('');
    expect(toTxt('', [])).toBe('');
  });
});
