#!/usr/bin/env node

// Marks the JS every page runs at load for eager compilation: Chrome 136+ explicit compile hints
// (https://v8.dev/blog/explicit-compile-hints). Without a hint V8 compiles each function lazily, on
// the main thread, the first time it is called. A Turbopack chunk's top level only registers module
// factories, so the factories and everything they call compile on every visit, and the code cache
// (written after a script's top-level run) never catches them. With `//# allFunctionsCalledOnLoad`
// as its first line, V8 compiles the whole file on a background thread while it streams in.
//
// Only the runtime and the root and (post-auth) layout chunks get the hint: every page runs them.
// Hinting a page's chunks would also compile its closed dialogs and unused branches for nothing.
//
// Measured in the monorepo's docs/hillclimb/dom-render.md (round 6, 4x CPU throttle): main-thread
// compile 337 → 117 ms on /dashboard; time to a settled page −16% train / −10% held-out, main-thread
// work −10% / −8%; JS heap +2 MB. Browsers without compile hints read the line as a comment.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');

export const COMPILE_HINT = '//# allFunctionsCalledOnLoad\n';
const SHARED_LAYOUTS = ['[project]/src/app/layout', '[project]/src/app/(post-auth)/layout'];

function* clientReferenceManifests(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* clientReferenceManifests(file);
    else if (entry.name === 'page_client-reference-manifest.js') yield file;
  }
}

// rootMainFiles is the runtime; a page's client reference manifest lists the eager chunks of every
// layout above it under `entryJSFiles`, so the first manifest naming a layout is enough.
export function sharedChunks(distDirectory) {
  const buildManifest = JSON.parse(
    readFileSync(path.join(distDirectory, 'build-manifest.json'), 'utf8'),
  );
  const chunks = new Set(buildManifest.rootMainFiles ?? []);
  const pending = new Set(SHARED_LAYOUTS);
  for (const file of clientReferenceManifests(path.join(distDirectory, 'server', 'app'))) {
    const source = readFileSync(file, 'utf8');
    const { entryJSFiles = {} } = JSON.parse(
      source.slice(source.indexOf('= {') + 2).replace(/;\s*$/, ''),
    );
    for (const layout of pending) {
      if (!entryJSFiles[layout]) continue;
      for (const chunk of entryJSFiles[layout]) chunks.add(chunk);
      pending.delete(layout);
    }
    if (pending.size === 0) return [...chunks];
  }
  throw new Error(`no client reference manifest lists ${[...pending].join(', ')}`);
}

export function addCompileHints(distDirectory) {
  let hinted = 0;
  for (const chunk of sharedChunks(distDirectory)) {
    const file = path.join(distDirectory, chunk);
    const source = readFileSync(file, 'utf8');
    if (source.startsWith(COMPILE_HINT)) continue;
    writeFileSync(file, COMPILE_HINT + source);
    hinted += 1;
  }
  return hinted;
}

function main() {
  const distDirectory = path.resolve(
    projectDirectory,
    process.env.NEXT_DIST_DIR?.trim() || '.next',
  );
  // A speed-up, so a Next output format change skips it loudly instead of failing the deploy.
  try {
    console.log(`compile hints: ${addCompileHints(distDirectory)} shared chunks marked`);
  } catch (error) {
    console.warn(`compile hints skipped: ${error instanceof Error ? error.message : error}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
