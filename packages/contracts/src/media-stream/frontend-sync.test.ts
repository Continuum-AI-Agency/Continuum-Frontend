import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const roots = findContractRoots(import.meta.dir);

describe('standalone Frontend MediaStream contract copy', () => {
  const verify = roots ? test : test.skip;

  verify('is byte-identical to the canonical workspace contract', () => {
    if (!roots) return;
    const canonicalFiles = filesUnder(roots.canonical);
    const vendoredFiles = filesUnder(roots.vendored);
    expect(vendoredFiles).toEqual(canonicalFiles);
    for (const file of canonicalFiles) {
      expect(readFileSync(join(roots.vendored, file))).toEqual(
        readFileSync(join(roots.canonical, file)),
      );
    }
  });
});

function findContractRoots(start: string): { canonical: string; vendored: string } | null {
  let cursor = start;
  for (;;) {
    const canonical = join(cursor, 'packages/contracts/src/media-stream');
    const vendored = join(cursor, 'Continuum-Frontend/packages/contracts/src/media-stream');
    if (existsSync(canonical) && existsSync(vendored)) return { canonical, vendored };
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function filesUnder(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
}
