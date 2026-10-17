import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TEXT_DISCLOSURE } from './disclosure';

// PP-L1V tap-target: the Optimizer's "Show detail" / "Exact figures per ad set" disclosures are
// text-xs summaries painted 15–16px tall. The shared class grows the pointer target invisibly
// (hit-area: a transparent ::after, 24px floor, 44px coarse); the line keeps its height.

const OPTIMIZER_ROOT = join(import.meta.dir, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.tsx') && !path.includes('.test.') ? [path] : [];
  });
}

describe('TEXT_DISCLOSURE', () => {
  it('carries the invisible hit area and no height of its own', () => {
    const classes = TEXT_DISCLOSURE.split(' ');
    expect(classes).toContain('hit-area');
    expect(TEXT_DISCLOSURE).not.toMatch(/\b(min-h|h|py|p)-/);
  });

  it('is what every Optimizer <summary> reaches its target through', () => {
    const bare: string[] = [];
    for (const file of sourceFiles(OPTIMIZER_ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<summary\b[^>]*>/g)) {
        if (!/TEXT_DISCLOSURE|hit-area/.test(match[0]))
          bare.push(`${relative(OPTIMIZER_ROOT, file)}: ${match[0]}`);
      }
    }
    expect(bare).toEqual([]);
  });
});
