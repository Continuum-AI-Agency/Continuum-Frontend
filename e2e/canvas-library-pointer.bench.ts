#!/usr/bin/env bun
import type { BackgroundRemovalCompletedData } from '@continuum/contracts';
/**
 * canvas:library-pointer:bench — proves that media pulled OUT of the Library reaches
 * a backend op with a Library pointer the backend can actually resolve.
 *
 * The bug this exists to catch: "Open in Canvas" seeded its reference node with
 * `libraryAssetId`, the workflow executor read `assetId`, and Remove Background told
 * the user to "save this media to the Library first" about an asset that had come
 * straight out of the Library. Every piece was individually correct and the feature
 * was unusable.
 *
 * A unit test cannot catch it, because the two halves live in different files and
 * each is right about its own key. So this bench runs the WHOLE chain on real data:
 *
 *   a real media.assets row  ->  buildLibraryCanvasTemplate (what the seed route runs)
 *   ->  readNodeAssetRef (what the executor runs)
 *   ->  the real removeBackgroundOp
 *   ->  the deployed /api/ai-studio/remove-background
 *   ->  a real GPU matte, a real registered cutout
 *
 * and asserts the cutout the service returns is pinned to the SOURCE VERSION of the
 * row we started from. Nothing here is a fixture except the brand.
 *
 *   bun run canvas:library-pointer:bench
 */
import { createClient } from '@supabase/supabase-js';
import { buildLibraryCanvasTemplate } from '@/lib/library/canvasTemplates';
import { __testing } from '@/StudioCanvas/utils/actions/removeBackgroundOp';
import { readNodeAssetRef } from '@/StudioCanvas/utils/nodeAssetRef';

type Grade = 'PASS' | 'WARN' | 'SKIP' | 'FAIL';
const GLYPH: Record<Grade, string> = { PASS: '✓', WARN: '!', SKIP: '–', FAIL: '✗' };
const results: Array<{ step: string; grade: Grade; detail?: string }> = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

const record = (step: string, grade: Grade, detail?: string) => {
  results.push({ step, grade, detail });
  console.log(`${GLYPH[grade]} ${grade.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`);
};
const check = (step: string, ok: boolean, detail?: string) =>
  record(step, ok ? 'PASS' : 'FAIL', detail);
const note = (message: string) => {
  notes.push(message);
  console.log(`· ${message}`);
};

