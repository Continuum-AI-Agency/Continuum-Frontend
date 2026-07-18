#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const NON_RUNTIME_PATHS = [
  /^(?:AGENTS|AUTH_GUIDE|CLAUDE|GEMINI|README)\.md$/,
  /^docs\//,
  /^plans\//,
  /^\.planning\//,
  /^e2e\//,
  /^tests\//,
  /^test-results\//,
  /^playwright-report\//,
  /(?:^|\/)__screenshots__\//,
  /(?:^|\/)[^/]+\.(?:test|spec|bench)\.[^/]+$/,
];

export function isNonRuntimePath(filePath) {
  return NON_RUNTIME_PATHS.some((pattern) => pattern.test(filePath));
}

export function shouldIgnoreBuild(changedFiles) {
  return changedFiles.length > 0 && changedFiles.every(isNonRuntimePath);
}

function isUsableSha(value) {
  return Boolean(value && !/^0+$/.test(value));
}

export function changedFilesBetween(previousSha, currentSha) {
  if (!isUsableSha(previousSha) || !isUsableSha(currentSha)) return null;

  try {
    const output = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=ACDMRTUXB', previousSha, currentSha],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return output
      .split('\n')
      .map((filePath) => filePath.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function main() {
  const changedFiles = changedFilesBetween(
    process.env.VERCEL_GIT_PREVIOUS_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
  );

  if (!changedFiles || !shouldIgnoreBuild(changedFiles)) {
    console.log('Runtime-impacting or indeterminate change detected; continuing Vercel build.');
    process.exit(1);
  }

  console.log(`Skipping Vercel build: ${changedFiles.length} non-runtime file(s) changed.`);
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
