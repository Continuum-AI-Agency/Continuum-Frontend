// Loaded into EVERY Bun process of the bench's Next dev server through `BUN_OPTIONS=--preload …`
// (exported by `publishTargetsBench.ts --print-env`; Playwright's webServer inherits it, and Bun
// passes it on to each child). Two jobs, both for the bench's Redis check (cell 0):
//
// - Every second it writes this process's LIVE env verdict to PTB_FE_ENV_DIR/<pid>.json: the NAMES
//   of the Redis/Upstash/app-cache keys (by name, or by an upstash.io / redis:// value, with the
//   token beside such a URL) that hold a value right now. macOS hides another process's env from
//   `ps -E`, and Next loads `.env` in-process after start, so only the process itself can say.
// - It refuses (and counts) any fetch to an Upstash host, so a key that slipped through still
//   cannot write `mcp:accounts:*` / integration summaries into the production app cache.

import fs from 'node:fs';
import path from 'node:path';
import { liveCacheEnvKeys } from './publishTargetsBenchEnv';

const dir = process.env.PTB_FE_ENV_DIR;
let upstashRefused = 0;

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/upstash\.io$/i.test(new URL(url).hostname)) {
    upstashRefused += 1;
    return new Response('refused by organic:publish-targets bench', { status: 503 });
  }
  return realFetch(input, init);
}) as typeof fetch;

if (dir) {
  const write = () => {
    const redisKeysSet = liveCacheEnvKeys(process.env);
    try {
      fs.writeFileSync(
        path.join(dir, `${process.pid}.json`),
        JSON.stringify({
          pid: process.pid,
          ppid: process.ppid,
          argv: process.argv.slice(1, 4),
          redisKeysSet,
          upstashRefused,
          at: Date.now(),
        }),
      );
    } catch {
      // The directory is the bench's; a missing one only means no bench is listening.
    }
  };
  write();
  setInterval(write, 1_000).unref();
}
