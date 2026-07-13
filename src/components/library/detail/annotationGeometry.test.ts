import { describe, expect, test } from 'bun:test';
import {
  composerAnchor,
  containerPointToNormalized,
  fitContentRect,
  formatTimecode,
  formatTimecodeRange,
  isMeaningfulBox,
  normalizedBoxFromPoints,
  normalizedBoxToCssRect,
  seekFraction,
  seekSpan,
} from './annotationGeometry';

describe('fitContentRect', () => {
  test('landscape media in a wider container letterboxes horizontally', () => {
    // 1000x500 container, 800x600 media -> scale 500/600, centered on x.
    const rect = fitContentRect({ width: 1000, height: 500 }, { width: 800, height: 600 });
    expect(rect).not.toBeNull();
    expect(rect?.height).toBeCloseTo(500);
    expect(rect?.width).toBeCloseTo(800 * (500 / 600));
    expect(rect?.top).toBeCloseTo(0);
    expect(rect?.left).toBeCloseTo((1000 - 800 * (500 / 600)) / 2);
  });

  test('portrait media in a landscape container letterboxes vertically is centered', () => {
    const rect = fitContentRect({ width: 1200, height: 800 }, { width: 400, height: 800 });
    expect(rect?.width).toBeCloseTo(400);
    expect(rect?.height).toBeCloseTo(800);
    expect(rect?.left).toBeCloseTo(400);
    expect(rect?.top).toBeCloseTo(0);
  });

  test('exact aspect match fills the container', () => {
    const rect = fitContentRect({ width: 640, height: 480 }, { width: 1280, height: 960 });
    expect(rect).toEqual({ left: 0, top: 0, width: 640, height: 480 });
  });

  test('degenerate container or media returns null', () => {
    expect(fitContentRect({ width: 0, height: 100 }, { width: 10, height: 10 })).toBeNull();
    expect(fitContentRect({ width: 100, height: 100 }, { width: 0, height: 0 })).toBeNull();
  });
});

describe('containerPointToNormalized', () => {
  const content = { left: 100, top: 50, width: 800, height: 400 };

  test('maps content corners to 0..1', () => {
    expect(containerPointToNormalized({ x: 100, y: 50 }, content)).toEqual({ x: 0, y: 0 });
    expect(containerPointToNormalized({ x: 900, y: 450 }, content)).toEqual({ x: 1, y: 1 });
    expect(containerPointToNormalized({ x: 500, y: 250 }, content)).toEqual({ x: 0.5, y: 0.5 });
  });

  test('clamps points in the letterbox gutter', () => {
    expect(containerPointToNormalized({ x: 0, y: 0 }, content)).toEqual({ x: 0, y: 0 });
    expect(containerPointToNormalized({ x: 2000, y: 2000 }, content)).toEqual({ x: 1, y: 1 });
  });
});

describe('normalizedBoxFromPoints', () => {
  test('is corner-order independent', () => {
    const expected = { x: 0.2, y: 0.1, width: 0.3, height: 0.4 };
    expect(normalizedBoxFromPoints({ x: 0.2, y: 0.1 }, { x: 0.5, y: 0.5 })).toEqual(expected);
    const flipped = normalizedBoxFromPoints({ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.1 });
    expect(flipped.x).toBeCloseTo(0.2);
    expect(flipped.y).toBeCloseTo(0.1);
    expect(flipped.width).toBeCloseTo(0.3);
    expect(flipped.height).toBeCloseTo(0.4);
  });

  test('clamps out-of-range points', () => {
    const box = normalizedBoxFromPoints({ x: -0.5, y: 0.5 }, { x: 1.5, y: 0.9 });
    expect(box).toEqual({ x: 0, y: 0.5, width: 1, height: 0.4 });
  });
});

describe('isMeaningfulBox', () => {
  test('tiny drags read as clicks', () => {
    expect(isMeaningfulBox({ x: 0.5, y: 0.5, width: 0.001, height: 0.002 })).toBe(false);
  });

  test('a thin but long box still counts', () => {
    expect(isMeaningfulBox({ x: 0, y: 0, width: 0.5, height: 0.001 })).toBe(true);
  });
});

