// Playwright refuses unknown CLI flags, so the bench's own flag is read here and handed to
// the spec in the environment:  bun run video-editor:e2e:bench -- --render-url=<Cloud Run URL>
import { spawnSync } from 'node:child_process';

const flag = process.argv.slice(2).find((arg) => arg.startsWith('--render-url='));
const run = spawnSync(
  'playwright',
  [
    'test',
    '--config=playwright.browser-render.config.ts',
    process.env.VIDEO_EDITOR_AUTO_CAPTIONS_ONLY === '1'
      ? 'e2e/video-editor-motion-ui.spec.ts'
      : 'e2e/video-editor-journey.spec.ts',
    '--workers=1',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(process.env.VIDEO_EDITOR_AUTO_CAPTIONS_ONLY === '1'
        ? { VIDEO_EDITOR_CURVE_JOURNEY: '1', VIDEO_EDITOR_CURVE_JOURNEY_LOCAL: '1' }
        : {}),
      ...(flag ? { VIDEO_EDITOR_RENDER_URL: flag.slice('--render-url='.length) } : {}),
    },
  },
);
process.exit(run.status ?? 1);
