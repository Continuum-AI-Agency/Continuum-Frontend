// Plumbing for organic:chat-media:e2e:bench: the local-stack env, the bench's own Backend, and
// the seeded fixture (stills in real local storage, drafts that own them, chat sessions whose
// persisted frames carry `ui.media_strip` refs).
//
// Run as a script (`bun e2e/support/chatMediaBench.ts --print-env`) it prints the `export` lines
// the package script evals, so the app and the spec both read the LOCAL stack without anyone
// writing a .env.local into the checkout (a Backend .env.local retargets every plain bun bench
// in it to local, which another session in the same clone would not expect).

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import type { ChatMediaItem, ChatMediaRef } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BRAND_ID,
  LOCAL_OWNER_EMAIL,
  LOCAL_OWNER_PASSWORD,
  MEDIA_BUCKET,
  OWNER_ID,
} from './plannerBench';

const BUCKET = MEDIA_BUCKET;
const OWNER_EMAIL = LOCAL_OWNER_EMAIL;

export const BENCH_FE_PORT = 3021;
export const BENCH_BE_PORT = 4021;
export const BENCH_FE_ORIGIN = `http://localhost:${BENCH_FE_PORT}`;
export const BENCH_BE_URL = `http://127.0.0.1:${BENCH_BE_PORT}`;

// Both the package script and Playwright run from Continuum-Frontend.
const ROOT = path.resolve(process.cwd(), '..');
const BACKEND_DIR = path.join(ROOT, 'Continuum-Backend');

/** `supabase status -o env` of the stack this clone's workdir names. */
export function localStackStatus(): Record<string, string> {
  const raw = execFileSync('supabase', ['status', '-o', 'env', '--workdir', '.'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2];
  }
  if (!values.API_URL || !values.SERVICE_ROLE_KEY || !values.ANON_KEY) {
    throw new Error('[chat-media bench] the local stack is not up: `bun run supabase:start`.');
  }
  return values;
}

/** The Frontend's env for this bench: local Supabase, and the bench's own Backend. */
export function frontendBenchEnv(status = localStackStatus()): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY ?? '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: status.ANON_KEY ?? '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY: status.ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? '',
    // Browser AND Next server: the checkout's .env names the production API for both.
    NEXT_PUBLIC_API_URL: BENCH_BE_URL,
    API_URL: BENCH_BE_URL,
    API_BASE_URL: BENCH_BE_URL,
  };
}

// --- The bench's own Backend -------------------------------------------------------------------

const pidFile = path.join(os.tmpdir(), `continuum-chat-media-backend-${BENCH_BE_PORT}.pid`);

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(`${BENCH_BE_URL}/healthz`, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
}

function signalTree(pid: number, signal: NodeJS.Signals): void {
  // The child was spawned detached, so its pid is its own process group: this reaches the
  // server it spawned and nothing else.
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // gone
    }
  }
}

export type BenchBackend = { url: string; pid: number; stop: () => Promise<void> };

/**
 * The real Fastify Backend on :4021 against the LOCAL stack, every background worker off.
 * Its env is built here, last-wins, so a production key can never outrank a local one or a
 * worker switch: the checkout's .env supplies the non-Supabase config, and EVERY Supabase key
 * in it is dropped before the local ones go in.
 */
