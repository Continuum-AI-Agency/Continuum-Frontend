import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const playerDir = dirname(fileURLToPath(import.meta.resolve('@hyperframes/player')));
const player = readFileSync(join(playerDir, 'hyperframes-player.global.js'));
const runtime = readFileSync(new URL('../public/hyperframes-runtime-0.8.75.js', import.meta.url));
let documentHtml = '';
const server = createServer((request, response) => {
  const js = request.url === '/player.js' || request.url === '/runtime.js';
  response.setHeader('Content-Type', js ? 'text/javascript' : 'text/html');
  response.end(
    request.url === '/player.js' ? player : request.url === '/runtime.js' ? runtime : documentHtml,
  );
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No local bench port.');
const origin = `http://127.0.0.1:${address.port}`;
const composition = `<!doctype html><html><body><main data-composition-id="smoke" data-hf-id="stage" data-no-timeline data-width="640" data-height="360" data-start="0" data-duration="5"><section class="clip" data-hf-id="hook" data-start="0" data-duration="5">Launch</section></main><script src="${origin}/runtime.js"></script></body></html>`;
const isolatedUrl = `data:text/html;charset=utf-8,${encodeURIComponent(composition)}`;
documentHtml = `<script src="/player.js"></script><hyperframes-player controls width="640" height="360" style="display:block;width:640px;height:360px" src="${isolatedUrl}"></hyperframes-player>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('hyperframes-player')?.ready === true, {
    timeout: 10_000,
  });
  const result = await page.evaluate(async () => {
    const player = document.querySelector('hyperframes-player') as HTMLElement & {
      duration: number;
      currentTime: number;
      seek: (time: number) => void;
    };
    player.seek(2.5);
    return { duration: player.duration, currentTime: player.currentTime };
  });
  if (result.duration !== 5 || Math.abs(result.currentTime - 2.5) > 0.1) {
    throw new Error(`Player bridge failed: ${JSON.stringify(result)}`);
  }
  console.log(
    JSON.stringify({
      status: 'passed',
      boundary: 'isolated HTML -> pinned runtime -> official player -> seek',
      ...result,
    }),
  );
} finally {
  await browser.close();
  server.close();
}
