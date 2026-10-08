// The video-editor benches' storage ledger, at $0 with no network. RED: the management-SQL ledger
// it replaces needed an account-wide token, and no video-editor e2e file may reach for one now
// (owner rule: these benches run on a client holding only the service-role key). GREEN: the service-role ledger derives
// the run's paths from its rows (the kept Brief transcript included), sees a planted control, and
// sees zero after cleanup. NEGATIVE: a ledger that lists nothing reports a vacuous zero, and the
// control check catches it — proveNetZero grades that zero FAIL, never PASS. Register receipts and
// job rows are swept by the run's ids and grade FAIL by any id the sweep (or get_job) still finds.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AI_STUDIO_BUCKET,
  controlSeen,
  jobRows,
  keptTranscript,
  ownedStorage,
  plantControl,
  presentObjects,
  proveNetZero,
  receiptRows,
  removeAssets,
  unkeptTranscripts,
} from './ledger';

const BRAND = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';
const VERSION = '55555555-5555-4555-8555-555555555555';
const PROJECT = '88888888-8888-4888-8888-888888888888';
const JOB = `job_${'a'.repeat(32)}`;
const GONE_JOB = `job_${'b'.repeat(32)}`;
const BENCH = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
/** A read-only source version, its transcript kept before the run, and one the run first hears. */
const KEPT_BEFORE = '66666666-6666-4666-8666-666666666666';
const HEARD_NOW = '77777777-7777-4777-8777-777777777777';
/** The last Frontend commit with the management-SQL ledger. */
const OLD_LEDGER_COMMIT = '25fe816a3d6bfd783ca9d453c2551f79ff71261f';

type Row = Record<string, string | null>;

/** Files that name the management-SQL helper, the token, or the Management API. */
const tokenReaders = (sources: readonly { path: string; text: string }[]) =>
  sources
    .filter(({ text }) =>
      /managementSql|prodSql|SUPABASE_ACCESS_TOKEN|api\.supabase\.com\/v1\/projects/.test(text),
    )
    .map(({ path }) => path);
const key = (bucket: string, path: string) => `${bucket}\n${path}`;

type SweepArgs = { p_brand_id: string; p_receipt_asset_ids: string[]; p_job_ids: string[] };

/**
 * A service-role client over in-memory tables and storage; `blind` lists nothing, `stuck` paths
 * survive a remove, `jobs` are the plugin_mcp.jobs ids get_job finds. The bench sweep deletes
 * every listed id except `kept` ones; `foreign` jobs it cannot see (another brand) but get_job
 * still finds; `sweepDown` fails the call; `swept` records every call.
 */
function fakeAdmin(
  tables: Record<string, Row[]>,
  store: Set<string>,
  {
    blind = false,
    stuck = [] as string[],
    jobs = [] as string[],
    kept = [] as string[],
    foreign = [] as string[],
    sweepDown = false,
    swept = [] as SweepArgs[],
  } = {},
) {
  const table = (name: string) => ({
    select: (_columns: string, options: { head?: boolean } = {}) => ({
      in: async (column: string, values: string[]) => {
        const rows = (tables[name] ?? []).filter((row) => values.includes(String(row[column])));
        return options.head ? { count: rows.length, error: null } : { data: rows, error: null };
      },
    }),
    delete: () => {
      const filters: Array<(row: Row) => boolean> = [];
      const query = {
        eq: (column: string, value: string) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        in: async (column: string, values: string[]) => {
          filters.push((row) => values.includes(String(row[column])));
          const before = tables[name]?.length ?? 0;
          tables[name] = (tables[name] ?? []).filter((row) => !filters.every((f) => f(row)));
          return { error: null, count: before - (tables[name]?.length ?? 0) };
        },
      };
      return query;
    },
  });
  const bucketApi = (bucket: string) => ({
    list: async (folder: string, options: { search?: string } = {}) => {
      if (blind) return { data: [], error: null };
      const children = new Map<string, { name: string; id: string | null }>();
      for (const entry of store) {
        const [b, path] = entry.split('\n') as [string, string];
        if (b !== bucket || !path.startsWith(`${folder}/`)) continue;
        const [head, ...rest] = path.slice(folder.length + 1).split('/');
        if (!head) continue;
        children.set(head, { name: head, id: rest.length === 0 ? `obj-${head}` : null });
      }
      const data = [...children.values()].filter(
        (entry) => !options.search || entry.name.includes(options.search),
      );
      return { data, error: null };
    },
    upload: async (path: string) => {
      store.add(key(bucket, path));
      return { error: null };
    },
    remove: async (paths: string[]) => {
      for (const path of paths) if (!stuck.includes(path)) store.delete(key(bucket, path));
      return { error: null };
    },
  });
  const sweep = (args: SweepArgs) => {
    swept.push(args);
    if (sweepDown) return { data: null, error: { message: 'Could not find the function' } };
    const ids = [...args.p_receipt_asset_ids, ...args.p_job_ids].filter(
      (id) => !foreign.includes(id),
    );
    jobs = jobs.filter((id) => kept.includes(id) || !ids.includes(id));
    const row = (id: string) => ({
      id,
      deleted: kept.includes(id) ? 0 : 1,
      remaining: kept.includes(id) ? 1 : 0,
    });
    return { data: ids.map(row), error: null };
  };
  const rpc = async (name: string, args: { p_job_id: string } & SweepArgs) => {
    if (name === 'sweep_video_bench_leftovers') return sweep(args);
    return name === 'get_job' && jobs.includes(args.p_job_id)
      ? { data: { job_id: args.p_job_id }, error: null }
      : { data: null, error: { code: 'P0002', message: 'NOT_FOUND' } };
  };
  return {
    schema: () => ({ from: table, rpc }),
    storage: { from: bucketApi },
  } as unknown as SupabaseClient;
}

