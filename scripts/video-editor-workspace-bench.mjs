import { spawnSync } from 'node:child_process';

const graph = process.argv.includes('--native-graph');
const imports = graph || process.argv.includes('--native-import');
const native = imports || process.argv.includes('--native-timeline');
const child = spawnSync(
  'bunx',
  [
    'playwright',
    'test',
    '--config=playwright.browser-render.config.ts',
    'e2e/video-editor-workspace.spec.ts',
    '--workers=1',
    ...(native ? ['--grep=workspace inspector:'] : []),
    ...process.argv
      .slice(2)
      .filter(
        (argument) =>
          argument !== '--native-timeline' &&
          argument !== '--native-import' &&
          argument !== '--native-graph',
      ),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      BENCH_SINK: 'library',
      ...(native
        ? imports
          ? graph
            ? { VIDEO_EDITOR_GRAPH_JOURNEY: '1' }
            : { VIDEO_EDITOR_IMPORT_JOURNEY: '1' }
          : { VIDEO_EDITOR_TIMELINE_JOURNEY: '1' }
        : {}),
    },
  },
);
if (child.error) throw child.error;
process.exit(child.status ?? 1);
