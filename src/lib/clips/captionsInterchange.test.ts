import { describe, expect, it } from 'bun:test';
import type { CaptionCue } from '../../StudioCanvas/utils/splice/captionCues';
import { parseCaptionFile, parseSrt, parseVtt, toSrt, toVtt } from './captionsInterchange';

const SRT = [
  '1',
  '00:02:16,612 --> 00:02:19,376',
  "Senator, we're making our final approach.",
  '',
  '2',
  '00:02:19,482 --> 00:02:21,609',
  'Very good, Lieutenant.',
  '',
].join('\n');

const cue = (over: Partial<CaptionCue> = {}): CaptionCue => ({
  id: 'caption-1',
  startSec: 1,
  endSec: 3,
  words: [
    { text: 'you', startSec: 1, endSec: 1.5 },
    { text: 'never', startSec: 1.5, endSec: 2.2, emphasis: true },
    { text: 'lose', startSec: 2.2, endSec: 3 },
  ],
  ...over,
});

describe('parseSrt — the happy path', () => {
  it('reads every cue with millisecond timing', () => {
    const { cues } = parseSrt(SRT);
    expect(cues).toHaveLength(2);
    expect(cues[0].startSec).toBeCloseTo(136.612, 6);
    expect(cues[0].endSec).toBeCloseTo(139.376, 6);
    expect(cues[1].words.map((w) => w.text)).toEqual(['Very', 'good,', 'Lieutenant.']);
  });

  it('synthesises word timings that exactly span the cue', () => {
    const [first] = parseSrt(SRT).cues;
    expect(first.words[0].startSec).toBeCloseTo(first.startSec, 9);
    expect(first.words[first.words.length - 1].endSec).toBeCloseTo(first.endSec, 9);
  });

  it('says out loud that the word timings were estimated', () => {
    // A per-word pop on synthesised timings visibly drifts against the speech, so the UI
    // has to know not to offer it.
    const { warnings, hasRealWordTimings } = parseSrt(SRT);
    expect(hasRealWordTimings).toBe(false);
    expect(warnings.join(' ')).toContain('estimated');
  });
});

describe('parseSrt — the failures that cost exactly one cue', () => {
  it('strips a BOM instead of losing cue 1 to a strict integer parse', () => {
    expect(parseSrt(`﻿${SRT}`).cues).toHaveLength(2);
  });

  it('parses CRLF, bare CR and mixed terminators', () => {
    expect(parseSrt(SRT.replace(/\n/g, '\r\n')).cues).toHaveLength(2);
    // A lone CR makes a naive split see ONE line: zero cues, and no error at all.
    expect(parseSrt(SRT.replace(/\n/g, '\r')).cues).toHaveLength(2);
    expect(parseSrt(SRT.replace('1\n00:02:16', '1\r\n00:02:16')).cues).toHaveLength(2);
  });

  it('accepts any whitespace around the arrow', () => {
    expect(parseSrt(SRT.replace(' --> ', '  -->  ')).cues).toHaveLength(2);
    expect(parseSrt(SRT.replace(' --> ', '\t-->\t')).cues).toHaveLength(2);
  });

  it('treats the index as a framing token only — 0-based, skipping and out of order', () => {
    expect(parseSrt(SRT.replace(/^1$/m, '0').replace(/^2$/m, '1000')).cues).toHaveLength(2);
    expect(parseSrt(SRT.replace(/^1$/m, '7').replace(/^2$/m, '3')).cues).toHaveLength(2);
  });

  it('parses hour fields longer than two digits', () => {
    const long = '1\n100:00:00,000 --> 100:00:02,000\nStill going.\n';
    expect(parseSrt(long).cues[0].startSec).toBeCloseTo(360000, 6);
  });

  it('strips ASS override tags instead of burning them into the video', () => {
    const withTags = '1\n00:00:01,000 --> 00:00:02,000\n{\\an8}Top of frame\n';
    expect(parseSrt(withTags).cues[0].words.map((w) => w.text)).toEqual(['Top', 'of', 'frame']);
  });

  it('strips inline b/i/u/font markup but keeps the words', () => {
    const styled = '1\n00:00:01,000 --> 00:00:02,000\n<b>Bold</b> and <i>italic</i>\n';
    expect(parseSrt(styled).cues[0].words.map((w) => w.text)).toEqual(['Bold', 'and', 'italic']);
  });

  it('tolerates the legacy X1/X2/Y1/Y2 coordinate extension', () => {
    const legacy = '1\n00:00:01,000 --> 00:00:02,000 X1:100 X2:600 Y1:400 Y2:460\nHello\n';
    expect(parseSrt(legacy).cues).toHaveLength(1);
  });

  it('rejects zero-length and inverted cues rather than rendering them invisibly', () => {
    expect(parseSrt('1\n00:00:02,000 --> 00:00:02,000\nInvisible\n').cues).toHaveLength(0);
    expect(parseSrt('1\n00:00:05,000 --> 00:00:02,000\nBackwards\n').cues).toHaveLength(0);
  });

  it('never emits an empty cue', () => {
    expect(parseSrt('1\n00:00:01,000 --> 00:00:02,000\n\n').cues).toHaveLength(0);
  });

  it('loses one malformed block, not the file, and says how many', () => {
    const damaged = `${SRT}\n3\nnot a timestamp\nOrphan text\n`;
    const { cues, warnings } = parseSrt(damaged);
    expect(cues).toHaveLength(2);
    expect(warnings.join(' ')).toContain('1 block(s)');
  });

  it('returns nothing at all for empty input', () => {
    expect(parseSrt('').cues).toEqual([]);
    expect(parseSrt('   \n\n  ').cues).toEqual([]);
  });
});

