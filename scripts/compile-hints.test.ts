import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addCompileHints, COMPILE_HINT, sharedChunks } from './compile-hints.mjs';

// The real Next output shapes: rootMainFiles in build-manifest.json, and a page's client reference
// manifest assigning `entryJSFiles` per segment onto globalThis.__RSC_MANIFEST.
function fixture(entryJSFiles: Record<string, string[]>) {
  const distDirectory = mkdtempSync(path.join(tmpdir(), 'compile-hints-'));
  const chunks = path.join(distDirectory, 'static', 'chunks');
  const page = path.join(distDirectory, 'server', 'app', '(post-auth)', 'dashboard');
  mkdirSync(chunks, { recursive: true });
  mkdirSync(page, { recursive: true });
  for (const name of ['runtime', 'root', 'shell', 'page']) {
    writeFileSync(path.join(chunks, `${name}.js`), `(globalThis.TURBOPACK||[]).push(["${name}"]);`);
  }
  writeFileSync(
    path.join(distDirectory, 'build-manifest.json'),
    JSON.stringify({ rootMainFiles: ['static/chunks/runtime.js'] }),
  );
  writeFileSync(
    path.join(page, 'page_client-reference-manifest.js'),
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST["/(post-auth)/dashboard/page"] = ${JSON.stringify({ entryJSFiles })};`,
  );
  return distDirectory;
}

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe('compile hints', () => {
  it('marks the runtime and shared layout chunks, not page chunks, once', () => {
    const distDirectory = fixture({
      '[project]/src/app/layout': ['static/chunks/runtime.js', 'static/chunks/root.js'],
      '[project]/src/app/(post-auth)/layout': ['static/chunks/shell.js'],
      '[project]/src/app/(post-auth)/dashboard/page': ['static/chunks/page.js'],
    });
    directories.push(distDirectory);
    const read = (name: string) =>
      readFileSync(path.join(distDirectory, 'static', 'chunks', `${name}.js`), 'utf8');

    expect(addCompileHints(distDirectory)).toBe(3);
    for (const name of ['runtime', 'root', 'shell']) {
      expect(read(name).startsWith(`${COMPILE_HINT}(globalThis.TURBOPACK`)).toBe(true);
    }
    expect(read('page').startsWith(COMPILE_HINT)).toBe(false);
    expect(addCompileHints(distDirectory)).toBe(0);
  });

  it('throws when a shared layout is missing, so the build log says why', () => {
    const distDirectory = fixture({ '[project]/src/app/layout': ['static/chunks/root.js'] });
    directories.push(distDirectory);
    expect(() => sharedChunks(distDirectory)).toThrow('[project]/src/app/(post-auth)/layout');
  });
});
