import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type {
  EditorClip,
  EditorProjectV2,
  VideoEditorOpInput,
  VideoEditorOpName,
  VideoEditorOpOutput,
} from '@continuum/contracts';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { prodSql } from '../../Continuum-Backend/scripts/_bench/managementSql';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';
import { ffprobe, type Probe } from './video-editor-journey/frames';
import { bootBackend, bootFrontend, freePort, type Server } from './video-editor-workspace/harness';
import { removeAssets, removeProjects } from './video-editor-workspace/ledger';

// ---------------------------------------------------------------------------
// videoeditor:first-cut:finish:e2e:bench — footage + goal → FINISHED first cuts, then every
// variant exported in one action, in a real browser, as the bench login on the bench brand
// against PRODUCTION Supabase, a local Backend from this tree (every worker off), a Next
// dev server, and production Render for the exports.
//
//   the six Vivo 47 testimonial reels + two public-domain NASA b-roll clips (audio
//   stripped) are placed on a fresh project's timeline through add_clip → the top-bar
//   "First cut" opens the Brief → its Finish switches (music, hook title, b-roll, brand
//   captions) are on → 3 × 30 s hooks, everything left ticked (the b-roll has no speech,
//   so it becomes b-roll, not a source) → the summary shows each variant's headline →
//   "Open B": a music lane ducked under speech, the hook title at 0, b-roll over the
//   talking head, captions → "Export all variants" → TikTok → three 1080×1920 MP4s about
//   30 s long, each downloaded as a file → net zero.
//
// Render: the `export-long` revision (override with VIDEO_EDITOR_RENDER_URL), reached by the
// local Backend with its own service-account identity. A TikTok export encodes at ~10 Mb/s,
// so production Render, which answers an MP4 in one buffered body, drops any cut past ~27 s as
// an empty 500 (Cloud Run's 32 MiB cap) — a 28.45 s variant failed twice there on 09-30. The
// export-long revision streams its answer. An unreachable Render is graded and skips only
// the export steps.
//
// Writes, only under BENCH_SINK=library: the two b-roll uploads, the projects the draft
// makes, each variant's music bed, the three exports, the draft/generation job rows and the
// transcripts the Backend keeps per footage version — all deleted at exit, net zero
// asserted by id and by name against a baseline.
// ---------------------------------------------------------------------------

test.describe.configure({ timeout: 2_700_000 });

const BENCH = 'videoeditor:first-cut:finish:e2e:bench';
const BRAND = process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
/** Where the Backend keeps transcripts per version and stores exports (AI_STUDIO_BUCKET). */
const BRAND_BUCKET = process.env.AI_STUDIO_BUCKET ?? 'brand-profile-assets';
const OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
const RENDER_URL =
  process.env.VIDEO_EDITOR_RENDER_URL ??
  'https://export-long---continuum-render-xhdlroxena-uw.a.run.app';
/** Six first-person Vivo 47 gym testimonials (Spanish), read-only: ~31–35 s of distinct lines. */
const REEL_IDS = [
  '9d01883c-05ce-4465-aa4d-88a7a048bb4c',
  '9e5ea821-519d-4f98-bb3f-2b9d60cd658b',
  'c677b4a5-a877-41b5-927a-4c9955c1b47b',
  'b3fd8380-9be7-4dd0-b219-bb44c82699c6',
  'a1b576b7-9cc0-468f-84e0-d01b585de761',
  '88e1654c-c537-4cfa-bc1f-3c342d556709',
];
const FIXTURE_BUCKET = 'continuum-production-477821-creative-benchmarks';
const FIXTURE_PREFIX = 'video-editor-finish/fixtures/';
const TARGET_SEC = 30;
const TOLERANCE = 0.15;
const FRAME_SEC = 1 / 30;
const DRAFT_BUDGET_MS = 15 * 60_000;
const EXPORT_BUDGET_MS = 20 * 60_000;
const RUN = randomUUID().slice(0, 8);
const FIXTURE_FOLDER = `${BRAND}/video-editor-bench/first-cut-finish-${RUN}`;
const JOB_ID = /^job_[0-9a-f]{32}$/;

const { url: supabaseUrl, serviceRoleKey } = loadProdSupabaseEnv();
process.env.SUPABASE_URL = supabaseUrl;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const media = admin.schema('media');
// The Backend's own service account: it reads the benchmarks bucket and invokes Render. An
// ID token may not carry scopes, so the Render identity is its own client.
const keyFile = resolve(
  __dirname,
  '../../Continuum-Backend',
  readBackendEnv('GOOGLE_APPLICATION_CREDENTIALS') ?? 'GOOGLE_CREDS.json',
);
const google = new GoogleAuth({
  keyFile,
  scopes: ['https://www.googleapis.com/auth/devstorage.read_only'],
});
const renderIdentity = new GoogleAuth({ keyFile });
const rec = new Recorder(BENCH);
const results: { step: string; grade: 'PASS' | 'FAIL'; detail?: string }[] = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