describe('normalizedBoxToCssRect', () => {
  test('round-trips through the content rect', () => {
    const content = { left: 100, top: 50, width: 800, height: 400 };
    const box = { x: 0.25, y: 0.5, width: 0.5, height: 0.25 };
    const rect = normalizedBoxToCssRect(box, content);
    expect(rect).toEqual({ left: 300, top: 250, width: 400, height: 100 });
    const back = normalizedBoxFromPoints(
      containerPointToNormalized({ x: rect.left, y: rect.top }, content),
      containerPointToNormalized({ x: rect.left + rect.width, y: rect.top + rect.height }, content),
    );
    expect(back.x).toBeCloseTo(box.x);
    expect(back.y).toBeCloseTo(box.y);
    expect(back.width).toBeCloseTo(box.width);
    expect(back.height).toBeCloseTo(box.height);
  });
});

describe('composerAnchor', () => {
  const content = { left: 0, top: 0, width: 1000, height: 600 };
  const container = { width: 1000, height: 600 };

  test('places below the box by default', () => {
    const anchor = composerAnchor(
      { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      content,
      container,
      280,
    );
    expect(anchor.placement).toBe('below');
    expect(anchor.top).toBeCloseTo(0.3 * 600 + 8);
    expect(anchor.left).toBeCloseTo(100);
  });

  test('flips above when the box bottom is in the lower third', () => {
    const anchor = composerAnchor(
      { x: 0.1, y: 0.7, width: 0.2, height: 0.2 },
      content,
      container,
      280,
    );
    expect(anchor.placement).toBe('above');
    expect(anchor.top).toBeCloseTo(0.7 * 600 - 8);
  });

  test('clamps left so the panel stays inside the container', () => {
    const anchor = composerAnchor(
      { x: 0.95, y: 0.1, width: 0.04, height: 0.05 },
      content,
      container,
      280,
    );
    expect(anchor.left).toBe(1000 - 280 - 8);
  });
});

describe('seekFraction', () => {
  test('maps time to 0..1 and clamps', () => {
    expect(seekFraction(5000, 10000)).toBe(0.5);
    expect(seekFraction(20000, 10000)).toBe(1);
    expect(seekFraction(-5, 10000)).toBe(0);
    expect(seekFraction(1000, 0)).toBe(0);
  });
});

describe('seekSpan', () => {
  test('maps a range to left/width fractions of the scrubber', () => {
    const span = seekSpan(2000, 6000, 10000);
    expect(span.left).toBeCloseTo(0.2);
    expect(span.width).toBeCloseTo(0.4);
  });

  test('clamps an end that outruns the duration', () => {
    const span = seekSpan(8000, 20000, 10000);
    expect(span.left).toBeCloseTo(0.8);
    expect(span.width).toBeCloseTo(0.2);
  });

  test('an inverted range collapses to zero width rather than a negative bar', () => {
    expect(seekSpan(6000, 2000, 10000)).toEqual({ left: 0.6, width: 0 });
  });

  test('an unknown duration collapses to the lane origin', () => {
    expect(seekSpan(1000, 2000, 0)).toEqual({ left: 0, width: 0 });
  });
});

describe('formatTimecodeRange', () => {
  test('a point renders as a single timecode', () => {
    expect(formatTimecodeRange(75_000, null)).toBe('1:15');
  });

  test('a range renders as start–end', () => {
    expect(formatTimecodeRange(75_000, 90_000)).toBe('1:15–1:30');
  });
});

describe('formatTimecode', () => {
  test('formats sub-hour as m:ss', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(12_340)).toBe('0:12');
    expect(formatTimecode(75_000)).toBe('1:15');
    expect(formatTimecode(600_000)).toBe('10:00');
  });

  test('formats hour-plus as h:mm:ss', () => {
    expect(formatTimecode(3_600_000)).toBe('1:00:00');
    expect(formatTimecode(3_725_000)).toBe('1:02:05');
  });

  test('negative times clamp to zero', () => {
    expect(formatTimecode(-500)).toBe('0:00');
  });
});
