import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { loadProdSupabaseEnv } from '../e2e/support/prodEnv';

const GiB = 1024 ** 3;
const frontend = resolve(import.meta.dir, '..');
const wrapper =
  '/home/claighmor/Documents/Codex/2026-10-20/we-need-to-find-out-where/outputs/artifact-run.py';
const storage = statfsSync(frontend);
const freeBytes = storage.bavail * storage.bsize;

if (process.argv.includes('--check')) {
  console.log(
    JSON.stringify({
      check: 'storage admission only; no bench executed',
      freeBytes,
      requiredFreeBytes: 50 * GiB,
      admitted: freeBytes >= 50 * GiB,
      artifactRunnerPresent: existsSync(wrapper),
    }),
  );
  process.exit(freeBytes >= 50 * GiB && existsSync(wrapper) ? 0 : 4);
}

// The launcher refuses below the 50 GiB floor. A --produce run only exists under a supervisor
// (artifact-run.py or an owner-approved exception copy of it), which owns admission and the
// 20 GiB stop line, so the producer does not repeat the admission check.
if (!process.argv.includes('--produce') && freeBytes < 50 * GiB) {
  console.error(
    'REFUSED: the Home draft bench requires at least 50 GiB free. No build, capture or cleanup started.',
  );
  process.exit(4);
}

function command(program: string, args: string[]): string {
  const result = spawnSync(program, args, {
    cwd: frontend,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `${program} failed: ${result.stderr.trim() || result.error?.message || result.status}`,
    );
  return result.stdout.trim();
}

function sourceManifest() {
  const repositories = [
    { name: 'frontend', directory: frontend, scope: [] as string[] },
    {
      name: 'workspace',
      directory: resolve(frontend, '..'),
      scope: ['package.json', 'bun.lock', 'packages'],
    },
  ].map(({ name, directory, scope }) => {
    const git = (args: string[]) => command('git', ['-C', directory, ...args]);
    const paths = [
      ...new Set(
        [
          ...git(['diff', '--name-only', '-z', 'HEAD', '--', ...scope]).split('\0'),
          ...git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...scope]).split('\0'),
        ].filter(Boolean),
      ),
    ].sort();
    const files = paths.map((path) => {
      const absolute = resolve(directory, path);
      if (!existsSync(absolute)) return { path, deleted: true };
      const link = lstatSync(absolute).isSymbolicLink();
      const bytes = link ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute);
      return {
        path,
        kind: link ? 'symlink' : 'file',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        contentBase64: bytes.toString('base64'),
      };
    });
    return {
      name,
      head: git(['rev-parse', 'HEAD']),
      patch: git(['diff', '--binary', 'HEAD', '--', ...scope]),
      files,
    };
  });
  const fingerprint = createHash('sha256').update(JSON.stringify(repositories)).digest('hex');
  return {
    fingerprint,
    repositories,
    runtime: { bun: process.versions.bun, node: process.versions.node },
  };
}

if (!process.argv.includes('--produce')) {
  if (!existsSync(wrapper)) throw new Error(`Artifact supervisor not available: ${wrapper}`);
  const runId = `home-draft-${new Date().toISOString().replace(/[^0-9]/g, '')}-${randomUUID().slice(0, 8)}`;
  const prefix = `gs://continuum-production-477821-creative-benchmarks/home-dashboard-draft/${runId}`;
  console.log(
    JSON.stringify({
      owner: 'Claighmor / Continuum',
      runId,
      prefix,
      stagingParent: tmpdir(),
      budgetMiB: 2048,
      cache: `${frontend}/.next/home-draft-${runId}`,
      cacheSupervision:
        'The wrapper monitors free space and owns this job; its staging budget does not control the separate Next cache.',
    }),
  );
  const result = spawnSync(
    'python3',
    [
      wrapper,
      '--owner',
      'Claighmor-Continuum',
      '--run-id',
      runId,
      '--prefix',
      prefix,
      '--staging-parent',
      tmpdir(),
      '--budget-mib',
      '2048',
      '--',
      'bun',
      import.meta.path,
      '--produce',
    ],
    {
      cwd: frontend,
      stdio: 'inherit',
      env: { ...process.env, HOME_DRAFT_RUN_ID: runId },
    },
  );
  process.exit(result.status ?? 1);
}

const staging = process.env.ARTIFACT_RUN_DIR;
const ready = process.env.ARTIFACT_READY_DIR;
const prefix = process.env.ARTIFACT_GCS_PREFIX;
const runId = process.env.HOME_DRAFT_RUN_ID;
if (!staging || !ready || !prefix || !runId || !prefix.endsWith(`/${runId}`)) {
  throw new Error('The producer requires a matching artifact-run.py session.');
}