/** What is never this run's: another asset on the shared brand, another brand, a kept transcript. */
const FOREIGN = [
  key('media-library', `${BRAND}/33333333-3333-4333-8333-333333333333/other.mp4`),
  key('media-library', `44444444-4444-4444-8444-444444444444/${ASSET}/foreign.mp4`),
  key(AI_STUDIO_BUCKET, `${BRAND}/video-editor/transcripts/${KEPT_BEFORE}.json`),
].sort();

function world() {
  const folder = `${BRAND}/${ASSET}`;
  const tables: Record<string, Row[]> = {
    assets: [
      {
        id: ASSET,
        brand_id: BRAND,
        bucket: 'media-library',
        storage_path: `${folder}/original.mp4`,
        thumbnail_path: `${folder}/thumb.jpg`,
      },
    ],
    asset_versions: [
      {
        id: VERSION,
        asset_id: ASSET,
        bucket: 'media-library',
        storage_path: `${folder}/v2/head.mp4`,
      },
    ],
    editor_projects: [{ id: PROJECT, brand_id: BRAND }],
    asset_renditions: [
      { asset_id: ASSET, bucket: 'media-previews', storage_path: `${folder}/poster.jpg` },
    ],
  };
  const store = new Set([
    key('media-library', `${folder}/original.mp4`),
    key('media-library', `${folder}/thumb.jpg`),
    key('media-library', `${folder}/v2/head.mp4`),
    key('media-previews', `${folder}/poster.jpg`),
    // The Brief kept the drop's words by version, outside the asset folder.
    key(AI_STUDIO_BUCKET, `${BRAND}/video-editor/transcripts/${VERSION}.json`),
    // A read-only source's words, kept before the run: never this run's.
    key(AI_STUDIO_BUCKET, `${BRAND}/video-editor/transcripts/${KEPT_BEFORE}.json`),
    // Written after the rows were read (a late analysis artefact): found by the folder walk.
    key('media-library', `${folder}/analysis/late.json`),
    // Not this run's: another asset on the shared brand, and another brand.
    key('media-library', `${BRAND}/33333333-3333-4333-8333-333333333333/other.mp4`),
    key('media-library', `44444444-4444-4444-8444-444444444444/${ASSET}/foreign.mp4`),
  ]);
  return { tables, store, assets: [{ id: ASSET, storagePath: `${folder}/original.mp4` }] };
}