export async function startBenchBackend(status = localStackStatus()): Promise<BenchBackend> {
  if (await healthy()) {
    throw new Error(
      `[chat-media bench] :${BENCH_BE_PORT} already answers /healthz and this bench did not start it. ` +
        'Stop it (by its PID) and re-run.',
    );
  }
  const fromFile = parseEnv(fs.readFileSync(path.join(BACKEND_DIR, '.env'), 'utf8')) as Record<
    string,
    string
  >;
  const withoutSupabase = (env: Record<string, string | undefined>) =>
    Object.fromEntries(
      Object.entries(env).filter(
        (entry): entry is [string, string] =>
          !entry[0].startsWith('SUPABASE_') &&
          !entry[0].startsWith('NEXT_PUBLIC_') &&
          typeof entry[1] === 'string',
      ),
    );
  const env: Record<string, string> = {
    ...withoutSupabase(process.env),
    ...withoutSupabase(fromFile),
    SUPABASE_URL: status.API_URL ?? '',
    SUPABASE_PROJECT_URL: status.API_URL ?? '',
    SUPABASE_ANON_KEY: status.ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? '',
    SUPABASE_DB_URL: status.DB_URL ?? '',
    PORT: String(BENCH_BE_PORT),
    HOST: '127.0.0.1',
    ALLOWED_ORIGINS: [BENCH_FE_ORIGIN, `http://127.0.0.1:${BENCH_FE_PORT}`].join(','),
    MCP_JOB_WORKER_ENABLED: 'false',
    BACKGROUND_WORKERS_ENABLED: 'false',
    ORGANIC_JOB_WORKER_ENABLED: 'false',
    JAINA_REPORT_ARTIFACT_WORKER_ENABLED: 'false',
  };

  const child: ChildProcess = spawn('bun', ['--no-env-file', 'App/Index.ts'], {
    cwd: BACKEND_DIR,
    detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  const capture = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 60) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  const pid = child.pid;
  if (!pid) throw new Error('[chat-media bench] the Backend did not spawn');
  fs.writeFileSync(pidFile, String(pid));

  const stop = async () => {
    if (!exited) {
      signalTree(pid, 'SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          signalTree(pid, 'SIGKILL');
          resolve(null);
        }, 8_000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve(null);
        });
      });
    }
    fs.rmSync(pidFile, { force: true });
  };

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await healthy()) return { url: BENCH_BE_URL, pid, stop };
    if (exited) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await stop();
  throw new Error(`[chat-media bench] the Backend never became healthy.\n${tail.join('')}`);
}

// --- Fixture -------------------------------------------------------------------------------------

// The planner benches' fixture owner and brand: one local identity for every bench.
export {
  BRAND_ID,
  LOCAL_OWNER_EMAIL as OWNER_EMAIL,
  LOCAL_OWNER_PASSWORD as OWNER_PASSWORD,
  MEDIA_BUCKET as BUCKET,
  OWNER_ID,
};
export const PREFIX = 'bench-chatmedia-';
const STORAGE_DIR = `${BRAND_ID}/chat-media-bench`;

/** A still the strip shows: the size a ≤480 px tile really is. */
export type BenchStill = { name: string; width: number; height: number; bytes: Buffer };

export const STILL_SPECS = [
  { name: 'square', width: 480, height: 480 },
  { name: 'portrait', width: 384, height: 480 },
  { name: 'reel-poster', width: 270, height: 480 },
] as const;

/** Flat under one folder, so the purge is one list + one remove. */
export const benchObjectPath = (name: string) => `${STORAGE_DIR}/${name}`;

export async function uploadObjects(
  supabase: SupabaseClient,
  objects: Array<{ path: string; bytes: Buffer; contentType: string }>,
): Promise<void> {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw new Error(`bucket: ${error.message}`);
  for (const object of objects) {
    const upload = await supabase.storage
      .from(BUCKET)
      .upload(object.path, object.bytes, { contentType: object.contentType, upsert: true });
    if (upload.error) throw new Error(`upload ${object.path}: ${upload.error.message}`);
  }
}

const organic = (supabase: SupabaseClient) =>
  (supabase as unknown as { schema: (s: string) => SupabaseClient }).schema('organic');

/** A Library video with a poster: a mention chip of it must show the poster, never the file. */
export function videoAssetRow(id: string, videoPath: string, posterPath: string) {
  return {
    id,
    brand_id: BRAND_ID,
    created_by: OWNER_ID,
    kind: 'video',
    bucket: BUCKET,
    storage_path: videoPath,
    thumbnail_path: posterPath,
    file_name: `${PREFIX}launch-reel.mp4`,
    mime_type: 'video/mp4',
    source: 'upload',
    status: 'stored',
    title: 'Launch reel',
    tags: [],
    detected_objects: [],
    review_status: 'none',
    integrity_state: 'unknown',
  };
}

/** A draft whose only media is a video with no poster: its tile has nothing to show but a placeholder. */
export function videoOnlyDraftRow(id: string, videoPath: string) {
  const row = stripDraftRow(id, [], 'reel');
  row.content_json.publishingAssets = [
    {
      role: 'primary',
      kind: 'video',
      slideIndex: 0,
      bucket: BUCKET,
      storagePath: videoPath,
      storageUrl: '',
      mimeType: 'video/mp4',
    },
  ];
  return row;
}