function check(step: string, ok: boolean, detail?: string): boolean {
  rec.check(step, ok, detail);
  results.push({ step, grade: ok ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
  return ok;
}
function note(message: string): void {
  rec.note(message);
  notes.push(message);
}
function printEnvelope(): number {
  const counts = rec.summary();
  const exitCode = counts.fail > 0 ? 1 : 0;
  console.log(
    JSON.stringify({
      bench: BENCH,
      startedAt,
      durationMs: Date.now() - startedMs,
      results,
      notes,
      counts,
      exitCode,
    }),
  );
  return counts.fail;
}

// ── the Backend's doors, as the bench user ────────────────────────────────────────────

type Api = { base: string; token: string };

async function runOp<N extends VideoEditorOpName>(
  api: Api,
  projectId: string,
  op: N,
  input: Omit<VideoEditorOpInput<N>, 'projectId'>,
): Promise<VideoEditorOpOutput<N>> {
  const response = await fetch(`${api.base}/api/ai-studio/video-projects/${projectId}/ops/${op}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${op} → ${response.status}: ${body.slice(0, 400)}`);
  return JSON.parse(body) as VideoEditorOpOutput<N>;
}
async function getProject(api: Api, projectId: string): Promise<EditorProjectV2> {
  const read = await runOp(api, projectId, 'get_project', { full: true });
  if (!read.project) throw new Error('get_project full=true returned no project document');
  return read.project;
}

const sameWords = (left: string, right: string) =>
  left.replace(/\s+/g, ' ').trim().toLocaleLowerCase() ===
  right.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const visibleCount = (locator: Locator) => locator.filter({ visible: true }).count();
const assetOf = (clip: EditorClip) =>
  'source' in clip && clip.source.sourceType === 'library_asset' ? clip.source.assetId : '';
const mainTrackId = (project: EditorProjectV2) =>
  project.tracks
    .filter((track) => track.kind === 'video')
    .sort((left, right) => left.order - right.order)[0]?.id;

/** What finishing put on one variant, read from its persisted document. */
function finishOf(project: EditorProjectV2, brollIds: ReadonlySet<string>) {
  const main = mainTrackId(project);
  const clips = project.tracks.flatMap((track) =>
    track.enabled ? track.clips.map((clip) => ({ clip, trackId: track.id })) : [],
  );
  const bed = clips.find(
    ({ clip }) =>
      clip.kind === 'audio' && !REEL_IDS.includes(assetOf(clip)) && !brollIds.has(assetOf(clip)),
  )?.clip;
  const volumeKeys =
    bed && 'keyframes' in bed
      ? bed.keyframes.filter((key) => key.property === 'audio.volume').length
      : 0;
  const hook = clips.find(
    ({ clip }) => clip.kind === 'text' && Math.abs(clip.timelineStartSec) < 0.05,
  )?.clip;
  const broll = clips.filter(
    ({ clip, trackId }) =>
      (clip.kind === 'video' || clip.kind === 'overlay') &&
      trackId !== main &&
      brollIds.has(assetOf(clip)),
  );
  const captions = clips.filter(({ clip }) => clip.kind === 'caption').map(({ clip }) => clip);
  return {
    bed,
    volumeKeys,
    hookText: hook && hook.kind === 'text' ? hook.text : '',
    broll: broll.length,
    captions,
  };
}

// ── the b-roll fixtures: public domain, staged once in GCS, uploaded per run ──────────

type Fixture = { slug: string; title: string; sha256: string };

const MANIFEST = `${FIXTURE_PREFIX}manifest.json`;
/** F1's manifest: one public-domain NASA source, cut into silent 8 s clips. */
const manifestSchema = z.object({
  source: z.object({ title: z.string() }),
  fixtures: z
    .array(z.object({ name: z.string().endsWith('.mp4'), sha256: z.string(), content: z.string() }))
    .min(1),
});

async function gcsObject(name: string): Promise<Buffer> {
  const client = await google.getClient();
  const response = await client.request<ArrayBuffer>({
    url: `https://storage.googleapis.com/storage/v1/b/${FIXTURE_BUCKET}/o/${encodeURIComponent(name)}?alt=media`,
    responseType: 'arraybuffer',
  });
  return Buffer.from(response.data);
}

/** The b-roll clips F1 staged: read the manifest, download each, verify its checksum. */
async function stageBrollFixtures(): Promise<Array<Fixture & { bytes: Buffer }>> {
  const manifest = manifestSchema.parse(JSON.parse((await gcsObject(MANIFEST)).toString('utf8')));
  return Promise.all(
    manifest.fixtures.map(async (entry) => {
      const bytes = await gcsObject(`${FIXTURE_PREFIX}${entry.name}`);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (sha256 !== entry.sha256) {
        throw new Error(`${entry.name}: checksum ${sha256} is not the staged ${entry.sha256}`);
      }
      return {
        slug: entry.name.replace(/\.mp4$/, ''),
        // Deliberately long (~140 characters with the "b-roll: " prefix): a clip named after
        // it once broke every export, because a Render input label is capped at 120.
        title: `${entry.content} (${manifest.source.title})`,
        sha256,
        bytes,
      };
    }),
  );
}

/** Upload one fixture into the bench brand's Library and register it (no analysis queued). */
async function registerFixture(fixture: Fixture & { bytes: Buffer }, scratch: string) {
  const local = join(scratch, `${fixture.slug}.mp4`);
  writeFileSync(local, fixture.bytes);
  const probe = ffprobe(local);
  const storagePath = `${FIXTURE_FOLDER}/${fixture.slug}.mp4`;
  const { error: uploadError } = await admin.storage
    .from(BRAND_BUCKET)
    .upload(storagePath, fixture.bytes, { contentType: 'video/mp4' });
  if (uploadError) throw new Error(`upload ${fixture.slug}: ${uploadError.message}`);
  const { data, error } = await media.rpc('library_execute_operation', {
    p_action: 'register_generated_asset',
    p_payload: {
      action: 'register_generated_asset',
      brandId: BRAND,
      kind: 'video',
      bucket: BRAND_BUCKET,
      storagePath,
      fileName: `${fixture.slug}.mp4`,
      mimeType: 'video/mp4',
      width: probe.width,
      height: probe.height,
      durationMs: Math.round(probe.videoSec * 1_000),
      sizeBytes: fixture.bytes.length,
      source: 'canvas',
      operation: 'bench_fixture',
      originRef: {},
      sourceAssetIds: [],
      checksum: fixture.sha256,
      tags: ['bench:video-editor-finish'],
      title: `b-roll: ${fixture.title}`,
      description: null,
      integrityState: 'verified',
      idempotencyKey: `generated:${createHash('sha256').update(`${BRAND_BUCKET}\0${storagePath}`).digest('hex')}`,
      actor: null,
    },
  });
  const receipt = data as { assetId?: string; versionId?: string } | null;
  if (error || !receipt?.assetId) {
    throw new Error(`register ${fixture.slug}: ${error?.message ?? 'no receipt'}`);
  }
  return { id: receipt.assetId, storagePath, probe };
}

// ── net zero, by id and name ──────────────────────────────────────────────────────────

async function brandAssetIds(): Promise<Set<string>> {
  const rows = await prodSql<{ id: string }>(
    `select id::text as id from media.assets where brand_id = '${BRAND}'`,
  );
  if (rows === null) throw new Error('net zero needs the Supabase management token');
  return new Set(rows.map((row) => row.id));
}
async function brandObjectNames(): Promise<Set<string>> {
  const rows = await prodSql<{ name: string }>(
    `select bucket_id || '/' || name as name from storage.objects where name like '${BRAND}/%'`,
  );
  if (rows === null) throw new Error('net zero needs the Supabase management token');
  return new Set(rows.map((row) => row.name));
}
async function versionIdsOf(assetIds: readonly string[]): Promise<string[]> {
  if (assetIds.length === 0) return [];
  const { data } = await media.from('asset_versions').select('id').in('asset_id', assetIds);
  return (data ?? []).map((row) => (row as { id: string }).id);
}

/** Waits for a submitted draft to finish in the open dialog, sampling its progress. */
async function draftToSummary(page: Page, dialog: Locator) {
  const began = Date.now();
  const phases = new Set<string>();
  let failure = '';
  const summary = dialog.getByTestId('brief-summary');
  while (Date.now() - began < DRAFT_BUDGET_MS) {
    const phase = page.locator('[data-testid="brief-phase"]:visible');
    if ((await phase.count()) > 0) phases.add((await phase.innerText().catch(() => '')).trim());
    const alert = dialog.getByRole('alert');
    if ((await alert.count()) > 0) {
      failure = await alert.innerText();
      break;
    }
    if ((await summary.count()) > 0) break;
    await sleep(500);
  }
  const rows = await summary.locator('li[data-variant]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: node.getAttribute('data-variant') ?? '',
      headline: (node.querySelector('[data-testid="brief-headline"]')?.textContent ?? '')
        .replace(/[“”]/g, '')
        .trim(),
      text: (node.textContent ?? '').trim(),
    })),
  );
  return { ms: Date.now() - began, phases: [...phases].filter(Boolean), failure, rows };
}

