import { describe, expect, it } from 'bun:test';
import {
  BURN_IN_ANCHORS,
  type HeadlineToken,
  type MeasureText,
  VERNE_TITLE_ANCHOR_OFFSET_Y,
  VERNE_TITLE_BOX_TOP,
  VERNE_TITLE_MEASURE,
  VERNE_TITLE_RIGHT_MARGIN,
} from '@continuum/contracts';

import {
  anchorOrigin,
  type BlockExtent,
  BURN_IN_SNAP_RADIUS,
  blockOrigin,
  blockRect,
  headlineBlockExtent,
  placementOptionsFor,
  snapToAnchor,
} from './burnInPlacement';

const MARGIN = VERNE_TITLE_RIGHT_MARGIN;

/** Two lines of a 0.61 measure on a 1080-wide frame, roughly what the reference headline is. */
const EXTENT: BlockExtent = { widthFrac: VERNE_TITLE_MEASURE, heightFrac: 0.2, lines: 2 };

/** Monospace-ish: every glyph half its body size. Deterministic, and no canvas needed. */
const measureText: MeasureText = (text, style) => text.length * style.sizePx * 0.5;

describe('headlineBlockExtent', () => {
  const tokens: HeadlineToken[] = [
    { text: 'Estudia una carrera internacional', weight: 'light' },
    { text: 'con University of London', weight: 'bold' },
  ];

  it('breaks against the measure and reports the block it produced', () => {
    const extent = headlineBlockExtent({
      tokens,
      frame: { width: 1080, height: 1350 },
      measureText,
      measureFraction: VERNE_TITLE_MEASURE,
    });
    expect(extent.lines).toBeGreaterThan(1);
    expect(extent.widthFrac).toBe(VERNE_TITLE_MEASURE);
    expect(extent.heightFrac).toBeGreaterThan(0);
    expect(extent.heightFrac).toBeLessThan(1);
  });

  // The block is measured in fractions of WIDTH and reported as a fraction of HEIGHT, so the
  // same text on a taller frame is the same pixels and a SMALLER fraction. This is the reason
  // a bottom-anchored block cannot be compared by centroid across two frame sizes.
  it('is the same pixels and a smaller fraction on a taller frame', () => {
    const short = headlineBlockExtent({
      tokens,
      frame: { width: 1080, height: 1350 },
      measureText,
      measureFraction: VERNE_TITLE_MEASURE,
    });
    const tall = headlineBlockExtent({
      tokens,
      frame: { width: 1080, height: 1920 },
      measureText,
      measureFraction: VERNE_TITLE_MEASURE,
    });
    expect(tall.lines).toBe(short.lines);
    expect(short.heightFrac * 1350).toBeCloseTo(tall.heightFrac * 1920, 6);
  });

  it('an empty headline is a zero-height block, not one phantom line', () => {
    const extent = headlineBlockExtent({
      tokens: [],
      frame: { width: 1080, height: 1350 },
      measureText,
      measureFraction: VERNE_TITLE_MEASURE,
    });
    expect(extent.lines).toBe(0);
    expect(extent.heightFrac).toBe(0);
  });
});

