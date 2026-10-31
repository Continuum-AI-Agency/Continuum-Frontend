import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type { TemplateOperation, TemplateRevision, TemplateRevisionVariant } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  chooseOption,
  installPickerDomGlobals,
  openSelect,
} from '@/components/automations/workspace/pickers/pickerTestHarness';
import {
  VersioningIntentJournal,
  type VersioningIntentRecord,
  type VersioningIntentStorage,
} from './versioningIntent';

installPickerDomGlobals();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const brandId = id(1),
  assetId = id(2),
  versionId = id(3),
  userId = id(4);
const rows = new Map<string, VersioningIntentRecord>();
const storage: VersioningIntentStorage = {
  async change(key, update) {
    const record = structuredClone(rows.get(key) ?? { attempts: [] });
    const result = update(record);
    rows.set(key, record);
    return result;
  },
};
mock.module('./versioningIntent', () => ({
  VersioningIntentJournal: class extends VersioningIntentJournal {
    constructor(user: string, brand: string, family: string) {
      super(user, brand, family, storage);
    }
  },
}));
const revision = (n: number, variantId: string, parent: string | null): TemplateRevision => ({
  id: id(n),
  variantId,
  templateId: assetId,
  number: n,
  parentRevisionId: parent,
  sourceAssetId: assetId,
  sourceVersionId: versionId,
  checksum: 'a'.repeat(64),
  edits: { layers: [], slots: [], orders: [] },
  createdAt: '2026-10-31T00:00:00Z',
  createdBy: userId,
  nativeCommitId: null,
  dependencies: null,
  source: {
    assetId,
    brandId,
    versionId,
    family: 'after_effects_package',
    parseState: 'parsed',
    parser: null,
    parse: null,
    fonts: [],
    ratios: [],
    slotCount: 0,
    forgeRunId: null,
    forgeState: null,
    templateKey: null,
    displayName: 'Campaign',
    parseError: null,
    parsedAt: null,
    createdAt: '',
    updatedAt: null,
  },
  publications: [
    { bindingId: id(90), templateKey: 'campaign', workspace: 'Test', contractHash: 'abc' },
  ],
});
const original = revision(10, id(20), null),
  tall = revision(11, id(21), original.id),
  tallHead = revision(12, id(21), tall.id),
  copy = revision(13, id(22), original.id);
