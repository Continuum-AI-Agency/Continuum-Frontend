// The census behind `JAINA_TYPE`: nothing under `jaina/` may set text below 12px, in any
// spelling. A rule that only a reviewer's eye enforces is a rule that regresses.
import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = import.meta.dir;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === '__fixtures__' ? [] : sourceFiles(path);
    if (!/\.tsx?$/u.test(entry) || /\.test\.tsx?$/u.test(entry)) return [];
    return [path];
  });
}

// 11px and 10px by token, by pixel and by rem.
const BELOW_TWELVE = /text-(?:2xs|3xs|\[(?:1[01]px|0\.6(?:25|875)rem)\])/gu;

describe('the Jaina type scale is the only scale under jaina/', () => {
  it('sets no text below 12px anywhere in the tree', () => {
    const offenders = sourceFiles(ROOT).flatMap((path) => {
      const hits = readFileSync(path, 'utf8').match(BELOW_TWELVE);
      return hits ? [`${path.slice(ROOT.length + 1)}: ${hits.join(', ')}`] : [];
    });
    expect(offenders).toEqual([]);
  });
});
