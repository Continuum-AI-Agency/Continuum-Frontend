import { describe, expect, test } from 'bun:test';
import { cyclePlaybackMode, formatMotionTime, nextPlayhead, parseMotionTime } from './motionChrome';

describe('formatMotionTime / parseMotionTime', () => {
  test('formats seconds as m:ss.mmm and milliseconds as an integer', () => {
    expect(formatMotionTime(65.25, 's')).toBe('1:05.250');
    expect(formatMotionTime(1.5, 'ms')).toBe('1500');
  });

  test('parses both units back to seconds', () => {
    expect(parseMotionTime('1:05.250', 's')).toBeCloseTo(65.25);
    expect(parseMotionTime('1500', 'ms')).toBe(1.5);
    expect(parseMotionTime('nope', 's')).toBeNull();
  });
});

describe('nextPlayhead', () => {
  test('once stops at the end', () => {
    expect(
      nextPlayhead({ playheadSec: 1.9, dtSec: 0.2, totalSec: 2, mode: 'once', direction: 1 }),
    ).toEqual({ playheadSec: 2, direction: 1, stop: true });
  });

  test('once does not stop on a zero-delta frame at the head', () => {
    expect(
      nextPlayhead({ playheadSec: 0, dtSec: 0, totalSec: 2, mode: 'once', direction: 1 }),
    ).toEqual({ playheadSec: 0, direction: 1, stop: false });
  });

  test('loop wraps to the head', () => {
    const next = nextPlayhead({
      playheadSec: 1.9,
      dtSec: 0.2,
      totalSec: 2,
      mode: 'loop',
      direction: 1,
    });
    expect(next.stop).toBe(false);
    expect(next.playheadSec).toBeCloseTo(0.1);
  });

  test('ping-pong reverses at the end', () => {
    const next = nextPlayhead({
      playheadSec: 1.9,
      dtSec: 0.2,
      totalSec: 2,
      mode: 'pingpong',
      direction: 1,
    });
    expect(next.direction).toBe(-1);
    expect(next.playheadSec).toBeCloseTo(1.9);
  });
});

describe('cyclePlaybackMode', () => {
  test('walks once → loop → pingpong → once', () => {
    expect(cyclePlaybackMode('once')).toBe('loop');
    expect(cyclePlaybackMode('loop')).toBe('pingpong');
    expect(cyclePlaybackMode('pingpong')).toBe('once');
  });
});
