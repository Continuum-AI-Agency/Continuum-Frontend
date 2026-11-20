// Every page under /organic is Organic Plus and sits behind its product gate. The gate is called
// per page, so a page added under the segment without it opens for a brand with no plan: the
// Campaign Canvas did so under /scale (PP-DT-C-campaign-canvas-skips-product-gate), and
// /organic/primitives — the planner, reachable by URL — did the same here (deep test 2026-10-31,
// lane K). This reads every page of the segment, so the next one cannot be added without it.

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SEGMENT = join(import.meta.dir);

const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return pages(path);
    return entry === 'page.tsx' ? [path] : [];
  });

describe('/organic pages sit behind the product gate', () => {
  it('finds the segment pages', () => {
    const found = pages(SEGMENT).map((path) => relative(SEGMENT, path));
    expect(found).toContain('page.tsx');
    expect(found).toContain('primitives/page.tsx');
  });

  it('calls the Organic gate in every page of the segment', () => {
    const ungated = pages(SEGMENT)
      .filter((path) => !/await ProductGate\(\s*'organic'\s*\)/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SEGMENT, path));
    expect(ungated).toEqual([]);
  });
});
