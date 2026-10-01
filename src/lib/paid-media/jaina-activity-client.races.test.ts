import { beforeEach, expect, it, mock } from 'bun:test';
let parents: (Record<string, unknown> | null)[], versions: Record<string, unknown>[][];
const filters: [string, string, unknown][] = [], trees: string[] = [];
mock.module('@/lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ schema: () => ({ from: (table: string) => {
  const result = () => ({ data: table === 'paid_scaffolds' ? parents.shift() : table === 'paid_scaffold_versions' ? versions.shift() : [], error: null });
  const q = { select: () => q, eq: (field: string, value: unknown) => { filters.push([table, field, value]); return q; }, is: () => q, order: () => q,
    maybeSingle: async () => result(), then: (yes: (value: unknown) => unknown, no: (reason: unknown) => unknown) => Promise.resolve(result()).then(yes, no) };
  return q;
} }) }) }));
mock.module('@/lib/library/commentAuthors', () => ({ fetchBrandAuthors: async () => [] }));
mock.module('@/lib/library/comments', () => ({ displayNameFromEmail: () => 'Reader' }));
mock.module('@/lib/paid-media/scaffold-tree-client', () => ({ fetchPaidScaffoldTreeRows: async ({ scaffoldVersionId }: { scaffoldVersionId: string }) => { trees.push(scaffoldVersionId); return { versionId: scaffoldVersionId, rows: [] }; } }));
const { fetchCanvasScaffoldRead } = await import('./jaina-activity-client');
const parent = (pointer: string | null = 'v2') => ({ id: 'scaffold', name: 'Current', ad_account_id: 'act_current', current_version_id: pointer, created_at: '' });
const version = (id: string) => ({ id, version: 2, lifecycle: 'proposed', created_at: '' });
const request = { brandId: 'brand', scaffold: { id: 'scaffold', name: 'Old', adAccountId: 'act_old', currentVersionId: 'v1', createdAt: '' } };
beforeEach(() => { parents = [parent(), parent()]; versions = [[version('v2'), version('v1')]]; filters.length = 0; trees.length = 0; });
it('refreshes the parent under the requested brand and follows its current pointer', async () => {
  const read = await fetchCanvasScaffoldRead(request);
  expect(read.version.id).toBe('v2'); expect(read.scaffold.adAccountId).toBe('act_current'); expect(trees).toEqual(['v2']);
  expect(filters.filter(([table, field]) => table === 'paid_scaffolds' && field === 'brand_id')).toEqual([['paid_scaffolds', 'brand_id', 'brand'], ['paid_scaffolds', 'brand_id', 'brand']]);
});
it('refreshes the version list once when the parent advanced during the first read', async () => {
  versions = [[version('v1')], [version('v2'), version('v1')]];
  expect((await fetchCanvasScaffoldRead(request)).version.id).toBe('v2'); expect(versions.length).toBe(0);
});
it('a non-null missing pointer refuses instead of falling back to an older version', async () => {
  versions = [[version('v1')], [version('v1')]];
  const error = await fetchCanvasScaffoldRead(request).catch((e) => e);
  expect(error.message).toContain('no current version'); expect(trees).toEqual([]);
});
it('only a null pointer can fall back to the newest version', async () => {
  parents = [parent(null), parent(null)];
  expect((await fetchCanvasScaffoldRead(request)).version.id).toBe('v2');
});
it('deleted or inaccessible parents refuse before tree reads', async () => {
  parents = [null]; const error = await fetchCanvasScaffoldRead(request).catch((e) => e);
  expect(error.message).toContain('unavailable for this brand'); expect(trees).toEqual([]);
});
it('a pointer advancing while the tree loads cannot return a stale graph', async () => {
  parents = [parent(), parent('v3')]; const error = await fetchCanvasScaffoldRead(request).catch((e) => e);
  expect(error.message).toContain('changed while loading');
});
