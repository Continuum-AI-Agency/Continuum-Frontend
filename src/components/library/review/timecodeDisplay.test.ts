import { describe, expect, it } from 'bun:test';
import { formatStageRange, formatStageTime, nextTimecodeDisplay } from './timecodeDisplay';

const NTSC = { num: 30000, den: 1001 };
const source = { startFrame: 107892, dropFrame: true };

describe('formatStageTime', () => {
  it('labels a moment as wall clock, source timecode or frame', () => {
    expect(formatStageTime(1040, 'clock', NTSC, source)).toBe('0:01');
    expect(formatStageTime(1040, 'smpte', NTSC, source)).toBe('01:00:01;01');
    expect(formatStageTime(1040, 'frames', NTSC, source)).toBe('f31');
  });

  it('stays wall clock until the rate is known', () => {
    expect(formatStageTime(1040, 'smpte', null, null)).toBe('0:01');
  });

  it('starts at 00:00:00:00 for a file without a timecode track', () => {
    expect(formatStageTime(1000, 'smpte', { num: 25, den: 1 }, null)).toBe('00:00:01:00');
  });

  it('labels a span end to end', () => {
    expect(formatStageRange(1040, 2002, 'smpte', NTSC, source)).toBe('01:00:01;01–01:00:02;00');
  });
});

describe('nextTimecodeDisplay', () => {
  it('cycles clock → timecode → frames → clock', () => {
    expect(nextTimecodeDisplay('clock')).toBe('smpte');
    expect(nextTimecodeDisplay('smpte')).toBe('frames');
    expect(nextTimecodeDisplay('frames')).toBe('clock');
  });
});