const variants: TemplateRevisionVariant[] = [
  {
    templateId: assetId,
    variantId: id(20),
    name: 'Original',
    original: true,
    parentRevisionId: null,
    draftHeadRevisionId: original.id,
    publishedHeadRevisionId: null,
    archivedAt: null,
    tags: [],
    sourceKind: 'after_effects',
    revisions: [original],
  },
  {
    templateId: assetId,
    variantId: id(21),
    name: 'Tall',
    original: false,
    parentRevisionId: original.id,
    draftHeadRevisionId: tallHead.id,
    publishedHeadRevisionId: tall.id,
    archivedAt: null,
    tags: [],
    sourceKind: 'after_effects',
    revisions: [tall, tallHead],
  },
  {
    templateId: assetId,
    variantId: id(22),
    name: 'Copy',
    original: false,
    parentRevisionId: original.id,
    draftHeadRevisionId: copy.id,
    publishedHeadRevisionId: null,
    archivedAt: null,
    tags: [],
    sourceKind: 'after_effects',
    revisions: [copy],
  },
];
let currentUser = userId;
mock.module('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: currentUser }, isLoading: false }) }));
const history = mock(async (_brand: string, _asset: string, _query?: { cursor?: string }, _user?: string, _signal?: AbortSignal): Promise<{ items: TemplateOperation[]; nextCursor: string | null }> => ({ items: [], nextCursor: null }));
let failBranch = false;
const branch = mock(async (_asset: string, _body: unknown, _user?: string) => {
  if (failBranch) throw new Error('Response lost');
  return { replayed: false, revision: { ...tall, id: id(30), variantId: id(31) } };
});
const diff = mock(
  async (_asset: string, body: { fromRevisionId: string; toRevisionId: string }) => ({
    ...body,
    sourceChanged: false,
    changes: [{ path: '/layers/1:2/opacity', from: 50, to: 75 }],
  }),
);
const mergePreview = mock(async () => ({
  baseRevisionId: original.id,
  headRevisionId: tallHead.id,
  sourceHeadRevisionId: copy.id,
  previewToken: 'a'.repeat(64),
  edits: original.edits,
  conflicts: [{ path: '/layers/1:2/opacity', kind: 'field', base: 100, ours: 50, theirs: 75 }],
}));
const merge = mock(async (_asset: string, _body: unknown) => ({
  replayed: false,
  revision: tallHead,
}));
const restore = mock(async (_asset: string, _body: unknown) => ({
  replayed: false,
  revision: tallHead,
}));
const release = mock(async (_asset: string, _body: unknown) => ({}));
const rollback = mock(async (_asset: string, _body: unknown) => ({}));
mock.module('@/lib/library/templateSources', () => ({
  fetchTemplateAuthoringUserId: async () => currentUser,
  fetchTemplateVersionCapabilities: async () => ({
    family: 'after_effects_package',
    branch: true,
    diff: true,
    merge: true,
    revert: true,
    release: true,
    pinnedRender: true,
    reasons: {},
  }),
  fetchTemplateVersionCommits: async () => ({
    items: [
      {
        revisionId: tallHead.id,
        message: 'Adjust layout',
        kind: 'merge',
        mergeParentRevisionId: copy.id,
      },
    ],
  }),
  fetchTemplateVersionHistory: history,
  fetchTemplateReleases: async () => ({
    items: [
      {
        id: id(60),
        revisionId: tall.id,
        templateId: assetId,
        variantId: tall.variantId,
        bindingId: id(90),
        templateKey: 'campaign',
        manifest: { package: 'verified' },
        createdAt: '',
        createdBy: userId,
      },
    ],
    heads: [{ bindingId: id(90), templateKey: 'campaign', releaseId: id(61) }],
  }),
  branchTemplateVersion: branch,
  diffTemplateVersions: diff,
  previewTemplateMerge: mergePreview,
  commitTemplateMerge: merge,
  revertTemplateVersion: restore,
  promoteTemplateRelease: release,
  rollbackTemplateRelease: rollback,
}));
const { VersionControlPanel } = await import('./VersionControlPanel');
const mounted = (selectedId?: string, items = variants) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onOpenRevision = mock(() => undefined);
  const node = (data = items, selectedBrand = brandId) => (
    <QueryClientProvider client={client}>
      <VersionControlPanel
        brandId={selectedBrand}
        assetId={assetId}
        versionId={versionId}
        variants={data}
        revisionId={selectedId}
        onOpenRevision={onOpenRevision}
      />
    </QueryClientProvider>
  );
  return { ...render(node()), node, onOpenRevision };
};
beforeEach(() => {
  rows.clear();
  currentUser = userId;
  failBranch = false;
  history.mockReset();
  history.mockImplementation(async () => ({ items: [], nextCursor: null }));
  for (const fn of [branch, diff, mergePreview, merge, restore, release, rollback]) fn.mockClear();
});
afterEach(cleanup);