describe('toSrt', () => {
  it('emits the canonical four-part shape with comma timecodes', () => {
    expect(toSrt([cue()])).toBe('1\n00:00:01,000 --> 00:00:03,000\nyou never lose\n');
  });

  it('renumbers from 1 regardless of the input ids', () => {
    const out = toSrt([cue({ id: 'zz' }), cue({ id: 'aa', startSec: 4, endSec: 6 })]);
    expect(out.split('\n')[0]).toBe('1');
    expect(out).toContain('\n2\n');
  });

  it('escapes an arrow in the payload, which would otherwise be read as a timing line', () => {
    const arrowed = cue({
      words: [
        { text: 'a', startSec: 1, endSec: 2 },
        { text: '-->', startSec: 2, endSec: 3 },
      ],
    });
    expect(toSrt([arrowed])).toContain('a --&gt;');
  });

  it('does NOT escape ampersands, which SRT players render literally', () => {
    const amp = cue({ words: [{ text: 'AT&T', startSec: 1, endSec: 3 }] });
    expect(toSrt([amp])).toContain('AT&T');
    expect(toSrt([amp])).not.toContain('&amp;');
  });

  it('round-trips a canonical file byte-for-byte', () => {
    const { cues } = parseSrt(SRT);
    expect(toSrt(cues)).toBe(SRT.trimEnd() + '\n');
  });

  it('rounds rather than truncates the millisecond field', () => {
    const precise = cue({ startSec: 1.0006, endSec: 3 });
    expect(toSrt([precise])).toContain('00:00:01,001');
  });
});

describe('parseVtt', () => {
  const VTT = [
    'WEBVTT',
    '',
    'STYLE',
    '::cue(.w) { color: #fff; }',
    '',
    'NOTE this is ignored',
    '',
    'line-1',
    '00:00:01.000 --> 00:00:03.000 align:center',
    'you never lose',
    '',
  ].join('\n');

  it('skips the header, STYLE and NOTE blocks', () => {
    const { cues } = parseVtt(VTT);
    expect(cues).toHaveLength(1);
    expect(cues[0].words.map((w) => w.text)).toEqual(['you', 'never', 'lose']);
  });

  it('accepts a VTT timestamp with no hours component', () => {
    const short = 'WEBVTT\n\n01:23.456 --> 01:25.000\nHello\n';
    expect(parseVtt(short).cues[0].startSec).toBeCloseTo(83.456, 6);
  });

  it('reads real word timings from cue timestamp tags', () => {
    const tagged = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:03.000',
      '<c.w>you</c> <00:00:01.500><c.w.em>never</c> <00:00:02.200><c.w>lose</c>',
      '',
    ].join('\n');
    const { cues, hasRealWordTimings } = parseVtt(tagged);
    expect(hasRealWordTimings).toBe(true);
    expect(cues[0].words.map((w) => w.startSec)).toEqual([1, 1.5, 2.2]);
    expect(cues[0].words.map((w) => w.emphasis)).toEqual([undefined, true, undefined]);
  });

  it('maps position and line percentages onto the cue position override', () => {
    const positioned = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000 position:40% line:60%\nHi\n';
    expect(parseVtt(positioned).cues[0].style?.position).toEqual({ xFrac: 0.4, yFrac: 0.6 });
  });

  it('names the cue settings it had to drop', () => {
    const vertical = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000 vertical:rl size:50%\nHi\n';
    expect(parseVtt(vertical).warnings.join(' ')).toContain('size, vertical');
  });

  it('warns rather than silently importing an HLS-offset file', () => {
    const hls =
      'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000\n\n00:00:01.000 --> 00:00:02.000\nHi\n';
    expect(parseVtt(hls).warnings.join(' ')).toContain('X-TIMESTAMP-MAP');
  });

  it('decodes the entities it emits', () => {
    const escaped = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nAT&amp;T &lt;3\n';
    expect(parseVtt(escaped).cues[0].words.map((w) => w.text)).toEqual(['AT&T', '<3']);
  });
});