describe('anchorOrigin', () => {
  it('pins each of the nine points against the margin it names', () => {
    const left = anchorOrigin('top-left', EXTENT, MARGIN);
    const right = anchorOrigin('bottom-right', EXTENT, MARGIN);
    const middle = anchorOrigin('center', EXTENT, MARGIN);

    expect(left.x).toBeCloseTo(MARGIN, 6);
    expect(left.y).toBeCloseTo(MARGIN, 6);
    expect(right.x + EXTENT.widthFrac).toBeCloseTo(1 - MARGIN, 6);
    expect(right.y + EXTENT.heightFrac).toBeCloseTo(1 - MARGIN, 6);
    expect(middle.x + EXTENT.widthFrac / 2).toBeCloseTo(0.5, 6);
    expect(middle.y + EXTENT.heightFrac / 2).toBeCloseTo(0.5, 6);
  });

  it('gives nine DISTINCT places for a block that fits', () => {
    const seen = new Set(
      BURN_IN_ANCHORS.map((anchor) => {
        const point = anchorOrigin(anchor, EXTENT, MARGIN);
        return `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
      }),
    );
    expect(seen.size).toBe(9);
  });

  it('never puts the block off the frame, however wide the margin', () => {
    for (const anchor of BURN_IN_ANCHORS) {
      const point = anchorOrigin(anchor, { widthFrac: 0.9, heightFrac: 0.9, lines: 4 }, 0.4);
      expect(point.x, anchor).toBeGreaterThanOrEqual(0);
      expect(point.y, anchor).toBeGreaterThanOrEqual(0);
      expect(point.x + 0.9, anchor).toBeLessThanOrEqual(1 + 1e-9);
      expect(point.y + 0.9, anchor).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('placementOptionsFor', () => {
  // The whole contract with `titleBox`: `[x1 - measure, x1]` with `x1 = 1 - rightMarginFraction`
  // must come back out as exactly the box the placement described.
  it('round-trips the block through the options titleBox reads', () => {
    const placement = {
      anchor: 'bottom-left' as const,
      offsetX: 0,
      offsetY: 0,
      marginFrac: MARGIN,
    };
    const options = placementOptionsFor(placement, EXTENT);
    const rect = blockRect(placement, EXTENT);

    expect(1 - options.rightMarginFraction - options.measureFraction).toBeCloseTo(rect.x0, 6);
    expect(1 - options.rightMarginFraction).toBeCloseTo(rect.x1, 6);
    expect(options.boxTop).toBeCloseTo(rect.y0, 6);
    expect(options.boxBottom).toBeCloseTo(rect.y1, 6);
  });

  // The default config is `top-right` plus the calibrated nudge; it has to reproduce the
  // reference band exactly or the move to an anchor model quietly re-placed every headline.
  it('reproduces the calibrated reference placement from the default config', () => {
    const options = placementOptionsFor(
      {
        anchor: 'top-right',
        offsetX: 0,
        offsetY: VERNE_TITLE_ANCHOR_OFFSET_Y,
        marginFrac: VERNE_TITLE_RIGHT_MARGIN,
      },
      { widthFrac: VERNE_TITLE_MEASURE, heightFrac: 0.2, lines: 2 },
    );
    expect(options.rightMarginFraction).toBeCloseTo(VERNE_TITLE_RIGHT_MARGIN, 6);
    expect(options.boxTop).toBeCloseTo(VERNE_TITLE_BOX_TOP, 6);
  });

  it('an offset moves the box, which is what the contrast probe then reads', () => {
    const base = { anchor: 'top-right' as const, offsetX: 0, offsetY: 0, marginFrac: MARGIN };
    const moved = { ...base, offsetX: -0.2, offsetY: 0.3 };
    const before = placementOptionsFor(base, EXTENT);
    const after = placementOptionsFor(moved, EXTENT);

    expect(after.rightMarginFraction).toBeCloseTo(before.rightMarginFraction + 0.2, 6);
    expect(after.boxTop).toBeCloseTo(before.boxTop + 0.3, 6);
    expect(after.boxBottom).toBeCloseTo(before.boxBottom + 0.3, 6);
  });
});

describe('snapToAnchor', () => {
  it('a release inside the radius lands ON the anchor and CLEARS the offset', () => {
    const target = anchorOrigin('bottom-right', EXTENT, MARGIN);
    const result = snapToAnchor(
      { x: target.x + BURN_IN_SNAP_RADIUS / 3, y: target.y - BURN_IN_SNAP_RADIUS / 3 },
      EXTENT,
      MARGIN,
    );
    expect(result.snapped).toBe(true);
    expect(result.anchor).toBe('bottom-right');
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
    // And the placement it produced is byte-for-byte the anchor's own place.
    expect(blockOrigin(result, EXTENT).x).toBeCloseTo(target.x, 6);
    expect(blockOrigin(result, EXTENT).y).toBeCloseTo(target.y, 6);
  });

  it('a release outside the radius keeps its fraction, against the NEAREST anchor', () => {
    const target = anchorOrigin('center', EXTENT, MARGIN);
    const dropped = { x: target.x + 0.05, y: target.y + 0.09 };
    const result = snapToAnchor(dropped, EXTENT, MARGIN);

    expect(result.snapped).toBe(false);
    expect(result.anchor).toBe('center');
    expect(result.offsetX).toBeCloseTo(0.05, 3);
    expect(result.offsetY).toBeCloseTo(0.09, 3);
    // The residual reconstructs where the user actually let go.
    expect(blockOrigin(result, EXTENT).x).toBeCloseTo(dropped.x, 3);
    expect(blockOrigin(result, EXTENT).y).toBeCloseTo(dropped.y, 3);
  });

  // An unsnapped placement is a residual off the NEAREST point, never off whichever anchor
  // the node happened to be set to before the drag — otherwise a nudge from `top-right` to
  // the bottom of the frame stores a 0.7 offset that no longer means anything if the block
  // changes height.
  it('re-bases an unsnapped drop onto the anchor it ended up nearest', () => {
    const near = anchorOrigin('bottom-left', EXTENT, MARGIN);
    const result = snapToAnchor({ x: near.x + 0.04, y: near.y - 0.07 }, EXTENT, MARGIN);
    expect(result.snapped).toBe(false);
    expect(result.anchor).toBe('bottom-left');
  });

  it('every anchor snaps to itself', () => {
    for (const anchor of BURN_IN_ANCHORS) {
      const result = snapToAnchor(anchorOrigin(anchor, EXTENT, MARGIN), EXTENT, MARGIN);
      expect(result.snapped, anchor).toBe(true);
      expect(result.anchor, anchor).toBe(anchor);
    }
  });
});
