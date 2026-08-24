import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Starts the real Fastify Backend against the LOCAL Supabase stack, for e2e benches
 * that drive a browser through the app to the Backend and back.
 *
 * Why a bench owns its Backend instead of reusing `bun run dev:be` on :4000:
 *
 *  1. `dev:be` resolves to PRODUCTION Supabase. A bench whose app reads the local
 *     stack and whose Backend reads prod is not one system — the fixture brand does
 *     not exist on the far side, every read comes back empty, and the bench reads as
 *     a product bug. `--supabase=local` is the only correct target here.
 *  2. CORS. `App/cors.ts` allowlists localhost:3000/3001/3002/3110/5173/8080 and no
 *     127.0.0.1 origin at all, so a bench serving the app on its own port has every
 *     browser-side Backend call silently blocked — the planner renders an empty grid
 *     with no error anywhere. `ALLOWED_ORIGINS` is the sanctioned per-environment
 *     override; the bench hands it its own origin.
 *
 * The port must be the bench's own, never 4000: a dev Backend may already be there,
 * pointed at prod.
 */
export type LocalBackend = {
  url: string;
  stop: () => Promise<void>;
};

const BACKEND_DIR = path.resolve(process.cwd(), '../Continuum-Backend');
const READY_TIMEOUT_MS = 120_000;

// Playwright restarts its worker process after a failed serial group, which wipes the
// in-process `shared` map while the Backend we spawned is still listening. A pid file
// is how the next worker tells "the instance I started, still healthy" apart from a
// FOREIGN process on the same port — the case the guard below must still refuse,
// because a dev Backend on a bench port is almost certainly pointed at production.
const pidFile = (port: number) => path.join(os.tmpdir(), `continuum-e2e-backend-${port}.pid`);

/** Signal the whole process group — see `detached` below for why the tree matters. */
function killTree(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already gone.
    }
  }
}

function readOwnPid(port: number): number | null {
  try {
    const pid = Number(fs.readFileSync(pidFile(port), 'utf8').trim());
    if (!Number.isInteger(pid) || pid <= 0) return null;
    process.kill(pid, 0); // throws if the process is gone
    return pid;
  } catch {
    return null;
  }
}

async function isHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

type StartOptions = {
  port: number;
  /** The origin the browser will load the app from, e.g. http://127.0.0.1:3109. */
  browserOrigin: string;
  label?: string;
};

// A file-scope `beforeAll` runs once per SERIAL describe group, not once per file, so
// a spec with two of them asks for the Backend twice. Share one process across every
// asker and only tear it down when the last one lets go — otherwise the second group
// trips the "port already answers" guard that exists to catch a FOREIGN process.
const shared = new Map<number, { backend: Promise<LocalBackend>; refs: number }>();

export async function startLocalBackend(options: StartOptions): Promise<LocalBackend> {
  const existing = shared.get(options.port);
  if (existing) {
    existing.refs += 1;
    return existing.backend;
  }

  const entry = { backend: spawnLocalBackend(options), refs: 1 };
  shared.set(options.port, entry);
  try {
    const backend = await entry.backend;
    return {
      url: backend.url,
      stop: async () => {
        const current = shared.get(options.port);
        if (!current) return;
        current.refs -= 1;
        if (current.refs > 0) return;
        shared.delete(options.port);
        await backend.stop();
      },
    };
  } catch (error) {
    shared.delete(options.port);
    throw error;
  }
}

async function spawnLocalBackend(options: StartOptions): Promise<LocalBackend> {
  const { port, browserOrigin } = options;
  const label = options.label ?? 'e2e';
  const url = `http://127.0.0.1:${port}`;

  if (await isHealthy(url)) {
    const ownPid = readOwnPid(port);
    if (ownPid === null) {
      throw new Error(
        `[${label}] Port ${port} already answers /healthz and no bench owns it. A dev Backend ` +
          'on a bench port is almost certainly pointed at PRODUCTION Supabase — stop it and re-run.',
      );
    }
    // Ours, from a worker Playwright restarted. Adopt it rather than paying ~20s to
    // respawn something identical.
    return {
      url,
      stop: async () => {
        killTree(ownPid, 'SIGTERM');
        const quietBy = Date.now() + 10_000;
        while (Date.now() < quietBy && (await isHealthy(url))) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        fs.rmSync(pidFile(port), { force: true });
      },
    };
  }

  const child: ChildProcess = spawn(
    'bun',
    ['--no-env-file', 'scripts/run-backend.ts', '--supabase=local'],
    {
      cwd: BACKEND_DIR,
      // `run-backend.ts` resolves the environment and then spawns the real server as
      // its OWN child, so a SIGTERM to this process leaves the grandchild listening.
      // Its own process group is what makes the whole tree killable.
      detached: true,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        // Replaces the default allowlist entirely — which is what we want for a
        // bench-owned process that only ever serves this one origin.
        ALLOWED_ORIGINS: [browserOrigin, browserOrigin.replace('127.0.0.1', 'localhost')].join(','),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const tail: string[] = [];
  const capture = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 40) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  let exited = false;
  child.once('exit', () => {
    exited = true;
  });

  if (child.pid) fs.writeFileSync(pidFile(port), String(child.pid));

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isHealthy(url)) {
      return {
        url,
        // The pid file is removed LAST, and only once the port has actually gone
        // quiet. Removing it up front left a shutting-down Backend still answering
        // /healthz with nothing claiming it, and the next worker read that as a
        // foreign process and refused.
        stop: async () => {
          if (!exited && child.pid) {
            killTree(child.pid, 'SIGTERM');
            await new Promise((resolve) => {
              const timer = setTimeout(() => {
                if (child.pid) killTree(child.pid, 'SIGKILL');
                resolve(null);
              }, 8_000);
              child.once('exit', () => {
                clearTimeout(timer);
                resolve(null);
              });
            });
          }
          const quietBy = Date.now() + 10_000;
          while (Date.now() < quietBy && (await isHealthy(url))) {
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          fs.rmSync(pidFile(port), { force: true });
        },
      };
    }
    if (exited) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (child.pid) killTree(child.pid, 'SIGKILL');
  fs.rmSync(pidFile(port), { force: true });
  throw new Error(
    `[${label}] Local Backend never became healthy on ${url}.\n` +
      'Is the local stack up? `bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local`\n' +
      `--- backend output ---\n${tail.join('')}`,
  );
}