type ExportRow = { label: string; state: string; text: string };
async function exportRows(dialog: Locator): Promise<ExportRow[]> {
  return dialog.locator('[data-testid="export-variants"] li[data-variant]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: node.getAttribute('data-variant') ?? '',
      state: node.getAttribute('data-state') ?? '',
      text: (node.textContent ?? '').trim(),
    })),
  );
}
const settled = (rows: readonly ExportRow[]) =>
  rows.length > 0 && rows.every((row) => row.state === 'completed' || row.state === 'failed');
async function exportsSettle(dialog: Locator): Promise<ExportRow[]> {
  const deadline = Date.now() + EXPORT_BUDGET_MS;
  let rows = await exportRows(dialog);
  while (!settled(rows) && Date.now() < deadline) {
    await sleep(2_000);
    rows = await exportRows(dialog);
  }
  return rows;
}

const probeLine = (probe: Probe, timelineSec: number) =>
  `${probe.codec} ${probe.width}×${probe.height}, ${probe.videoSec.toFixed(3)} s vs timeline ${timelineSec.toFixed(3)} s`;

test(BENCH, async ({ browser }) => {
  const sinkLibrary = process.env.BENCH_SINK === 'library';
  if (!check('Library sink enabled for the fixture + export hops', sinkLibrary)) {
    printEnvelope();
    expect(sinkLibrary, 'run through the package script: the bench writes Library rows').toBe(true);
    return;
  }
  const servers: Server[] = [];
  const createdProjects = new Set<string>();
  const createdAssets: { id: string; storagePath: string }[] = [];
  const briefIds = new Set<string>();
  const draftJobs = new Set<string>();
  const scratch = mkdtempSync(join(tmpdir(), 'video-first-cut-finish-'));
  let previousActiveBrand: string | null = null;
  let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | null = null;
  let assetsBefore = new Set<string>();
  let objectsBefore = new Set<string>();
  const exercised = new Set<string>();
  try {
    await (async () => {
      assetsBefore = await brandAssetIds();
      objectsBefore = await brandObjectNames();
      note(
        `net zero baseline: ${assetsBefore.size} media.assets rows, ${objectsBefore.size} objects under ${BRAND}/`,
      );

      // ── Render, as the Backend will reach it ────────────────────────────────────────
      const health = await renderIdentity
        // A tagged revision takes a token minted for its service, not for the tag's own host.
        .getIdTokenClient(RENDER_URL.replace(/\/\/[^/]*---/, '//'))
        .then((client) => client.request<{ revision?: string }>({ url: `${RENDER_URL}/health` }))
        .then(
          (response) => ({ ok: response.status === 200, body: JSON.stringify(response.data) }),
          (error: unknown) => ({ ok: false, body: String(error) }),
        );
      const renderUp = check(
        "Render answers /health to the Backend's service-account identity",
        health.ok,
        `${RENDER_URL} → ${health.body.slice(0, 160)}`,
      );

      // ── the b-roll fixtures (a miss is graded, and the rest still runs) ─────────────
      let fixtures: Array<Fixture & { bytes: Buffer }> = [];
      let stageError = '';
      try {
        fixtures = await stageBrollFixtures();
      } catch (error) {
        stageError = String(error).slice(0, 300);
      }
      const brollIds = new Set<string>();
      const brollProbes: string[] = [];
      for (const fixture of fixtures) {
        const registered = await registerFixture(fixture, scratch);
        createdAssets.push({ id: registered.id, storagePath: registered.storagePath });
        brollIds.add(registered.id);
        brollProbes.push(
          `${fixture.slug} ${registered.probe.width}×${registered.probe.height} ${registered.probe.videoSec.toFixed(1)} s audio "${registered.probe.audio || 'none'}"`,
        );
      }
      check(
        'two public-domain b-roll clips, audio stripped, stage from GCS into the bench brand Library',
        fixtures.length === 2 &&
          brollIds.size === 2 &&
          brollProbes.every((line) => line.endsWith('audio "none"')),
        brollProbes.join(' · ') || stageError || 'none staged',
      );

      // ── servers + identity ──────────────────────────────────────────────────────────
      const fePort = await freePort();
      const backend = await bootBackend(`http://localhost:${fePort}`, {
        CONTINUUM_RENDER_SERVICE_URL: RENDER_URL,
      });
      servers.push(backend);
      const frontend = await bootFrontend(fePort, backend.url, '.next/video-first-cut-finish-e2e');
      servers.push(frontend);
      note(`local Backend ${backend.url} (workers off, log ${backend.log}); Next ${frontend.url}`);
      session = await mintSessionBundleForEmail(OWNER_EMAIL);
      const api: Api = { base: backend.url, token: session.accessToken };
      const { data: preference } = await admin
        .schema('brand_profiles')
        .from('user_brand_preferences')
        .select('active_brand_id')
        .eq('user_id', session.userId)
        .maybeSingle();
      previousActiveBrand =
        (preference as { active_brand_id?: string } | null)?.active_brand_id ?? null;
      await admin
        .schema('brand_profiles')
        .from('user_brand_preferences')
        .upsert(
          { user_id: session.userId, active_brand_id: BRAND, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );

      // ── a fresh edit, its timeline built through add_clip ───────────────────────────
      const context = await browser.newContext({
        storageState: session.state,
        viewport: { width: 1600, height: 1000 },
        acceptDownloads: true,
      });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('response', (response) => {
        // A refused export says why only in its body; the dialog shows the error code.
        if (new URL(response.url()).pathname.endsWith('/ops/export') && response.status() >= 400) {
          void response
            .text()
            .then((body) => note(`export refused ${response.status()}: ${body.slice(0, 600)}`))
            .catch(() => undefined);
        }
        if (!new URL(response.url()).pathname.endsWith('/ops/draft_cut')) return;
        void response
          .json()
          .then((body: { jobId?: unknown }) => {
            if (typeof body.jobId === 'string' && JOB_ID.test(body.jobId))
              draftJobs.add(body.jobId);
          })
          .catch(() => undefined);
      });
      await page.goto(`${frontend.url}/studio/video/new`, { timeout: 300_000 });
      await page.waitForURL(/\/studio\/video\/[0-9a-f-]{36}/, { timeout: 180_000 });
      const projectA = /\/studio\/video\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
      createdProjects.add(projectA);
      await expect(page.locator('[data-testid="video-studio-edit"]:visible')).toHaveCount(1, {
        timeout: 180_000,
      });
      let atSec = 0;
      for (const assetId of [...REEL_IDS, ...brollIds]) {
        await runOp(api, projectA, 'add_clip', { assetId, atSec });
        atSec = (await getProject(api, projectA)).durationSec;
      }
      const built = await getProject(api, projectA);
      const pool = await runOp(api, projectA, 'get_pool', {});
      check(
        "add_clip builds the timeline from the reels and the b-roll; the b-roll is in the project's pool",
        [...brollIds].every((id) => pool.assets.some((asset) => asset.assetId === id)) &&
          built.tracks.flatMap((track) => track.clips).length === REEL_IDS.length + brollIds.size,
        `${built.tracks.flatMap((track) => track.clips).length} clips, ${built.durationSec.toFixed(1)} s · pool ${pool.assets.length} asset(s)`,
      );

      // ── the Brief, from the top bar: Finish is on ───────────────────────────────────
      const dialog = page.locator('[data-testid="brief-dialog"]:visible');
      await page.reload();
      await expect(page.locator('[data-testid="video-studio-edit"]:visible')).toHaveCount(1, {
        timeout: 120_000,
      });
      await page
        .getByRole('button', { name: 'First cut', exact: true })
        .filter({ visible: true })
        .click();
      await dialog.waitFor({ timeout: 30_000 });
      const finishNames = ['Music', 'Hook title', 'B-roll', 'Brand captions'];
      const finishStates = await Promise.all(
        finishNames.map(async (name) => {
          const control = dialog.getByRole('switch', { name, exact: true });
          return (await control.isVisible()) ? await control.getAttribute('aria-checked') : null;
        }),
      );
      check(
        'the Brief shows the Finish switches — music, hook title, b-roll, brand captions — all on',
        finishStates.every((state) => state === 'true'),
        finishNames.map((name, index) => `${name}=${finishStates[index]}`).join(' '),
      );
      await dialog.getByRole('button', { name: '3 variants', exact: true }).click();
      await dialog.getByRole('button', { name: '30s hook', exact: true }).click();
      await dialog.getByRole('button', { name: 'Driving electronic', exact: true }).click();
      const checkedRows = dialog.locator(
        '[data-testid="brief-footage"] [role="checkbox"][aria-checked="true"]',
      );
      await expect(checkedRows)
        .toHaveCount(REEL_IDS.length + brollIds.size, { timeout: 30_000 })
        .catch(() => undefined);
      check(
        `the goal is 3 × 30 s hooks over all ${REEL_IDS.length + brollIds.size} clips (b-roll left ticked), music mood picked`,
        (await dialog.getByTestId('brief-length').innerText()).startsWith('30') &&
          (await dialog.getByLabel('Music mood').inputValue()) === 'Driving electronic' &&
          (await checkedRows.count()) === REEL_IDS.length + brollIds.size,
        `footage ${await checkedRows.count()} of ${REEL_IDS.length + brollIds.size} ticked`,
      );

      // ── draft, to a summary with headlines ──────────────────────────────────────────
      await dialog.getByTestId('brief-submit').click();
      const draft = await draftToSummary(page, dialog);
      if (
        !check(
          'the draft ends in a summary: A B C',
          draft.rows.map((row) => row.label).join('') === 'ABC' && !draft.failure,
          `${(draft.ms / 1000).toFixed(1)} s · ${draft.phases.join(' → ')}${draft.failure ? ` · ${draft.failure}` : ''}`,
        )
      )
        return;
      exercised.add('draft');
      check(
        'the summary shows a headline for each of the three variants',
        draft.rows.every((row) => row.headline.length > 0),
        draft.rows.map((row) => `${row.label}: "${row.headline}"`).join(' · '),
      );
      const warnings = await dialog
        .locator('p.text-amber-600')
        .allInnerTexts()
        .catch(() => [] as string[]);
      if (warnings.length > 0) note(`draft warnings: ${warnings.join(' | ')}`);

      // ── the variants, as persisted ──────────────────────────────────────────────────
      const variants = (await runOp(api, projectA, 'list_variants', {})).variants;
      for (const variant of variants) createdProjects.add(variant.projectId);
      const projects = await Promise.all(
        variants.map((variant) => getProject(api, variant.projectId)),
      );
      for (const project of projects) if (project.brief) briefIds.add(project.brief.briefId);
      // Variants holding a clip named past the Render label cap (120), and the longest name.
      const longNamed = new Map<string, number>();
      for (const project of projects) {
        const longest = Math.max(
          0,
          ...project.tracks.flatMap((track) => track.clips.map((clip) => clip.name?.length ?? 0)),
        );
        if (longest > 120) longNamed.set(project.brief?.variantLabel ?? '?', longest);
      }
      for (const project of projects) {
        const label = project.brief?.variantLabel ?? '?';
        const finish = finishOf(project, brollIds);
        const headline = draft.rows.find((row) => row.label === label)?.headline ?? '';
        check(
          `variant ${label}: ${TARGET_SEC} s ±${TOLERANCE * 100}%, a ducked music bed, the hook title at 0 (its headline), b-roll and captions`,
          Math.abs(project.durationSec - TARGET_SEC) <= TARGET_SEC * TOLERANCE &&
            Boolean(finish.bed) &&
            finish.volumeKeys >= 2 &&
            finish.hookText.length > 0 &&
            // The hook_title template sets its words in capitals.
            sameWords(finish.hookText, headline) &&
            finish.broll > 0 &&
            finish.captions.length > 0,
          `${project.durationSec.toFixed(2)} s · bed ${finish.bed ? `${finish.bed.durationSec.toFixed(1)} s` : 'none'} with ${finish.volumeKeys} volume key(s) · hook "${finish.hookText}" · ${finish.broll} b-roll · ${finish.captions.length} caption clip(s) in ${finish.captions[0]?.kind === 'caption' ? finish.captions[0].style.fontFamily : '—'}`,
        );
      }

      // ── "Open B": the finished timeline, on screen ──────────────────────────────────
      const variantB = variants.find((variant) => variant.label === 'B');
      if (!variantB) return;
      await dialog.getByRole('button', { name: 'Open B', exact: true }).click();
      const openedB = await page
        .waitForURL(new RegExp(`/studio/video/${variantB.projectId}`), { timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
      await page
        .locator(
          '[data-testid="variant-switcher"]:visible [data-variant="B"][aria-selected="true"]',
        )
        .waitFor({ timeout: 60_000 })
        .catch(() => undefined);
      const duckedLane = page.locator('[data-clip-kind="audio"]:visible svg[data-volume-line]');
      await duckedLane
        .first()
        .waitFor({ timeout: 60_000 })
        .catch(() => undefined);
      const persistedB = await getProject(api, variantB.projectId);
      const pictureClips = persistedB.tracks
        .filter((track) => track.enabled)
        .flatMap((track) => track.clips)
        .filter((clip) => clip.kind === 'video' || clip.kind === 'overlay').length;
      const shown = {
        ducked: await duckedLane.count(),
        text: await page.locator('[data-clip-kind="text"]:visible').count(),
        captions: await page.locator('[data-clip-kind="caption"]:visible').count(),
        picture: await page
          .locator('[data-clip-kind="video"]:visible, [data-clip-kind="overlay"]:visible')
          .count(),
      };
      check(
        '"Open B" shows B: a music lane with its ducking line, the hook title, captions, and every picture clip including the b-roll',
        openedB &&
          shown.ducked > 0 &&
          shown.text > 0 &&
          shown.captions > 0 &&
          shown.picture === pictureClips,
        `${new URL(page.url()).pathname} · ${JSON.stringify(shown)} · ${pictureClips} picture clip(s) persisted`,
      );

      let exportMs = Number.NaN;
      if (renderUp) {
        // ── Export all variants → TikTok ────────────────────────────────────────────────
        const exportAll = page
          .getByRole('button', { name: 'Export all variants' })
          .filter({ visible: true });
        await expect(exportAll).toBeEnabled({ timeout: 60_000 });
        await exportAll.click();
        const exportDialog = page.locator('[data-testid="video-studio-export-dialog"]:visible');
        await exportDialog.waitFor({ timeout: 30_000 });
        await exportDialog.locator('[data-testid="export-preset-tiktok"]').click();
        const startAll = exportDialog.getByTestId('export-all-start');
        await expect(startAll).toHaveText(/Export 3 variants for TikTok/, { timeout: 30_000 });
        const clicked = Date.now();
        await startAll.click();
        let rows = await exportsSettle(exportDialog);
        const firstPass = rows.map((row) => `${row.label}=${row.state}`).join(' ');
        // A failed variant retries alone, once — the product's own per-variant Retry.
        const retried = rows.filter((row) => row.state === 'failed');
        for (const row of retried) {
          note(`export ${row.label} failed first: ${row.text.slice(0, 200)}`);
          await exportDialog
            .getByRole('button', { name: `Retry ${row.label}`, exact: true })
            .click();
        }
        if (retried.length > 0) rows = await exportsSettle(exportDialog);
        exportMs = Date.now() - clicked;
        const downloads = exportDialog.getByRole('link', { name: /^Download [ABC]$/ });
        const libraryLinks = exportDialog.getByRole('link', { name: /^Open [ABC] in Library$/ });
        check(
          'a variant holding a clip named over 120 characters (the b-roll, after its Library title) still exports',
          longNamed.size > 0 &&
            [...longNamed.keys()].every(
              (label) => rows.find((row) => row.label === label)?.state === 'completed',
            ),
          [...longNamed]
            .map(
              ([label, length]) =>
                `${label}: ${length}-char clip name → ${rows.find((row) => row.label === label)?.state ?? 'no row'}`,
            )
            .join(' · ') || 'no clip named over 120 characters',
        );
        if (
          check(
            'Export all variants renders A, B and C for TikTok, each with a download and a Library link',
            rows.length === 3 &&
              rows.every((row) => row.state === 'completed') &&
              (await downloads.count()) === 3 &&
              (await libraryLinks.count()) === 3,
            `${(exportMs / 1000).toFixed(1)} s · first pass ${firstPass}${retried.length ? ` · retried ${retried.map((row) => row.label).join(',')}` : ''} · final ${rows.map((row) => `${row.label}=${row.state}`).join(' ')}`,
          )
        )
          exercised.add('export');

        // Every variant that did render is still downloaded and probed.
        for (const label of ['A', 'B', 'C']) {
          const variant = variants.find((entry) => entry.label === label);
          if (!variant || rows.find((row) => row.label === label)?.state !== 'completed') continue;
          const project = await getProject(api, variant.projectId);
          const path = join(scratch, `${label}.mp4`);
          const event = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
          await exportDialog.getByRole('link', { name: `Download ${label}`, exact: true }).click();
          const saved = await event;
          if (saved) await saved.saveAs(path);
          const probe = saved ? ffprobe(path) : null;
          check(
            `variant ${label} downloads as a file: a 1080×1920 H.264 MP4 within a frame of its ${TARGET_SEC} s timeline`,
            Boolean(saved) &&
              new URL(page.url()).pathname === `/studio/video/${variantB.projectId}` &&
              probe?.codec === 'h264' &&
              probe.width === 1080 &&
              probe.height === 1920 &&
              Math.abs(probe.videoSec - project.durationSec) <= FRAME_SEC + 1e-6 &&
              Math.abs(probe.videoSec - TARGET_SEC) <= TARGET_SEC * TOLERANCE,
            saved && probe
              ? `${saved.suggestedFilename()} · ${probeLine(probe, project.durationSec)} · audio ${probe.audio || 'none'}`
              : `no download event; page ${page.url().slice(0, 120)}`,
          );
        }
      } else note(`export steps skipped: Render ${RENDER_URL} does not answer`);

      check(
        'no uncaught page errors',
        pageErrors.length === 0,
        pageErrors.slice(0, 3).join(' | ') || 'none',
      );
      note(
        `draft ${(draft.ms / 1000).toFixed(1)} s over ${built.durationSec.toFixed(1)} s of footage; export all ${(exportMs / 1000).toFixed(1)} s`,
      );
      await context.close();
    })();
  } catch (error) {
    check(
      'bench ran to completion',
      false,
      error instanceof Error ? error.message.slice(0, 500) : String(error),
    );
  } finally {
    // ── cleanup + net zero ────────────────────────────────────────────────────────────
    try {
      for (const briefId of briefIds) {
        const { data } = await media
          .from('editor_projects')
          .select('id')
          .eq('brand_id', BRAND)
          .eq('document->brief->>briefId', briefId);
        for (const row of data ?? []) createdProjects.add((row as { id: string }).id);
      }
      const projectIds = [...createdProjects];
      // Exports: each project's render jobs name their Library results.
      for (const projectId of projectIds) {
        const { data: jobs } = await media
          .from('client_render_jobs')
          .select('result_asset_ids')
          .eq('source_id', projectId);
        for (const job of (jobs ?? []) as Array<{ result_asset_ids: string[] | null }>) {
          for (const id of job.result_asset_ids ?? []) {
            if (createdAssets.some((asset) => asset.id === id)) continue;
            const { data: row } = await media
              .from('assets')
              .select('id, storage_path')
              .eq('id', id)
              .maybeSingle();
            if (row) createdAssets.push({ id: row.id, storagePath: row.storage_path });
          }
        }
        await media.from('client_render_jobs').delete().eq('source_id', projectId);
      }
      // Anything else new on the brand that names this run's projects (the music beds).
      const ours = (text: string) =>
        text.includes(FIXTURE_FOLDER) ||
        projectIds.some((id) => text.includes(id)) ||
        createdAssets.some((asset) => text.includes(asset.id));
      const addedIds = [...(await brandAssetIds())].filter((id) => !assetsBefore.has(id));
      const addedRows =
        addedIds.length === 0
          ? []
          : ((await prodSql<{ id: string; storage_path: string; text: string }>(
              `select id::text as id, coalesce(storage_path, '') as storage_path, concat_ws(' ', file_name, storage_path, origin_ref::text) as text from media.assets where id in (${addedIds.map((id) => `'${id}'`).join(',')})`,
            )) ?? []);
      for (const row of addedRows) {
        if (ours(`${row.id} ${row.text}`) && !createdAssets.some((asset) => asset.id === row.id))
          createdAssets.push({ id: row.id, storagePath: row.storage_path });
      }
      // The transcripts the Backend keeps per footage version, for this run's footage.
      const ourVersions = await versionIdsOf([...REEL_IDS, ...createdAssets.map((a) => a.id)]);
      const removedProjects = await removeProjects(admin, BRAND, projectIds);
      const removed = await removeAssets(admin, BRAND, createdAssets);
      const jobRows =
        (await prodSql<{ job_id: string }>(
          `delete from plugin_mcp.jobs where brand_id = '${BRAND}' and (${
            draftJobs.size > 0
              ? `job_id in (${[...draftJobs].map((id) => `'${id}'`).join(',')}) or `
              : ''
          }(enqueued_at >= '${startedAt}' and (${
            projectIds.length > 0
              ? projectIds.map((id) => `params::text like '%${id}%'`).join(' or ')
              : 'false'
          }))) returning job_id`,
        )) ?? [];
      await sleep(5_000);
      const keptPrefix = `${BRAND_BUCKET}/${BRAND}/video-editor/transcripts/`;
      const addedObjects = () =>
        brandObjectNames().then((names) => [...names].filter((name) => !objectsBefore.has(name)));
      const mine = (name: string) =>
        ours(name) || (name.startsWith(keptPrefix) && ourVersions.some((id) => name.includes(id)));
      const strays = (await addedObjects()).filter(mine);
      for (const bucket of new Set(strays.map((name) => name.split('/')[0] ?? ''))) {
        await admin.storage
          .from(bucket)
          .remove(
            strays
              .filter((name) => name.startsWith(`${bucket}/`))
              .map((name) => name.slice(bucket.length + 1)),
          );
      }
      note(
        `cleanup: ${removedProjects} project(s), ${removed.rows} asset row(s), ${removed.objects} object(s), ${jobRows.length} job row(s), ${strays.length} late/kept object(s) swept`,
      );
      const leftRows = [...(await brandAssetIds())].filter(
        (id) => !assetsBefore.has(id) && createdAssets.some((asset) => asset.id === id),
      );
      const foreign = addedRows.filter((row) => !ours(`${row.id} ${row.text}`));
      if (foreign.length > 0)
        note(
          `another writer on the bench brand during this run (not this bench's): ${foreign
            .map((row) => `${row.id} ${row.text.slice(0, 80)}`)
            .join('; ')}`,
        );
      const leftObjects = (await addedObjects()).filter(mine);
      const { count: leftProjects } = await media
        .from('editor_projects')
        .select('id', { count: 'exact', head: true })
        .in('id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000']);
      const leftJobs =
        draftJobs.size === 0
          ? 0
          : ((
              await prodSql<{ count: number }>(
                `select count(*)::int as count from plugin_mcp.jobs where job_id in (${[...draftJobs].map((id) => `'${id}'`).join(',')})`,
              )
            )?.[0]?.count ?? -1);
      const { count: leftRenderJobs } = await media
        .from('client_render_jobs')
        .select('id', { count: 'exact', head: true })
        .in(
          'source_id',
          projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000'],
        );
      check(
        'net zero: no project, asset (b-roll, music bed, export), object, kept transcript, render job or draft job left from this run',
        leftRows.length === 0 &&
          leftObjects.length === 0 &&
          (leftProjects ?? 0) === 0 &&
          leftJobs === 0 &&
          (leftRenderJobs ?? 0) === 0,
        `rows ${leftRows.length}, objects ${leftObjects.length}${leftObjects.length ? ` [${leftObjects.slice(0, 4).join(', ')}]` : ''}, projects ${leftProjects ?? 0}, draft jobs ${leftJobs} of ${draftJobs.size}, render jobs ${leftRenderJobs ?? 0} · made and removed ${createdAssets.length} asset(s), ${projectIds.length} project(s)`,
      );
    } catch (error) {
      check('cleanup', false, error instanceof Error ? error.message : String(error));
    }
    if (session && previousActiveBrand && previousActiveBrand !== BRAND) {
      await admin.schema('brand_profiles').from('user_brand_preferences').upsert(
        {
          user_id: session.userId,
          active_brand_id: previousActiveBrand,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    }
    for (const server of servers.reverse()) server.stop();
    if (rec.summary().fail > 0) note(`kept the downloads for diagnosis in ${scratch}`);
    else rmSync(scratch, { recursive: true, force: true });
    const hops = { draft: 'the finished draft', export: 'Export all variants + downloads' };
    const missed = Object.entries(hops).filter(([key]) => !exercised.has(key));
    note(
      `NOT EXERCISED${missed.length ? ` (this run stopped early): ${missed.map(([, label]) => label).join(', ')};` : ':'} unticked b-roll (the pool-not-source path; this run leaves it ticked, the default), switching a Finish piece off, fit=contain, the Export dialog's own "All variants" toggle (opened from the variant switcher), the brand-caption look against the brand kit (only presence is asserted), and any Render but ${RENDER_URL}.`,
    );
  }
  const failures = printEnvelope();
  expect(failures, 'graded FAIL steps').toBe(0);
});