// Reuse existing private env files in process memory; never copy credentials into the draft.
const commonGit = command('git', [
  '-C',
  resolve(frontend, '..'),
  'rev-parse',
  '--path-format=absolute',
  '--git-common-dir',
]);
const canonicalRoot = dirname(commonGit);
const localFrontendEnv = resolve(frontend, '.env');
const localBackendEnv = resolve(frontend, '../Continuum-Backend/.env');
loadProdSupabaseEnv({
  frontend: existsSync(localFrontendEnv)
    ? localFrontendEnv
    : resolve(canonicalRoot, 'Continuum-Frontend/.env'),
  backend: existsSync(localBackendEnv)
    ? localBackendEnv
    : resolve(canonicalRoot, 'Continuum-Backend/.env'),
});
// The production-read bench must not inherit an absent loopback Backend from the machine env.
process.env.NEXT_PUBLIC_API_URL = 'https://api.trycontinuum.ai';

// A verified create-only write proves destination access before Chrome makes any capture.
const probe = resolve(staging, 'storage-admission');
mkdirSync(probe);
writeFileSync(resolve(probe, '.artifact-staging'), 'storage admission evidence\n');
const admission = JSON.stringify({
  owner: 'Claighmor / Continuum',
  runId,
  brandId: '148583e0-5538-462b-8d3a-acd25b80344e',
  budgetMiB: 2048,
});
const probePath = resolve(probe, 'admission.json');
writeFileSync(probePath, admission);
const md5Hash = createHash('md5').update(admission).digest('base64');
const probeUri = `${prefix}/write-access/admission.json`;
command('gcloud', [
  'storage',
  'cp',
  probePath,
  probeUri,
  '--if-generation-match=0',
  `--content-md5=${md5Hash}`,
]);
const remote = JSON.parse(
  command('gcloud', ['storage', 'objects', 'describe', probeUri, '--raw', '--format=json']),
) as { md5Hash?: string; size?: string; generation?: string };
if (
  remote.md5Hash !== md5Hash ||
  Number(remote.size) !== Buffer.byteLength(admission) ||
  !remote.generation
) {
  throw new Error('GCS write verification failed; retain staging for recovery.');
}
writeFileSync(
  resolve(probe, 'receipt.json'),
  JSON.stringify({ uri: probeUri, generation: remote.generation, md5Hash, size: remote.size }),
);
renameSync(probe, resolve(ready, 'storage-admission'));

const before = sourceManifest();
const sourceBatch = resolve(staging, 'source');
mkdirSync(sourceBatch);
writeFileSync(resolve(sourceBatch, '.artifact-staging'), 'source captured before server startup\n');
writeFileSync(resolve(sourceBatch, 'source-manifest.json'), JSON.stringify(before, null, 2));
renameSync(sourceBatch, resolve(ready, 'source'));

// Next may add generated type includes; let it edit an ignored run-specific config only.
mkdirSync(resolve(frontend, '.next'), { recursive: true });
writeFileSync(
  resolve(frontend, `.next/home-draft-${runId}.tsconfig.json`),
  JSON.stringify(
    {
      extends: '../tsconfig.json',
      include: [
        '../next-env.d.ts',
        '../src/**/*.ts',
        '../src/**/*.tsx',
        `home-draft-${runId}/types/**/*.ts`,
        `home-draft-${runId}/dev/types/**/*.ts`,
      ],
    },
    null,
    2,
  ),
);

const child = spawn(
  'bunx',
  [
    '--no-install',
    'playwright',
    'test',
    '--config',
    'playwright.home-draft.config.ts',
    '--workers=1',
  ],
  {
    cwd: frontend,
    env: { ...process.env, HOME_DRAFT_BENCH: '1', TZ: 'America/Mexico_City' },
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);
let output = '';
child.stdout.on('data', (chunk: Buffer) => {
  process.stdout.write(chunk);
  output = (output + chunk.toString()).slice(-2 * 1024 * 1024);
});
let exitCode = await new Promise<number>((accept, reject) => {
  child.on('error', reject);
  child.on('close', (code) => accept(code ?? 1));
});
const after = sourceManifest();
const sourceStable = before.fingerprint === after.fingerprint;
if (!sourceStable) {
  console.error(
    'Source changed during the draft bench; this run cannot qualify the implementation.',
  );
  exitCode = 1;
}
const recordLine = output
  .split('\n')
  .findLast((line) => line.trim().startsWith('{"bench":"home:draft:e2e:bench"'));
if (!recordLine) {
  console.error('The draft bench did not emit its validation record; this run cannot qualify.');
  exitCode = 1;
}
const result = resolve(staging, 'result');
mkdirSync(result);
writeFileSync(resolve(result, '.artifact-staging'), 'all writers closed before sealing\n');
writeFileSync(
  resolve(result, 'validation.json'),
  JSON.stringify(
    {
      exitCode,
      runId,
      sourceRevision: before.repositories[0]?.head,
      sourceFingerprint: before.fingerprint,
      sourceFingerprintAfter: after.fingerprint,
      sourceStable,
      recorder: recordLine ? JSON.parse(recordLine) : null,
    },
    null,
    2,
  ),
);
// Playwright's trace/video/screenshot are off. Retain any remaining runner diagnostics as a batch.
const diagnostics = resolve(staging, 'playwright');
if (existsSync(diagnostics)) {
  writeFileSync(resolve(diagnostics, '.artifact-staging'), 'Playwright process closed\n');
  renameSync(diagnostics, resolve(ready, 'runner-diagnostics'));
}
renameSync(result, resolve(ready, 'result'));
process.exit(exitCode);