describe('workspace storage ledger', () => {
  test('RED: the management-SQL ledger it replaces needed the account-wide token', () => {
    const old = spawnSync(
      'git',
      ['show', `${OLD_LEDGER_COMMIT}:e2e/video-editor-workspace/ledger.ts`],
      { cwd: join(import.meta.dir, '../..'), encoding: 'utf8' },
    );
    if (old.status !== 0) throw new Error(`old ledger not in history: ${old.stderr}`);
    expect(tokenReaders([{ path: 'old/ledger.ts', text: old.stdout }])).toEqual(['old/ledger.ts']);
  });

  test('owner rule: no video-editor e2e file reaches for the management token', () => {
    const e2e = join(import.meta.dir, '..');
    const sources = readdirSync(e2e, { recursive: true, encoding: 'utf8' })
      .filter((file) => /^video-editor[^/]*(\/|\.spec\.ts$)/.test(file) && /\.tsx?$/.test(file))
      .map((file) => ({ path: file, text: readFileSync(join(e2e, file), 'utf8') }))
      // This file names what it forbids.
      .filter(
        (source) => !join(e2e, source.path).endsWith('video-editor-workspace/ledger.test.ts'),
      );
    expect(sources.map((source) => source.path)).toContain('video-editor-first-cut.spec.ts');
    expect(tokenReaders(sources)).toEqual([]);
  });

  test('GREEN: owned paths and late folder contents are seen, a planted control too, then zero', async () => {
    const { tables, store, assets } = world();
    const admin = fakeAdmin(tables, store);
    const ledger = await ownedStorage(admin, BRAND, assets);
    const present = (await presentObjects(admin, ledger))
      .map((o) => `${o.bucket}/${o.path}`)
      .sort();
    expect(present).toEqual(
      [
        `media-library/${BRAND}/${ASSET}/analysis/late.json`,
        `media-library/${BRAND}/${ASSET}/original.mp4`,
        `media-library/${BRAND}/${ASSET}/thumb.jpg`,
        `media-library/${BRAND}/${ASSET}/v2/head.mp4`,
        `media-previews/${BRAND}/${ASSET}/poster.jpg`,
        `${AI_STUDIO_BUCKET}/${BRAND}/video-editor/transcripts/${VERSION}.json`,
      ].sort(),
    );
    const control = await plantControl(admin, BRAND, ledger, 'run1');
    expect(await controlSeen(admin, ledger, control)).toBe(true);
    const removed = await removeAssets(admin, BRAND, assets, ledger);
    expect(removed).toEqual({ objects: 7, rows: 1, receiptsLeftFor: [ASSET] });
    expect(await presentObjects(admin, ledger)).toEqual([]);
    expect(await controlSeen(admin, ledger, control)).toBe(false);
    // Nothing that is not this run's was touched.
    expect([...store].sort()).toEqual(FOREIGN);
  });

  test('kept Brief transcripts: an owned version is owned; a read-only one only if the run kept it', async () => {
    const { tables, store, assets } = world();
    const admin = fakeAdmin(tables, store);
    // Baseline, before the Brief hears the read-only sources.
    const unkept = await unkeptTranscripts(admin, BRAND, [KEPT_BEFORE, HEARD_NOW]);
    expect(unkept).toEqual([keptTranscript(BRAND, HEARD_NOW)]);
    // The Brief keeps the words of the source it heard for the first time.
    store.add(key(AI_STUDIO_BUCKET, `${BRAND}/video-editor/transcripts/${HEARD_NOW}.json`));
    const ledger = await ownedStorage(admin, BRAND, assets);
    ledger.objects.push(...unkept);
    const transcripts = (await presentObjects(admin, ledger))
      .filter((object) => object.path.includes('/transcripts/'))
      .map((object) => object.path)
      .sort();
    expect(transcripts).toEqual(
      [
        `${BRAND}/video-editor/transcripts/${VERSION}.json`,
        `${BRAND}/video-editor/transcripts/${HEARD_NOW}.json`,
      ].sort(),
    );
    await removeAssets(admin, BRAND, assets, ledger);
    expect([...store].sort()).toEqual(FOREIGN);
  });

  test('proveNetZero GREEN: control seen, zero left by id, receipts swept by owned asset id', async () => {
    const { tables, store, assets } = world();
    const swept: SweepArgs[] = [];
    const admin = fakeAdmin(tables, store, { swept });
    const ledger = await ownedStorage(admin, BRAND, assets);
    const { steps, notes } = await proveNetZero(admin, BRAND, {
      id: 'run1',
      ledger,
      assets,
      projects: [PROJECT],
      settleMs: 0,
    });
    expect(steps.map((step) => step.grade)).toEqual(['PASS', 'PASS', 'PASS', 'PASS']);
    expect(steps[2]?.detail).toBe('rows 0 of 1, objects 0, projects 0 of 1');
    expect(steps[3]?.detail).toBe('1 deleted by asset id; none left of 1');
    expect(swept).toEqual([{ p_brand_id: BRAND, p_receipt_asset_ids: [ASSET], p_job_ids: [] }]);
    expect(notes.join('\n')).toContain('1 asset row(s)');
    expect(tables.assets).toEqual([]);
    expect(tables.editor_projects).toEqual([]);
    expect([...store].sort()).toEqual(FOREIGN);
  });

  test('proveNetZero RED: an owned object that survives cleanup fails net zero, by path', async () => {
    const { tables, store, assets } = world();
    const transcript = `${BRAND}/video-editor/transcripts/${VERSION}.json`;
    const admin = fakeAdmin(tables, store, { stuck: [transcript] });
    const ledger = await ownedStorage(admin, BRAND, assets);
    const { steps } = await proveNetZero(admin, BRAND, { id: 'run1', ledger, assets, settleMs: 0 });
    expect(steps.map((step) => step.grade)).toEqual(['PASS', 'FAIL', 'FAIL', 'PASS']);
    expect(steps[1]?.detail).toContain(`${AI_STUDIO_BUCKET}/${transcript}`);
  });

  test('proveNetZero NEGATIVE: a blind ledger never PASSes its zero', async () => {
    const { tables, store, assets } = world();
    const blind = fakeAdmin(tables, store, { blind: true });
    const ledger = await ownedStorage(blind, BRAND, assets);
    const { steps } = await proveNetZero(blind, BRAND, { id: 'run1', ledger, assets, settleMs: 0 });
    expect(steps.map((step) => step.grade)).toEqual(['FAIL', 'FAIL', 'FAIL', 'PASS']);
    expect(steps[2]?.detail).toContain('VACUOUS');
  });

  test('register receipts: PASS when the sweep leaves none, FAIL naming each id it leaves', async () => {
    const kept = await receiptRows(fakeAdmin({}, new Set(), { kept: [ASSET] }), BRAND, [ASSET]);
    expect(kept).toEqual({
      step: 'net zero: register receipts',
      grade: 'FAIL',
      detail: `left by asset id: ${ASSET} (1 of 1)`,
    });
    const down = await receiptRows(fakeAdmin({}, new Set(), { sweepDown: true }), BRAND, [ASSET]);
    expect(down.grade).toBe('FAIL');
    expect(down.detail).toContain(`left by asset id: ${ASSET} (1 of 1); sweep failed: Could not`);
    const none = await receiptRows(fakeAdmin({}, new Set()), BRAND, []);
    expect(none.grade).toBe('SKIP');
  });

  test('job rows: swept by id on the bench brand, PASS only when neither the sweep nor get_job finds one', async () => {
    const swept: SweepArgs[] = [];
    const gone = await jobRows(fakeAdmin({}, new Set(), { jobs: [JOB], swept }), BRAND, [
      JOB,
      GONE_JOB,
    ]);
    expect(gone).toEqual({
      step: 'net zero: job rows',
      grade: 'PASS',
      detail: '2 deleted by job id; none left of 2 this run started',
    });
    expect(swept).toEqual([
      { p_brand_id: BENCH, p_receipt_asset_ids: [], p_job_ids: [JOB, GONE_JOB] },
    ]);
    // The sweep cannot see a job on another brand; get_job still finds it, so it is left.
    const foreign = await jobRows(
      fakeAdmin({}, new Set(), { jobs: [JOB], foreign: [JOB] }),
      BRAND,
      [JOB],
    );
    expect(foreign.grade).toBe('FAIL');
    expect(foreign.detail).toBe(`left by job id: ${JOB} (1 of 1 this run started)`);
    const kept = await jobRows(fakeAdmin({}, new Set(), { jobs: [JOB], kept: [JOB] }), BRAND, [
      JOB,
    ]);
    expect(kept.grade).toBe('FAIL');
    const down = await jobRows(fakeAdmin({}, new Set(), { sweepDown: true }), BRAND, [JOB]);
    expect(down.detail).toContain('sweep failed: Could not find the function');
    expect((await jobRows(fakeAdmin({}, new Set()), BRAND, [])).grade).toBe('SKIP');
    await expect(jobRows(fakeAdmin({}, new Set()), BRAND, ["job_x' or 1=1"])).rejects.toThrow(
      'not a job id',
    );
  });

  test('NEGATIVE: a ledger that lists nothing reports a vacuous zero and fails the control', async () => {
    const { tables, store, assets } = world();
    const blind = fakeAdmin(tables, store, { blind: true });
    const ledger = await ownedStorage(blind, BRAND, assets);
    expect(await presentObjects(blind, ledger)).toEqual([]);
    const control = await plantControl(blind, BRAND, ledger, 'run1');
    expect(store.has(key(control.bucket, control.path))).toBe(true);
    expect(await controlSeen(blind, ledger, control)).toBe(false);
  });
});
