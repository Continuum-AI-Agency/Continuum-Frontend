// Every page under /scale is Performance+ and sits behind the paid-media product gate
// (PP-DT-C-campaign-canvas-skips-product-gate). The gate is called per page, so a page added
// under the segment without it opened for a brand with no plan: Diésel landed on the billing
// gate from /scale, ?tab=…, and /scale/approvals, and on a working Campaign Canvas — Save,
// Propose via Jaina, Validate — from /scale/campaign-canvas. This reads every page of the
// segment, so the next one cannot be added without the gate.

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

describe('/scale pages sit behind the product gate', () => {
  it('finds the segment pages', () => {
    const found = pages(SEGMENT).map((path) => relative(SEGMENT, path));
    expect(found).toContain('page.tsx');
    expect(found).toContain('approvals/page.tsx');
    expect(found).toContain('campaign-canvas/page.tsx');
  });

  it('calls ProductGate in every page of the segment', () => {
    const ungated = pages(SEGMENT)
      .filter((path) => !/await ProductGate\(\s*'[\w-]+'\s*\)/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SEGMENT, path));
    expect(ungated).toEqual([]);
  });
});
