// What the Blender scene benches share: their own Next app, the production-only env they forward,
// an upload exactly as a browser drop makes one, the parse wait, and the cleanup by tracked id.
// Nothing here reads env at import time, so `--help` and `--dry-run` load it for free.

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/** Everything a run created, by id. Cleanup touches nothing else. */
export type SceneBenchMade = {
  /** The uploaded templates: their jobs, outputs and cached drafts are found from these. */
  templates: Set<string>;
  assets: Set<string>;
  jobs: Set<string>;
  objects: Set<string>;
};

/** Values only production's env carries; nothing else of it reaches the bench processes. */
export function forwardProductionEnv(backendDir: string, keys: string[]) {
  const file = path.join(backendDir, '.env.production');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const found = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (found && keys.includes(found[1]!) && !process.env[found[1]!])
      process.env[found[1]!] = found[2]!.trim().replace(/^["']|["']$/g, '');
  }
}

export async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

export function killGroup(child: ChildProcess) {
  try {
    if (child.pid) process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}

/** The bench's own `next dev`, on its own port and dist dir, talking to the bench Backend. */
export async function startApp(options: {
  frontendDir: string;
  port: number;
  distDir: string;
  backendUrl: string;
  /** The env var that moves the port, named when the port is taken. */
  portEnv: string;
  timeoutMs: number;
}): Promise<() => void> {
  const app = `http://127.0.0.1:${options.port}`;
  if (await answers(app)) throw new Error(`${app} already answers; set ${options.portEnv}`);
  const child = spawn('bun', ['run', 'dev'], {
    cwd: options.frontendDir,
    detached: true,
    env: {
      ...process.env,
      PORT: String(options.port),
      NEXT_DIST_DIR: options.distDir,
      NEXT_PUBLIC_API_URL: options.backendUrl,
      API_URL: options.backendUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  child.stdout?.on('data', (chunk: Buffer) => tail.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => tail.push(chunk.toString()));
  for (const deadline = Date.now() + options.timeoutMs; Date.now() < deadline; ) {
    if (await answers(`${app}/login`)) return () => killGroup(child);
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  killGroup(child);
  throw new Error(`the Next app never came up on ${app}\n${tail.slice(-20).join('')}`);
}

export async function removeFlatPrefix(admin: SupabaseClient, bucket: string, prefix: string) {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  const paths = (data ?? []).filter((entry) => entry.id).map((entry) => `${prefix}/${entry.name}`);
  if (paths.length) await admin.storage.from(bucket).remove(paths);
  return paths.length;
}

const ticketSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  token: z.string().min(1),
  assetId: z.string().uuid(),
});

/**
 * library-upload sign → PUT → register as the signed-in user, exactly a browser drop. The asset
 * and its object are tracked the moment they are signed, so a failed PUT is still cleaned up.
 */
export async function uploadAsBrowserDrop(options: {
  supabaseUrl: string;
  publishableKey: string;
  accessToken: string;
  admin: SupabaseClient;
  brandId: string;
  fileName: string;
  bytes: Buffer;
  checksum: string;
  made: SceneBenchMade;
}) {
  const { supabaseUrl, publishableKey, accessToken, admin, brandId, fileName, bytes } = options;
  const libraryUpload = async (body: Record<string, unknown>) => {
    const response = await fetch(`${supabaseUrl}/functions/v1/library-upload`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: publishableKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(
        `library-upload ${String(body.action)} ${response.status}: ${text.slice(0, 300)}`,
      );
    return JSON.parse(text) as unknown;
  };
  const ticket = ticketSchema.parse(
    await libraryUpload({
      action: 'sign_upload',
      brandId,
      fileName,
      mimeType: 'application/octet-stream',
      sizeBytes: bytes.byteLength,
    }),
  );
  options.made.assets.add(ticket.assetId);
  options.made.objects.add(`${ticket.bucket}::${ticket.path}`);
  options.made.templates.add(ticket.assetId);
  const put = await admin.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, bytes, {
      contentType: 'application/octet-stream',
    });
  if (put.error) throw new Error(`storage PUT: ${put.error.message}`);
  await libraryUpload({
    action: 'register',
    brandId,
    assetId: ticket.assetId,
    bucket: ticket.bucket,
    storagePath: ticket.path,
    fileName,
    mimeType: 'application/octet-stream',
    sizeBytes: bytes.byteLength,
    checksum: options.checksum,
  });
  return ticket;
}

export type TemplateSourceState = { family: string; parse_state: string };

/**
 * Register asks the deployed Backend to parse; if that has not settled in 45 s, the bench's own
 * Backend parses it through the same internal route. `settled` says which states end the wait.
 */
export async function waitForParse(options: {
  admin: SupabaseClient;
  assetId: string;
  brandId: string;
  backendUrl: string;
  parseSecret: string | undefined;
  note: (message: string) => void;
  settled?: (state: string | undefined) => boolean;
}): Promise<TemplateSourceState | null> {
  const settled = options.settled ?? ((state) => state === 'parsed');
  const parseState = async () =>
    ((
      await options.admin
        .schema('media')
        .from('template_sources')
        .select('family,parse_state')
        .eq('asset_id', options.assetId)
        .maybeSingle()
    ).data as TemplateSourceState | null) ?? null;
  let row = await parseState();
  for (let tries = 0; tries < 45 && !settled(row?.parse_state); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    row = await parseState();
  }
  if (!settled(row?.parse_state)) {
    options.note(
      `deployed parse did not land (state ${row?.parse_state ?? 'no row'}); parsing on the bench Backend`,
    );
    const response = await fetch(`${options.backendUrl}/api/ai-studio/templates/parse`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.parseSecret ?? ''}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ brandId: options.brandId, assetId: options.assetId }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok)
      options.note(
        `bench parse answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    row = await parseState();
  }
  return row;
}

/**
 * Deletes exactly what a run made — its templates' render jobs and their Library outputs, every
 * storage object behind them and the drafts cached under each template — by id, never by diff:
 * other sessions write into the bench brand concurrently. Never touches `template_variants` or
 * `template_revisions`. `left` counts only LIVE rows: a template whose sheet was opened keeps its
 * row (its baseline revision is immutable and points at it), so the app's Remove is the most that
 * can happen to it.
 */
export async function cleanupMade(options: {
  admin: SupabaseClient;
  brandId: string;
  renderBucket: string;
  made: SceneBenchMade;
}): Promise<{ left: number; detail: string }> {
  const { admin, brandId, renderBucket, made } = options;
  const media = () => admin.schema('media');
  for (const templateAssetId of made.templates) {
    // Every scene job names its template, and this template is this run's own upload — so this
    // also finds a job the API saved but answered without an id, and every output it wrote.
    const { data: jobs } = await media()
      .from('client_render_jobs')
      .select('id, result_asset_refs')
      .eq('kind', 'scene_render')
      .eq('brand_id', brandId)
      .eq('source_id', `blend:${templateAssetId}`);
    for (const job of (jobs ?? []) as Array<{
      id: string;
      result_asset_refs: Array<{ assetId: string }> | null;
    }>) {
      made.jobs.add(job.id);
      for (const ref of job.result_asset_refs ?? []) made.assets.add(ref.assetId);
    }
  }
  const ids = [...made.assets];
  // Only this brand's rows: an id is never deleted on the strength of where it was read.
  const { data: owned } = ids.length
    ? await media().from('assets').select('id').in('id', ids).eq('brand_id', brandId)
    : { data: [] };
  const assets = ((owned ?? []) as Array<{ id: string }>).map((asset) => asset.id);
  if (assets.length) {
    const { data: versions } = await media()
      .from('asset_versions')
      .select('bucket, storage_path')
      .in('asset_id', assets);
    for (const v of (versions ?? []) as Array<{ bucket: string; storage_path: string }>)
      made.objects.add(`${v.bucket}::${v.storage_path}`);
  }
  if (made.jobs.size)
    await media()
      .from('client_render_jobs')
      .delete()
      .in('id', [...made.jobs]);
  if (assets.length) await media().from('template_source_events').delete().in('asset_id', assets);
  const refused: string[] = [];
  for (const id of assets) {
    // One row at a time: a multi-row delete deadlocks (40P01) against fresh-asset writers.
    for (let attempt = 1; attempt <= 5; attempt++) {
      const del = await media().from('assets').delete().eq('id', id).eq('brand_id', brandId);
      if (!del.error) break;
      if (del.error.code !== '40P01' || attempt === 5) {
        refused.push(`${id.slice(0, 8)} ${del.error.code}: ${del.error.message.slice(0, 120)}`);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
    }
  }
  for (const entry of made.objects) {
    const [bucket, objectPath] = entry.split('::') as [string, string];
    await admin.storage.from(bucket).remove([objectPath]);
  }
  let previews = 0;
  for (const templateAssetId of made.templates)
    previews += await removeFlatPrefix(
      admin,
      renderBucket,
      `${brandId}/scene-previews/${templateAssetId}`,
    );
  for (const jobId of made.jobs)
    await removeFlatPrefix(admin, renderBucket, `${brandId}/scene-renders/${jobId}`);
  const { data: remaining } = assets.length
    ? await media().from('assets').select('id, deleted_at').in('id', assets)
    : { data: [] };
  const rows = (remaining ?? []) as Array<{ id: string; deleted_at: string | null }>;
  const left = rows.filter((row) => !row.deleted_at).length;
  const ledgered = rows.length - left;
  return {
    left,
    detail: `${assets.length} asset(s), ${made.jobs.size} job(s), ${made.objects.size} object(s), ${previews} draft(s) removed · ${left} left${ledgered ? ` · ${ledgered} removed in the app, row kept by its revision ledger` : ''}${left && refused.length ? ` · refused ${refused.join('; ')}` : ''}`,
  };
}
