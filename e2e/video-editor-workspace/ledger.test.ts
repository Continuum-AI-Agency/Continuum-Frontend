// The workspace bench's storage ledger, at $0 with no network. RED: the management-SQL ledger
// it replaces cannot run without an account-wide token. GREEN: the service-role ledger derives
// the run's paths from its rows, sees a planted control, and sees zero after cleanup. NEGATIVE:
// a ledger that lists nothing reports a vacuous zero, and the control check catches it.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { controlSeen, ownedStorage, plantControl, presentObjects, removeAssets } from './ledger';

const BRAND = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';
/** The last Frontend commit with the management-SQL ledger. */
const OLD_LEDGER_COMMIT = '25fe816a3d6bfd783ca9d453c2551f79ff71261f';

type Row = Record<string, string | null>;
const key = (bucket: string, path: string) => `${bucket}\n${path}`;

/** A service-role client over in-memory tables and storage; `blind` lists nothing. */
function fakeAdmin(tables: Record<string, Row[]>, store: Set<string>, blind = false) {
  const table = (name: string) => ({
    select: () => ({
      in: async (column: string, values: string[]) => ({
        data: (tables[name] ?? []).filter((row) => values.includes(String(row[column]))),
        error: null,
      }),
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
      for (const path of paths) store.delete(key(bucket, path));
      return { error: null };
    },
  });
  return {
    schema: () => ({ from: table }),
    storage: { from: bucketApi },
  } as unknown as SupabaseClient;
}

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
      { asset_id: ASSET, bucket: 'media-library', storage_path: `${folder}/v2/head.mp4` },
    ],
    asset_renditions: [
      { asset_id: ASSET, bucket: 'media-previews', storage_path: `${folder}/poster.jpg` },
    ],
  };
  const store = new Set([
    key('media-library', `${folder}/original.mp4`),
    key('media-library', `${folder}/thumb.jpg`),
    key('media-library', `${folder}/v2/head.mp4`),
    key('media-previews', `${folder}/poster.jpg`),
    // Written after the rows were read (a late analysis artefact): found by the folder walk.
    key('media-library', `${folder}/analysis/late.json`),
    // Not this run's: another asset on the shared brand, and another brand.
    key('media-library', `${BRAND}/33333333-3333-4333-8333-333333333333/other.mp4`),
    key('media-library', `44444444-4444-4444-8444-444444444444/${ASSET}/foreign.mp4`),
  ]);
  return { tables, store, assets: [{ id: ASSET, storagePath: `${folder}/original.mp4` }] };
}

describe('workspace storage ledger', () => {
  test('RED: the management-SQL ledger it replaces throws without the account-wide token', () => {
    const old = spawnSync(
      'git',
      ['show', `${OLD_LEDGER_COMMIT}:e2e/video-editor-workspace/ledger.ts`],
      {
        cwd: join(import.meta.dir, '../..'),
        encoding: 'utf8',
      },
    );
    if (old.status !== 0) throw new Error(`old ledger not in history: ${old.stderr}`);
    const dir = mkdtempSync(join(tmpdir(), 'old-ledger-'));
    try {
      const managementSql = join(
        import.meta.dir,
        '../../../Continuum-Backend/scripts/_bench/managementSql.ts',
      );
      writeFileSync(
        join(dir, 'ledger.ts'),
        old.stdout
          .replace(
            "'../../../Continuum-Backend/scripts/_bench/managementSql'",
            JSON.stringify(managementSql),
          )
          .replace("from 'zod'", `from ${JSON.stringify(require.resolve('zod'))}`),
      );
      writeFileSync(
        join(dir, 'run.ts'),
        `import { objectsFor } from './ledger.ts';
try { await objectsFor('${BRAND}', [{ id: '${ASSET}', storagePath: 'x' }]); console.log('no throw'); }
catch (error) { console.log(error instanceof Error ? error.message : String(error)); }`,
      );
      // No token in the environment and no \`security\` binary on PATH: the old lookup finds
      // nothing, and the real keychain is never read.
      const run = spawnSync(process.execPath, [join(dir, 'run.ts')], {
        encoding: 'utf8',
        env: {
          NODE_ENV: 'test',
          PATH: dirname(process.execPath),
          HOME: dir,
          SUPABASE_URL: 'https://fakeref.supabase.co',
        },
      });
      expect(run.stdout).toContain('needs the Supabase management token');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(readFileSync(join(import.meta.dir, 'ledger.ts'), 'utf8')).not.toContain('managementSql');
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
      ].sort(),
    );
    const control = await plantControl(admin, BRAND, ledger, 'run1');
    expect(await controlSeen(admin, ledger, control)).toBe(true);
    const removed = await removeAssets(admin, BRAND, assets, ledger);
    expect(removed).toEqual({ objects: 6, rows: 1, receiptsLeftFor: [ASSET] });
    expect(await presentObjects(admin, ledger)).toEqual([]);
    expect(await controlSeen(admin, ledger, control)).toBe(false);
    // Nothing that is not this run's was touched.
    expect([...store].sort()).toEqual(
      [
        key('media-library', `${BRAND}/33333333-3333-4333-8333-333333333333/other.mp4`),
        key('media-library', `44444444-4444-4444-8444-444444444444/${ASSET}/foreign.mp4`),
      ].sort(),
    );
  });

  test('NEGATIVE: a ledger that lists nothing reports a vacuous zero and fails the control', async () => {
    const { tables, store, assets } = world();
    const blind = fakeAdmin(tables, store, true);
    const ledger = await ownedStorage(blind, BRAND, assets);
    expect(await presentObjects(blind, ledger)).toEqual([]);
    const control = await plantControl(blind, BRAND, ledger, 'run1');
    expect(store.has(key(control.bucket, control.path))).toBe(true);
    expect(await controlSeen(blind, ledger, control)).toBe(false);
  });
});