export function stripDraftRow(id: string, slides: { path: string }[], format = 'carousel') {
  return {
    id,
    brand_id: BRAND_ID,
    user_id: OWNER_ID,
    platform: 'instagram',
    platform_account_id: 'unassigned',
    status: 'draft',
    scheduled_date: null,
    client_key: `${PREFIX}${id}`,
    media_stage: 'realized',
    slot_data: { title: `Chat media bench ${id.slice(-4)}`, platform: 'instagram' },
    content_json: {
      content: { format },
      publishingAssets: slides.map((slide, slideIndex) => ({
        role: slideIndex === 0 ? 'primary' : `slide_${slideIndex + 1}`,
        kind: 'image',
        slideIndex,
        bucket: BUCKET,
        storagePath: slide.path,
        storageUrl: '',
        mimeType: 'image/jpeg',
      })),
      creative: { mediaSuggestion: { mediaStatus: 'ready' } },
    },
  };
}

export function stripItems(draftId: string, kinds: ChatMediaItem['kind'][]): ChatMediaItem[] {
  return kinds.map((kind, slide) => {
    const ref: ChatMediaRef = { type: 'draft', draftId, ...(slide > 0 ? { slide } : {}) };
    return {
      ref,
      kind,
      w: kind === 'image' ? 1080 : null,
      h: kind === 'image' ? 1080 : null,
      ...(kind === 'video' ? { durationMs: 12_000 } : {}),
      label: `Bench ${kind} ${slide + 1}`,
    };
  });
}

export function stripFrames(toolCallId: string, items: ChatMediaItem[], total = items.length) {
  return [
    { type: 'tool.call', data: { toolCallId, toolName: 'listDrafts', args: {} } },
    { type: 'tool.result', data: { toolCallId, toolName: 'listDrafts', ok: true } },
    { type: 'ui.media_strip', data: { toolCallId, toolName: 'listDrafts', items, total } },
  ];
}

type SeedMessage = {
  role: 'user' | 'assistant';
  content: string;
  ui_cards?: unknown[];
  metadata?: unknown;
};

export async function seedSession(
  supabase: SupabaseClient,
  sessionId: string,
  title: string,
  messages: SeedMessage[],
  lastAt: Date,
): Promise<void> {
  const start = lastAt.getTime() - messages.length * 1_000;
  await organic(supabase)
    .from('organic_chat_sessions')
    .insert({
      session_id: sessionId,
      brand_id: BRAND_ID,
      user_id: OWNER_ID,
      user_email: OWNER_EMAIL,
      title,
      timezone: 'UTC',
      initiator: 'user',
      tags: [],
      last_message_role: messages.at(-1)?.role ?? null,
      last_message_preview: messages.at(-1)?.content.slice(0, 80) ?? null,
      last_message_at: lastAt.toISOString(),
    })
    .throwOnError();
  await organic(supabase)
    .from('organic_chat_messages')
    .insert(
      messages.map((message, index) => ({
        session_id: sessionId,
        brand_id: BRAND_ID,
        user_id: OWNER_ID,
        user_email: OWNER_EMAIL,
        role: message.role,
        content: message.content,
        metadata: message.metadata ?? null,
        ui_cards: message.ui_cards ?? [],
        created_at: new Date(start + index * 1_000).toISOString(),
      })),
    )
    .throwOnError();
}

export async function purgeFixture(
  supabase: SupabaseClient,
  sessionIds: string[],
  assetIds: string[] = [],
): Promise<void> {
  if (assetIds.length > 0) {
    await (supabase as unknown as { schema: (s: string) => SupabaseClient })
      .schema('media')
      .from('assets')
      .delete()
      .in('id', assetIds);
  }
  if (sessionIds.length > 0) {
    await organic(supabase).from('organic_chat_messages').delete().in('session_id', sessionIds);
    await organic(supabase).from('organic_chat_sessions').delete().in('session_id', sessionIds);
  }
  await organic(supabase)
    .from('organic_calendar_drafts')
    .delete()
    .eq('brand_id', BRAND_ID)
    .like('client_key', `${PREFIX}%`);
  const { data } = await supabase.storage.from(BUCKET).list(STORAGE_DIR, { limit: 1000 });
  const names = (data ?? []).map((file) => `${STORAGE_DIR}/${file.name}`);
  if (names.length > 0) await supabase.storage.from(BUCKET).remove(names);
}

// --- Script mode ---------------------------------------------------------------------------------

if (process.argv.includes('--print-env')) {
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  for (const [key, value] of Object.entries(frontendBenchEnv())) {
    console.log(`export ${key}=${quote(value)}`);
  }
}
