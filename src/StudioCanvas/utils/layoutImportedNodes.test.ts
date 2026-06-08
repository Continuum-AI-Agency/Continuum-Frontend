import { describe, expect, it } from "bun:test";

import { layoutInRow } from "./layoutImportedNodes";

const opts = { size: 100, gap: 20, perRow: 4 };

describe("layoutInRow", () => {
  it("returns an empty array for zero items", () => {
    expect(layoutInRow(0, { x: 0, y: 0 }, opts)).toEqual([]);
  });

  it("centers a single node on the base point", () => {
    const [p] = layoutInRow(1, { x: 0, y: 0 }, opts);
    expect(p).toEqual({ x: -50, y: -50 });
  });

  it("lays a sub-row out horizontally, centered, on one line", () => {
    const points = layoutInRow(3, { x: 0, y: 0 }, opts);
    expect(points.map((p) => p.x)).toEqual([-170, -50, 70]);
    expect(points.every((p) => p.y === -50)).toBe(true);
  });

  it("wraps to a new row after perRow items", () => {
    const points = layoutInRow(5, { x: 0, y: 0 }, opts);
    expect(points).toHaveLength(5);
    // first 4 share the top row, the 5th drops to the next row
    const topRowY = points[0].y;
    expect(points.slice(0, 4).every((p) => p.y === topRowY)).toBe(true);
    expect(points[4].y).toBeGreaterThan(topRowY);
    expect(points[4]).toEqual({ x: -50, y: 10 });
  });

  it("spaces adjacent nodes by at least their size so they do not overlap", () => {
    const points = layoutInRow(2, { x: 0, y: 0 }, opts);
    expect(points[1].x - points[0].x).toBeGreaterThanOrEqual(opts.size);
  });
});
