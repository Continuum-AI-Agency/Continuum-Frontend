// PP-DT-C-canvas-chip-contrast-4.34: the Canvas's selected pills paint `text-primary-ink` on their
// own `bg-primary/12` tint — #5a48f9 on #e2dffe, 4.34:1 for 13 px text, under AA's 4.5:1 (axe,
// lane C, tablet). text-primary-ink passes on white; on its own tint it does not. This reads the
// Canvas sources so the pair cannot come back in a new control.

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CANVAS = import.meta.dir;

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [path] : [];
  });

const FAILING_PAIR = /bg-primary\/12[^'"`]*text-primary-ink|text-primary-ink[^'"`]*bg-primary\/12/;

describe('Campaign Canvas tinted chips', () => {
  it('never paints primary ink on its own 12% primary tint', () => {
    const offenders = sources(CANVAS)
      .filter((path) => FAILING_PAIR.test(readFileSync(path, 'utf8')))
      .map((path) => relative(CANVAS, path));
    expect(offenders).toEqual([]);
  });
});
