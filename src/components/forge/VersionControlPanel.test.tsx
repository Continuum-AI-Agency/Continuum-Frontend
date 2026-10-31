import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type { TemplateRevision, TemplateRevisionVariant } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  fetchTemplateVersionHistory: async () => ({ items: [] }),
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
  const node = (data = items) => (
    <QueryClientProvider client={client}>
      <VersionControlPanel
        brandId={brandId}
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
