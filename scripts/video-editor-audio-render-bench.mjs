import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.argv.includes('--ducking-local')) {
  const child = spawnSync(
    'bun',
    [
      '--no-env-file',
      '--env-file=.env',
      'scripts/video-editor-ops-e2e-bench.ts',
      '--sink=library',
      ...process.argv.slice(2),
    ],
    {
      cwd: fileURLToPath(new URL('../../Continuum-Backend/', import.meta.url)),
      stdio: 'inherit',
      env: process.env,
    },
  );
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

const native = process.argv.includes('--native-volume');
const args = [
  'playwright',
  'test',
  '--config=playwright.browser-render.config.ts',
  native ? 'e2e/video-editor-motion-ui.spec.ts' : 'e2e/video-editor-audio-render.spec.ts',
  '--workers=1',
  ...(native ? ['--grep=retained project journey:'] : []),
  ...process.argv.slice(2).filter((argument) => argument !== '--native-volume'),
];
const child = spawnSync('bunx', args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...(native
      ? {
          AUDIO_RENDER_NATIVE_VOLUME: '1',
          VIDEO_EDITOR_CURVE_JOURNEY: '1',
          VIDEO_EDITOR_CURVE_JOURNEY_LOCAL: '1',
        }
      : {}),
  },
});
if (child.error) throw child.error;
process.exit(child.status ?? 1);
