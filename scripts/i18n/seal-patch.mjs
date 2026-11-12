import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { sealFile } from './seal.mjs';

const [staging, prefix] = process.argv.slice(2);
if (!staging || !prefix) throw new Error('Expected staging directory and approved GCS prefix');
const patch = execFileSync('git', ['diff', '--cached', '--binary', '--full-index'], {
  maxBuffer: 20 * 1024 ** 2,
});
const file = path.join(staging, 'review.patch');
writeFileSync(file, patch, { flag: 'wx' });
sealFile(file, `${prefix.replace(/\/$/, '')}/review.patch`);