function finish(): never {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const r of results) counts[r.grade.toLowerCase() as keyof typeof counts] += 1;
  const exitCode = counts.fail > 0 ? 1 : 0;
  const durationMs = Date.now() - startedMs;
  if (process.env.BENCH_JSON === '1') {
    console.log(
      JSON.stringify({
        bench: 'canvas:library-pointer:bench',
        startedAt,
        durationMs,
        results,
        notes,
        counts,
        exitCode,
      }),
    );
  } else {
    const skipped = results.filter((r) => r.grade === 'SKIP');
    if (skipped.length > 0) {
      console.log(`\nNOT COVERED by this run (${skipped.length}):`);
      for (const r of skipped) console.log(`  – ${r.step}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    console.log(
      `\n${exitCode === 0 ? 'PASS' : 'FAIL'} — canvas:library-pointer:bench: ${counts.pass} pass, ` +
        `${counts.warn} warn, ${counts.skip} skip, ${counts.fail} fail (${(durationMs / 1000).toFixed(1)}s)`,
    );
  }
  process.exit(exitCode);
}

const BRAND_ID = process.env.CONTINUUM_TEST_BRAND_ID ?? '32841a24-9e31-480c-8a3a-7ebc3cde0569';
const apiBaseUrl = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const OWNER_EMAIL = process.env.CONTINUUM_TEST_OWNER_EMAIL ?? 'duanecscott@gmail.com';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    record('read bench environment', 'FAIL', `missing env: ${name}`);
    finish();
  }
  return value;
}

// The trap this guard exists for: `bun` auto-loads `.env.local`, which on this machine
// points NEXT_PUBLIC_SUPABASE_URL at the LOCAL stack. A bench that silently retargets
// there finds no fixture, skips everything and reports green.
const supabaseUrl = requireEnv('SUPABASE_URL');
if (/127\.0\.0\.1|\[::1\]|localhost/.test(supabaseUrl)) {
  record(
    'read bench environment',
    'FAIL',
    `SUPABASE_URL points at the local stack (${supabaseUrl}); the fixture brand lives on the hosted project`,
  );
  finish();
}
const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = requireEnv('SUPABASE_ANON_KEY');

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * A real user access token for the brand owner. The magic-link -> verifyOtp recipe is
 * the only one that satisfies the Backend's JWKS verification; a hand-signed JWT is
 * rejected. Same recipe as the Backend bench kit's `mintAccessToken`, reimplemented
 * here because a cross-project source import is forbidden.
 */
async function mintAccessToken(): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: OWNER_EMAIL,
  });
  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) return null;
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verified = await anon.auth.verifyOtp({ token_hash: hashedToken, type: 'email' });
  return verified.data.session?.access_token ?? null;
}

interface AssetRow {
  id: string;
  kind: string;
  bucket: string;
  storage_path: string;
  file_name: string;
  head_version_id: string;
}

async function main(): Promise<void> {
  // --- 1. A real Library row. The whole point is that nothing here is synthetic. ---
  const { data, error } = await admin
    .schema('media')
    .from('assets')
    .select('id, kind, bucket, storage_path, file_name, head_version_id')
    .eq('brand_id', BRAND_ID)
    .eq('kind', 'image')
    .is('deleted_at', null)
    .not('head_version_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const row = (data?.[0] ?? null) as AssetRow | null;
  if (error || !row) {
    record(
      'read a real Library image row',
      'FAIL',
      error?.message ?? 'no image asset in the brand',
    );
    finish();
  }
  record('read a real Library image row', 'PASS', `${row.file_name} (${row.id})`);

  // --- 2. The seed the "Open in Canvas" route builds, over that real row. ---
  const seed = buildLibraryCanvasTemplate({
    template: 'brand-align',
    seedId: 'benchseed',
    asset: {
      id: row.id,
      kind: 'image',
      bucket: row.bucket,
      storagePath: row.storage_path,
      fileName: row.file_name,
      headVersionId: row.head_version_id,
    },
  });
  const reference = seed.nodes.find((node) => node.type === 'image');
  check(
    'the seeded reference node carries the Library pointer under the canvas key',
    reference?.data.assetId === row.id,
    `assetId=${String(reference?.data.assetId)}`,
  );
  check(
    'the seeded reference node pins the head version',
    reference?.data.assetVersionId === row.head_version_id,
    `assetVersionId=${String(reference?.data.assetVersionId)}`,
  );

  // --- 3. What the executor reads off that node, and off an already-persisted one. ---
  check(
    "the executor's read resolves the seeded node to the same asset",
    readNodeAssetRef(reference?.data)?.assetId === row.id,
  );
  // Graphs seeded before this fix hold ONLY `libraryAssetId`; they must heal on read
  // rather than needing a re-seed.
  check(
    'a graph persisted with only libraryAssetId still resolves',
    readNodeAssetRef({ libraryAssetId: row.id, bucket: row.bucket })?.assetId === row.id,
  );

  const resolved = readNodeAssetRef(reference?.data);
  if (!resolved) finish();

  // --- 4. The real op against the deployed route: does the backend find this asset? ---
  const token = await mintAccessToken();
  if (!token) {
    record(
      'the backend resolved the pointer to a real Library source',
      'SKIP',
      `could not mint an access token for ${OWNER_EMAIL}`,
    );
    note(
      'The backend hop was NOT exercised: steps 1-3 prove the pointer the canvas produces, ' +
        'not that the matte service resolves it. Re-run with a working owner account.',
    );
    finish();
  }

  const response = await fetch(`${apiBaseUrl}/api/ai-studio/remove-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      brandId: BRAND_ID,
      sourceAssetId: resolved.assetId,
      requestId: crypto.randomUUID(),
      kind: 'image',
      mode: 'remove',
      featherPx: 0,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    record(
      'the backend accepts the pointer the canvas produced',
      response.status === 403 || response.status === 401 ? 'WARN' : 'FAIL',
      `HTTP ${response.status} ${body.slice(0, 160)}`,
    );
    finish();
  }

  // Read the stream with the op's OWN reader, so a frame shape the canvas cannot parse
  // fails here rather than in front of a user.
  const stages: string[] = [];
  let completed: BackgroundRemovalCompletedData | null = null;
  let failure: { code: string; message: string } | null = null;
  for await (const event of __testing.readEvents(response)) {
    if (event.type === 'background_removal.progress') stages.push(event.data.stage);
    if (event.type === 'background_removal.completed') completed = event.data;
    if (event.type === 'background_removal.failed') failure = event.data;
  }

  // `matting` is emitted ONLY after getSourceAsset resolved the row and signed it, so
  // reaching it is the proof that the id the canvas produced is one the backend can
  // find. `SOURCE_NOT_FOUND` is precisely the regression this bench exists for.
  const resolvedSource = stages.includes('matting');
  check(
    'the backend resolved the pointer to a real Library source',
    resolvedSource && failure?.code !== 'SOURCE_NOT_FOUND',
    `stages=[${stages.join(', ')}]${failure ? ` failed=${failure.code}` : ''}`,
  );

  let cutoutAssetId: string | null = null;
  if (completed) {
    cutoutAssetId = completed.assetId;
    record(
      'the matte returns a real cutout',
      'PASS',
      `${completed.mimeType} ${completed.width}x${completed.height}, asset ${completed.assetId}`,
    );
    // The cutout is recorded as a derivative OF the exact version the canvas node named
    // — which is the only thing the pointer was ever needed for.
    check(
      'the cutout is pinned to the source version the canvas node named',
      completed.sourceVersionId === row.head_version_id,
      `sourceVersionId=${completed.sourceVersionId} head=${row.head_version_id}`,
    );
    check('the cutout carries an alpha channel', completed.hasAlpha === true);
  } else {
    record(
      'the matte returns a real cutout',
      'WARN',
      `${failure?.code ?? 'no completion'} — ${failure?.message ?? 'stream ended'}`,
    );
    note(
      `The GPU hop did NOT run (${failure?.code ?? 'no completion'}). The pointer chain above is ` +
        'proven; the matte service itself is the un-exercised hop in this run.',
    );
  }

  // --- 5. Put the shared brand back the way we found it. ---
  if (cutoutAssetId) {
    const { error: cleanupError } = await admin
      .schema('media')
      .from('assets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', cutoutAssetId)
      .eq('brand_id', BRAND_ID);
    record(
      'retire the cutout this run created',
      cleanupError ? 'WARN' : 'PASS',
      cleanupError?.message ?? cutoutAssetId,
    );
  }

  record(
    'register-in-place and upload rungs of the pointer ladder',
    'SKIP',
    'both go through Next route handlers that require a browser session',
  );
  note(
    'NOT covered end to end: the ladder rungs that MINT a missing pointer ' +
      '(/api/library/register-canvas, library-upload) need a browser session, so they are ' +
      'covered by src/StudioCanvas/utils/nodeAssetRef.test.ts only. The rung this bench ' +
      'proves is the one the bug report is about: a node that already came from the Library.',
  );
  finish();
}

main().catch((error) => {
  record('bench', 'FAIL', error instanceof Error ? error.message : String(error));
  finish();
});
