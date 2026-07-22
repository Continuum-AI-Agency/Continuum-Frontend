import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A vocabulary guard over the whole optimizer surface.
//
// Six separate strings in this tree explained OUR deployment topology to a media
// buyer — "expected on a local stack where the optimizer edge functions aren't
// wired", "isn't wired up for this environment", "soak tier", "soak metrics
// only". A paying user has no local stack and no environments; they read those as
// a broken product. Individual copy fixes rot back in one careless PR, so the ban
// is asserted over the directory rather than per component.

const ROOT = join(import.meta.dir);

// Terms that must never reach a user-visible string in this surface.
const BANNED = [
  'local stack',
  'edge function',
  'soak tier',
  'soak metrics',
  'this environment',
  'human-in-the-loop',
  'wired up',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry)) return [];
    if (/\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

/**
 * Strip comments so the ban applies to rendered copy only. Explaining WHY a term
 * is banned necessarily uses the term, and those explanations are the reason the
 * fix survives review.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('optimizer user-visible vocabulary', () => {
  const files = sourceFiles(ROOT);

  it('scans a meaningful number of files (guards against a broken walker)', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(BANNED)('never ships the phrase %p to a user', (term) => {
    const offenders = files.filter((file) =>
      stripComments(readFileSync(file, 'utf8')).toLowerCase().includes(term),
    );

    expect(offenders.map((file) => file.replace(ROOT, ''))).toEqual([]);
  });

  // Proves the guard can actually fail: if stripComments ever swallowed the whole
  // file, every assertion above would pass vacuously.
  it('detects a banned term in rendered copy', () => {
    const sample = `
      // A comment mentioning a local stack is fine.
      export const Notice = () => <p>Expected on a local stack.</p>;
    `;
    expect(stripComments(sample).toLowerCase()).toContain('local stack');
    expect(stripComments(sample)).not.toContain('A comment mentioning');
  });
});