describe('toVtt', () => {
  it('emits the header with TWO terminators, or browsers reject the whole track', () => {
    expect(toVtt([cue()]).startsWith('WEBVTT\n\n')).toBe(true);
  });

  it('emits a STYLE block, without which timestamp tags render nothing at all', () => {
    const out = toVtt([cue()]);
    expect(out).toContain('STYLE');
    expect(out).toContain('::cue(.w:past)');
  });

  it('wraps every word in a c span — a bare text leaf cannot be matched by ::cue()', () => {
    const out = toVtt([cue()]);
    expect(out).toContain('<c.w>you</c>');
    expect(out).toContain('<c.w.em>never</c>');
  });

  it('omits the tag on the first word, which the spec forbids at the cue start', () => {
    const payload = toVtt([cue()]).split('\n').at(-2) ?? '';
    expect(payload.startsWith('<c.w>you</c>')).toBe(true);
    expect(payload).toContain('<00:00:01.500><c.w.em>never</c>');
  });

  it('emits align:center, never the 2013 draft align:middle', () => {
    expect(toVtt([cue()])).toContain('align:center');
    expect(toVtt([cue()])).not.toContain('align:middle');
  });

  it('escapes ampersands, angle brackets and arrows', () => {
    const nasty = cue({
      words: [
        { text: 'AT&T', startSec: 1, endSec: 2 },
        { text: '5<6', startSec: 2, endSec: 2.5 },
        { text: '-->', startSec: 2.5, endSec: 3 },
      ],
    });
    const out = toVtt([nasty]);
    expect(out).toContain('AT&amp;T');
    expect(out).toContain('5&lt;6');
    expect(out).toContain('--&gt;');
  });

  it('round-trips word timings and emphasis losslessly', () => {
    // The genuine win over SRT, and the reason VTT is the format to prefer.
    const original = cue();
    const { cues, hasRealWordTimings } = parseVtt(toVtt([original]));
    expect(hasRealWordTimings).toBe(true);
    expect(cues[0].words.map((w) => w.text)).toEqual(['you', 'never', 'lose']);
    expect(cues[0].words.map((w) => w.startSec)).toEqual([1, 1.5, 2.2]);
    expect(cues[0].words.map((w) => w.emphasis)).toEqual([undefined, true, undefined]);
    expect(cues[0].startSec).toBe(1);
    expect(cues[0].endSec).toBe(3);
  });

  it('survives a second round trip unchanged', () => {
    const once = toVtt(parseVtt(toVtt([cue()])).cues);
    const twice = toVtt(parseVtt(once).cues);
    expect(twice).toBe(once);
  });

  it('takes its palette from the caption style when one is given', () => {
    const out = toVtt([cue()], {
      textColor: '#111111',
      highlightColor: '#222222',
      outlineColor: '#000000',
      emphasis: { color: '#333333' },
    });
    expect(out).toContain('color: #111111');
    expect(out).toContain('color: #222222');
    expect(out).toContain('color: #333333');
  });
});

describe('parseCaptionFile', () => {
  it('dispatches on the header, because the extension lies often enough to matter', () => {
    expect(parseCaptionFile(SRT).cues).toHaveLength(2);
    expect(parseCaptionFile(toVtt([cue()])).hasRealWordTimings).toBe(true);
    expect(parseCaptionFile(`﻿${toVtt([cue()])}`).hasRealWordTimings).toBe(true);
  });
});
