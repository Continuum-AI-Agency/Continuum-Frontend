#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / k ** i).toFixed(2)) + ' ' + units[i];
}

function getDirectorySize(dirPath) {
  let totalSize = 0;

  if (!fs.existsSync(dirPath)) {
    return null;
  }

  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return stats.size;
    }

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const fileStats = fs.statSync(filePath);

      if (fileStats.isDirectory()) {
        totalSize += getDirectorySize(filePath);
      } else {
        totalSize += fileStats.size;
      }
    }
  } catch (error) {
    console.error(`Error reading ${dirPath}: ${error.message}`);
    return null;
  }

  return totalSize;
}

function checkCache() {
  const rootDir = path.resolve(__dirname, '..');

  // Turbopack's persistent compiler cache lives under `.next/dev`, NOT `.next/cache`,
  // and it is by far the largest of these — it reached 39 GB before anyone looked,
  // because every entry here used to point somewhere else.
  const cacheLocations = [
    { name: 'Turbopack Dev Cache', path: path.join(rootDir, '.next', 'dev', 'cache') },
    { name: 'Turbopack Build Cache', path: path.join(rootDir, '.next', 'build', 'cache') },
    { name: 'Fetch Cache', path: path.join(rootDir, '.next', 'cache', 'fetch-cache') },
    { name: 'Image Cache', path: path.join(rootDir, '.next', 'cache', 'images') },
    { name: 'Webpack Cache', path: path.join(rootDir, '.next', 'cache', 'webpack') },
    { name: 'Node Modules Cache', path: path.join(rootDir, 'node_modules', '.cache') },
  ];

  console.log('\n========================================');
  console.log('       Cache Size Report');
  console.log('========================================\n');

  let totalSize = 0;
  let foundCaches = 0;

  for (const cache of cacheLocations) {
    const size = getDirectorySize(cache.path);
    const displaySize = size !== null ? formatSize(size) : 'not found';

    console.log(`${cache.name.padEnd(25)} ${displaySize}`);

    if (size !== null) {
      totalSize += size;
      foundCaches++;
    }
  }

  console.log('\n----------------------------------------');
  console.log(`Total Found Caches: ${foundCaches}/${cacheLocations.length}`);
  console.log(`Total Size: ${formatSize(totalSize)}`);
  console.log('========================================\n');

  if (foundCaches === 0) {
    console.log(
      'No cache directories found. This is normal if you have not run the dev server or build yet.',
    );
  }

  return 0;
}

process.exit(checkCache());
