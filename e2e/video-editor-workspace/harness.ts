import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The two servers the workspace bench drives, both from THIS tree:
//   · a local Backend — the W0 `/ops/:op` door and the editor ops are not deployed yet —
//     with every background worker off, so it never claims a production job;
//   · a Next dev server for the Frontend under its own port and dist dir.
// Supabase is production (the bench brand's real rows); `loadProdSupabaseEnv` pins it.

const FRONTEND = resolve(__dirname, '../..');
const BACKEND = resolve(FRONTEND, '../Continuum-Backend');

export type Server = { url: string; log: string; stop: () => void };

export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        address && typeof address === 'object' ? done(address.port) : fail(new Error('no port')),
      );
    });
  });
}

function launch(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string,
) {
  const log = join(tmpdir(), `video-workspace-${name}-${Date.now()}.log`);
  const out = createWriteStream(log);
  const child: ChildProcess = spawn(command, args, { cwd, env, detached: true });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  // The dev server forks workers; kill the whole group so nothing outlives the bench.
  const stop = () => {
    if (child.pid && child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  };
  return { child, log, stop };
}

async function waitFor(
  probe: () => Promise<boolean>,
  child: ChildProcess,
  timeoutMs: number,
  what: string,
  log: string,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${what} exited (${child.exitCode}); see ${log}`);
    if (await probe().catch(() => false)) return;
    await new Promise((done) => setTimeout(done, 1_000));
  }
  throw new Error(`${what} did not come up within ${timeoutMs / 1000}s; see ${log}`);
}

export async function bootBackend(
  allowedOrigin: string,
  env: Record<string, string> = {},
): Promise<Server> {
  const port = await freePort();
  const nonce = `video-workspace-${randomUUID().slice(0, 8)}`;
  const { child, log, stop } = launch(
    'bun',
    ['--no-env-file', '--env-file=.env', 'App/Index.ts'],
    BACKEND,
    {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      GIT_REVISION: nonce,
      NODE_ENV: 'test',
      ALLOWED_ORIGINS: allowedOrigin,
      BACKGROUND_WORKERS_ENABLED: 'false',
      MCP_JOB_WORKER_ENABLED: 'false',
      ORGANIC_JOB_WORKER_ENABLED: 'false',
      BRAND_REPORT_JOB_WORKER_ENABLED: 'false',
      PREVIEW_RECONCILER_DISABLED: 'true',
      CHAT_REPORT_DELIVERER_ENABLED: 'false',
      ...env,
    },
    'backend',
  );
  const url = `http://127.0.0.1:${port}`;
  await waitFor(
    async () => {
      const body = (await (await fetch(`${url}/healthz`)).json()) as { rev?: string };
      return body.rev === nonce;
    },
    child,
    300_000,
    'Backend',
    log,
  );
  return { url, log, stop };
}

export async function bootFrontend(
  port: number,
  backendUrl: string,
  distDir = '.next/video-workspace-e2e',
): Promise<Server> {
  const { child, log, stop } = launch(
    'bun',
    ['run', 'dev'],
    FRONTEND,
    {
      ...process.env,
      PORT: String(port),
      NEXT_DIST_DIR: distDir,
      NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
      NEXT_PUBLIC_API_URL: backendUrl,
      API_URL: backendUrl,
    },
    'frontend',
  );
  const url = `http://localhost:${port}`;
  await waitFor(
    async () => (await fetch(url, { redirect: 'manual' })).status > 0,
    child,
    300_000,
    'Next dev server',
    log,
  );
  return { url, log, stop };
}
