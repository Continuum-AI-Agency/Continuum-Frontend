import { spawnSync } from 'node:child_process';

const native = process.argv.includes('--native-timeline');
const child = spawnSync(
  'bunx',
  [
    'playwright',
    'test',
    '--config=playwright.browser-render.config.ts',
    'e2e/video-editor-workspace.spec.ts',
    '--workers=1',
    ...(native ? ['--grep=workspace inspector:'] : []),
    ...process.argv.slice(2).filter((argument) => argument !== '--native-timeline'),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      BENCH_SINK: 'library',
      ...(native ? { VIDEO_EDITOR_TIMELINE_JOURNEY: '1' } : {}),
    },
  },
);
if (child.error) throw child.error;
process.exit(child.status ?? 1);