test('reused source bytes require exact variant selection, then historical inspection remains read-only', async () => {
  const view = mounted();
  expect(screen.getByText(/file alone does not identify/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Tall Variant' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Open exact revision' }).hasAttribute('disabled'),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Inspect revision 11' }));
  expect(screen.getByText('Read-only revision')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open exact revision' }));
  expect(view.onOpenRevision).toHaveBeenCalledWith(tall);
  expect(screen.getByText(/Merged from/)).toBeTruthy();
});
test('branch freezes the selected historical revision; failed response retries the same intent after remount', async () => {
  failBranch = true;
  const view = mounted(tall.id);
  await waitFor(() =>
    expect(screen.getByLabelText('New variant name').hasAttribute('disabled')).toBe(false),
  );
  fireEvent.change(screen.getByLabelText('New variant name'), {
    target: { value: 'Tall alternative' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Branch from revision 11' }));
  await waitFor(() => expect(branch).toHaveBeenCalledTimes(1));
  await screen.findByText('Response lost');
  const request = branch.mock.calls[0]![1];
  expect(request).toMatchObject({ parentRevisionId: tall.id, name: 'Tall alternative', brandId });
  view.unmount();
  failBranch = false;
  mounted(copy.id);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry pending request' }));
  await waitFor(() => expect(branch).toHaveBeenCalledTimes(2));
  expect(branch.mock.calls[1]).toEqual(branch.mock.calls[0]);
  expect(release).not.toHaveBeenCalled();
});
test('merge resolves every conflict and pins both reviewed heads; a refreshed head invalidates preview', async () => {
  const view = mounted(tallHead.id);
  fireEvent.click(screen.getByRole('button', { name: 'Merge', exact: true }));
  openSelect('Source variant head');
  chooseOption('Copy · Revision 13');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Preview merge' }).hasAttribute('disabled')).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Preview merge' }));
  const commit = await screen.findByRole('button', { name: 'Commit reviewed merge' });
  expect(commit.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Take Copy' }));
  expect(commit.hasAttribute('disabled')).toBe(false);
  const advanced = variants.map((item) =>
    item.variantId === tall.variantId ? { ...item, draftHeadRevisionId: id(77) } : item,
  );
  view.rerender(view.node(advanced));
  expect(
    screen.getByRole('button', { name: 'Commit reviewed merge' }).hasAttribute('disabled'),
  ).toBe(true);
  expect(merge).not.toHaveBeenCalled();
  view.rerender(view.node());
  fireEvent.click(screen.getByRole('button', { name: 'Commit reviewed merge' }));
  await waitFor(() => expect(merge).toHaveBeenCalledTimes(1));
  expect(merge.mock.calls[0]![1]).toMatchObject({
    expectedHeadRevisionId: tallHead.id,
    expectedSourceHeadRevisionId: copy.id,
    previewToken: 'a'.repeat(64),
    resolutions: [{ path: '/layers/1:2/opacity', choice: 'theirs' }],
  });
});
test('restoration compares against the destination head and appends only after explicit confirmation', async () => {
  mounted(tallHead.id);
  fireEvent.click(screen.getByRole('button', { name: 'Compare / restore' }));
  openSelect('Revision to compare');
  chooseOption('Tall · Revision 11');
  const review = screen.getByRole('button', { name: 'Review restoration onto Tall' });
  await waitFor(() => expect(review.hasAttribute('disabled')).toBe(false));
  fireEvent.click(review);
  expect(await screen.findByText('Before: 50')).toBeTruthy();
  expect(screen.getByText('After: 75')).toBeTruthy();
  expect(restore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Append restored revision' }));
  await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
  expect(diff.mock.calls[0]![1]).toEqual({
    brandId,
    fromRevisionId: tallHead.id,
    toRevisionId: tall.id,
  });
  expect(restore.mock.calls[0]![1]).toMatchObject({
    restoreRevisionId: tall.id,
    variantId: tall.variantId,
    expectedHeadRevisionId: tallHead.id,
  });
});
test('production changes require review and carry the exact expected release independently of branch selection', async () => {
  mounted(tallHead.id);
  fireEvent.click(screen.getByRole('button', { name: 'Releases', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: 'Review rollback' }));
  expect(rollback).not.toHaveBeenCalled();
  const confirm = screen.getByRole('button', { name: 'Confirm release rollback' });
  await waitFor(() => expect(confirm.hasAttribute('disabled')).toBe(false));
  fireEvent.click(confirm);
  await waitFor(() => expect(rollback).toHaveBeenCalledTimes(1));
  expect(rollback.mock.calls[0]![1]).toMatchObject({
    releaseId: id(60),
    expectedReleaseId: id(61),
    bindingId: id(90),
    templateKey: 'campaign',
  });
  expect(release).not.toHaveBeenCalled();
});


const event = (sequence: number, stream = id(101)): TemplateOperation => ({
  id: id(1000 + (stream === id(101) ? sequence : 1000 + sequence)), workingCopyId: stream, sequence,
  command: `Edit ${stream === id(101) ? 'A' : 'B'} ${sequence}`, baseRevisionId: tall.id,
  principalId: userId, channel: 'forge', outcome: 'succeeded', affectedObjects: ['aep:1:2'], changes: { sequence },
  evidence: 'recorded', causedBy: sequence > 1 ? [id(1000 + sequence - 1)] : [], revisionId: null, revisionIds: [], receivedAt: '2026-10-31T00:00:00Z',
});

test('history reads beyond100 events, retains pages through retry, and separates ordered streams at a page boundary', async () => {
  const first = Array.from({ length: 100 }, (_, i) => event(i + 1));
  const second = [event(100), event(101), { ...event(1, id(102)), causedBy: [event(101).id] }, event(2, id(102))];
  history.mockImplementation(async (_brand, _asset, query) => {
    if (!query?.cursor) return { items: first, nextCursor: 'opaque-page-2' };
    if (history.mock.calls.filter((args) => args[2]?.cursor).length === 1) throw new Error('Connection interrupted');
    return { items: second, nextCursor: null };
  });
  mounted(tallHead.id);
  fireEvent.click(screen.getByRole('button', { name: 'Operations' }));
  expect(await screen.findByText(/Edit A100|Edit A 100/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Load more operations' }));
  await screen.findByText('Connection interrupted');
  expect(screen.getByText(/Edit A100|Edit A 100/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry operation history' }));
  await screen.findByText(/Edit B2|Edit B 2/);
  const a = within(screen.getByRole('list', { name: `Operations for working copy ${id(101)}` }));
  const b = within(screen.getByRole('list', { name: `Operations for working copy ${id(102)}` }));
  expect(a.getAllByRole('listitem')).toHaveLength(101);
  expect(b.getAllByRole('listitem')).toHaveLength(2);
  expect(a.getAllByRole('listitem').at(-1)?.textContent).toContain('#101');
  expect(b.getAllByRole('listitem')[0]?.textContent).toContain(event(101).id);
  expect(history.mock.calls[2]?.[2]).toMatchObject({ cursor: 'opaque-page-2' });
  expect(screen.getByText('End of loaded history; refresh for new arrivals.')).toBeTruthy();
});

test('explicit history refresh starts without a cursor, reconciles new arrivals and preserves previously read events', async () => {
  history.mockResolvedValueOnce({ items: [event(2)], nextCursor: 'old-continuation' });
  const view = mounted(tallHead.id);
  fireEvent.click(screen.getByRole('button', { name: 'Operations' }));
  await screen.findByText(/Edit A 2/);
  history.mockResolvedValueOnce({ items: [event(1)], nextCursor: 'new-continuation' });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh operations' }));
  await screen.findByText(/Edit A 1/);
  expect(history.mock.calls[1]?.[2]?.cursor).toBeUndefined();
  expect(screen.getAllByText(/Edit A 2/)).toHaveLength(1);
  history.mockRejectedValueOnce(new Error('Refresh offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh operations' }));
  await screen.findByText('Refresh offline');
  expect(screen.getByText(/Edit A 1/)).toBeTruthy();
  expect(screen.getByText(/Edit A 2/)).toBeTruthy();
  view.unmount();
});

test('account, brand and family switches discard old pages and ignore late responses', async () => {
  let finish!: (page: { items: TemplateOperation[]; nextCursor: string | null }) => void;
  history.mockResolvedValueOnce({ items: [event(1)], nextCursor: 'old-account-cursor' });
  const view = mounted(tallHead.id);
  fireEvent.click(screen.getByRole('button', { name: 'Operations' }));
  await screen.findByText(/Edit A 1/);
  history.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Load more operations' }));
  currentUser = id(404);
  history.mockResolvedValueOnce({ items: [event(1, id(102))], nextCursor: null });
  view.rerender(view.node());
  expect(screen.queryByText(/Edit A 1/)).toBeNull();
  expect(history.mock.calls[1]?.[4]?.aborted).toBe(true);
  await screen.findByText(/Edit B 1/);
  await act(async () => finish({ items: [event(99)], nextCursor: 'late-old-account-cursor' }));
  expect(screen.queryByText(/Edit A 99/)).toBeNull();
  expect(history.mock.calls[2]?.[2]?.cursor).toBeUndefined();
  expect(history.mock.calls[2]?.[3]).toBe(currentUser);
  history.mockResolvedValueOnce({ items: [], nextCursor: null });
  view.rerender(view.node(variants, id(405)));
  expect(screen.queryByText(/Edit B 1/)).toBeNull();
  await screen.findByText('No operations recorded for this family.');
  const family = variants.map((variant) => ({ ...variant, templateId: id(406) }));
  history.mockResolvedValueOnce({ items: [event(3)], nextCursor: null });
  view.rerender(view.node(family, id(405)));
  expect(screen.queryByText('No operations recorded for this family.')).toBeNull();
  await screen.findByText(/Edit A 3/);
});
