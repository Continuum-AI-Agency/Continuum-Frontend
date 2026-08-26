#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');

export function maxAllowedBytes(baselineBytes, maxGrowthPercent) {
  return Math.ceil(baselineBytes * (1 + maxGrowthPercent / 100));
}

export function isWithinBudget(actualBytes, baselineBytes, maxGrowthPercent) {
  return actualBytes <= maxAllowedBytes(baselineBytes, maxGrowthPercent);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

// Next writes one row per app route as { route, firstLoadUncompressedJsBytes, firstLoadChunkPaths },
// unioning every segment's JS (page, layout, ...) so a layout's contribution is counted here. Layouts
// are segments, not routes, so they can never be rows of their own — budget the route that carries
// them instead.
function routeFirstLoadBytes(distDirectory, budget) {
  const rows = readJson(path.join(distDirectory, 'diagnostics', 'route-bundle-stats.json'));
  const row = rows.find((candidate) => candidate.route === budget.route);
  if (!row) {
    throw new Error(
      `${budget.name}: no route-bundle-stats row for "${budget.route}" — renamed or removed?`,
    );
  }
  return row.firstLoadUncompressedJsBytes;
}

function rootMainFilesBytes(distDirectory) {
  const manifest = readJson(path.join(distDirectory, 'build-manifest.json'));
  if (!Array.isArray(manifest.rootMainFiles)) {
    throw new Error('build-manifest.json does not contain rootMainFiles');
  }
  return manifest.rootMainFiles.reduce(
    (total, filePath) => total + statSync(path.join(distDirectory, filePath)).size,
    0,
  );
}

export function checkBundleBudgets({ distDirectory, configuration }) {
  return configuration.budgets.map((budget) => {
    const actualBytes =
      budget.source === 'rootMainFiles'
        ? rootMainFilesBytes(distDirectory)
        : routeFirstLoadBytes(distDirectory, budget);
    const maximumBytes = maxAllowedBytes(budget.baselineBytes, configuration.maxGrowthPercent);
    return {
      name: budget.name,
      actualBytes,
      maximumBytes,
      passed: actualBytes <= maximumBytes,
    };
  });
}

function main() {
  const distDirectory = path.resolve(
    projectDirectory,
    process.env.NEXT_DIST_DIR?.trim() || '.next',
  );
  const configuration = readJson(path.join(scriptDirectory, 'vercel-bundle-budgets.json'));
  const results = checkBundleBudgets({ distDirectory, configuration });

  for (const result of results) {
    const actualKb = (result.actualBytes / 1024).toFixed(1);
    const maximumKb = (result.maximumBytes / 1024).toFixed(1);
    console.log(
      `${result.passed ? 'PASS' : 'FAIL'} ${result.name}: ${actualKb} KB / ${maximumKb} KB`,
    );
  }

  if (results.some((result) => !result.passed)) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
