/**
 * The Templates gallery: search and the status filter narrow the cards, each card shows its newest
 * rendered frame (found by file name, from one list read), shared workspace templates sit behind
 * "Shared with you" with a "Use in {brand}" action that says what it does, and nothing a person
 * would have to decode — an upload's uuid filename, the workspace's app name, "template 133", the
 * version hash — reaches the page.
 */

import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import {
  type ApiRenderJob,
  apiRenderJobSchema,
  type TemplateRevision,
  type TemplateRevisionVariant,
  type TemplateSource,
  type TemplateVariant,
} from '@continuum/contracts';
import * as templateSources from '@/lib/library/templateSources';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

let jobs: ApiRenderJob[] = [];
// A spy on the one method, not a module mock: Bun keeps one module registry per run, and a
// replaced module would reach every spec that runs after this one.
const listJobs = spyOn(apiRendersApi, 'listJobs').mockImplementation(async () => ({
  items: jobs,
  nextCursor: null,
}));
afterAll(() => listJobs.mockRestore());

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type SharedTemplate, sharedTemplateId } from './TemplateCard';
import { TemplateGallery } from './TemplateGallery';

afterEach(cleanup);
beforeEach(() => {
  jobs = [];
  listJobs.mockClear();
});

const BRAND = '22222222-2222-4222-8222-222222222222';
const UUID_FILE = 'd2f9637b-8fde-4b8a-9c3e-1a2b3c4d5e6f.aep';

function source(overrides: Partial<TemplateSource> & { filename?: string }): TemplateSource {
  const { filename = UUID_FILE, ...rest } = overrides;
  return {
    assetId: crypto.randomUUID(),
    brandId: BRAND,
    versionId: crypto.randomUUID(),
    family: 'after_effects',
    parseState: 'parsed',
    parser: 'py_aep',
    parse: {
      parser: 'py_aep',
      sourceFamily: 'after_effects',
      appVersion: null,
      filename,
      comps: [],
      ratios: [{ ratio: '1:1', width: 1080, height: 1080, comps: ['Main 1x1'] }],
      slots: [],
      fonts: [],
      staticText: [],
      warnings: [],
    },
    fonts: [],
    ratios: ['1:1', '9:16'],
    slotCount: 4,
    forgeRunId: null,
    forgeState: null,
    templateKey: null,
    displayName: null,
    parseError: null,
    parsedAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...rest,
  };
}

const SOURCES = [
  source({
    displayName: 'Summer promo',
    templateKey: '133',
    updatedAt: '2026-09-10T00:00:00Z',
    aepSha256: 'f'.repeat(64),
  }),
  source({
    displayName: 'Winter sale',
    forgeState: 'needs_input',
    updatedAt: '2026-09-12T00:00:00Z',
  }),
  source({ updatedAt: '2026-09-05T00:00:00Z' }),
];

const SHARED: SharedTemplate[] = [
  {
    templateKey: '88',
    name: '[DRAFT/agent] Hero offer',
    displayName: null,
    draft: true,
    granted: false,
    updatedAt: '2026-09-02T00:00:00Z',
  },
];

function renderGallery(
  onToggleShared = mock((_template: SharedTemplate) => undefined),
  {
    sources = SOURCES,
    catalog = [],
    families = [],
    shared = SHARED,
    adopting = null,
    onOpen = () => undefined,
    onOpenShared = () => undefined,
  }: {
    sources?: TemplateSource[];
    catalog?: TemplateVariant[];
    /** `null` leaves the registry unread, so the gallery asks for it. */
    families?: TemplateRevisionVariant[] | null;
    shared?: SharedTemplate[];
    adopting?: string | null;
    onOpen?: (assetId: string, tab?: string) => void;
    onOpenShared?: (template: SharedTemplate) => void;
  } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['forge', BRAND, 'template-variants'], catalog);
  if (families) client.setQueryData(['forge', BRAND, 'revision-variants', 'all'], families);
  render(
    <QueryClientProvider client={client}>
      <TemplateGallery
        brandId={BRAND}
        brandName="StarCraft"
        sources={sources}
        shared={shared}
        adopting={adopting}
        onOpen={onOpen}
        onOpenShared={onOpenShared}
        onRename={() => undefined}
        onToggleShared={onToggleShared}
        onFiles={() => undefined}
        onFonts={async () => undefined}
        onRejected={() => undefined}
      />
    </QueryClientProvider>,
  );
  return onToggleShared;
}

const cardNames = () =>
  within(screen.getByRole('table', { name: 'Templates' }))
    .queryAllByRole('button', { name: /^Open / })
    .map((button) => button.getAttribute('aria-label')?.slice(5));

describe('TemplateGallery', () => {
  test('cards are named, newest first, and search narrows them', () => {
    renderGallery();
    expect(cardNames()).toEqual(['Summer promo', 'Untitled template', 'Hero offer', 'Winter sale']);

    fireEvent.change(screen.getByLabelText('Search templates'), { target: { value: 'WINTER' } });
    expect(cardNames()).toEqual(['Winter sale']);

    fireEvent.change(screen.getByLabelText('Search templates'), { target: { value: 'nothing' } });
    expect(cardNames()).toEqual([]);
    expect(screen.getByText('No templates match.')).toBeTruthy();
  });

  test("a card shows its newest render's file for its format, read by name, from one list read", async () => {
    const file = (fileName: string) => ({
      id: fileName,
      kind: 'image',
      fileName,
      mimeType: 'image/png',
      url: `https://cdn.test/${fileName}`,
      width: null,
      height: null,
    });
    jobs = [
      // Newest: the fleet listed the 9:16 file first; the card must still show the 1:1 one.
      apiRenderJobSchema.parse({
        id: crypto.randomUUID(),
        brandId: BRAND,
        templateKey: '133',
        templateName: 'Summer promo',
        contractHash: 'hash',
        taskUid: 'T2',
        status: 'finished',
        outputs: [file('Story_9_16_bbb.png'), file('Main_1x1_aaa.png')],
        delivery: [],
        error: null,
        createdAt: '2026-09-12T00:00:00Z',
        updatedAt: '2026-09-12T00:00:00Z',
      }),
    ];
    renderGallery();

    await screen.findByRole('button', { name: 'Open Summer promo' });
    expect(listJobs).toHaveBeenCalledTimes(1);
    expect(listJobs.mock.calls[0]?.slice(1)).toEqual([50, { status: 'finished' }]);
    expect(screen.getByRole('table', { name: 'Templates' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('ffffffffff');
  });

  test('the status filter groups cards, and shared templates carry a Use action and a Draft pill', () => {
    const onToggleShared = renderGallery();

    fireEvent.click(screen.getByRole('button', { name: /^Ready/ }));
    expect(cardNames()).toEqual(['Summer promo']);

    fireEvent.click(screen.getByRole('button', { name: /^Needs attention/ }));
    expect(cardNames()).toEqual(['Winter sale']);
    expect(screen.getByText('Needs input')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
    expect(cardNames()).toEqual(['Untitled template', 'Hero offer']);

    fireEvent.click(screen.getByRole('button', { name: /^Shared with you/ }));
    expect(cardNames()).toEqual(['Hero offer']);
    // The New template tile is for uploads, not for someone else's templates.
    expect(screen.queryByText('New template')).toBeNull();
    const shared = screen.getByRole('button', { name: 'Open Hero offer' }).closest('tr')!;
    expect(within(shared).getByText('Draft · Shared')).toBeTruthy();
    fireEvent.click(within(shared).getByRole('button', { name: 'Use in StarCraft' }));
    expect(onToggleShared).toHaveBeenCalledWith(SHARED[0]);
  });

  test('a shared template already in the brand says so and offers Remove', () => {
    const granted = { ...SHARED[0]!, name: 'Hero offer', draft: false, granted: true };
    const onToggleShared = renderGallery(undefined, { shared: [granted] });
    fireEvent.click(screen.getByRole('button', { name: /^Shared with you/ }));
    const card = screen.getByRole('button', { name: 'Open Hero offer' }).closest('tr')!;
    expect(within(card).getByText('Ready · Shared')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Use in StarCraft' })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Remove Hero offer from StarCraft' }));
    expect(onToggleShared).toHaveBeenCalledWith(granted);
  });

  test('a shared card opens its detail, and its own buttons do not', () => {
    const onOpenShared = mock((_template: SharedTemplate) => undefined);
    const onToggleShared = renderGallery(undefined, { onOpenShared });
    fireEvent.click(screen.getByRole('button', { name: /^Shared with you/ }));
    const card = screen.getByRole('button', { name: 'Open Hero offer' }).closest('tr')!;

    fireEvent.click(within(card).getByRole('button', { name: 'Use in StarCraft' }));
    expect(onToggleShared).toHaveBeenCalledTimes(1);
    expect(onOpenShared).not.toHaveBeenCalled();

    fireEvent.click(within(card).getByRole('button', { name: 'Open Hero offer' }));
    expect(onOpenShared).toHaveBeenCalledWith(SHARED[0]);
  });

  test('one template id in two workspaces is two cards, and only the one being added spins', () => {
    const inWorkspace = (workspaceId: string): SharedTemplate => ({
      templateKey: '88',
      name: 'Hero offer',
      draft: false,
      granted: false,
      updatedAt: null,
      workspaceId,
    });
    const [first, second] = [inWorkspace('workspace-a'), inWorkspace('workspace-b')];
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      renderGallery(undefined, { shared: [first, second], adopting: sharedTemplateId(second) });
      fireEvent.click(screen.getByRole('button', { name: /^Shared with you/ }));

      const buttons = screen.getAllByRole('button', { name: 'Use in StarCraft' });
      expect(buttons.map((button) => button.hasAttribute('disabled'))).toEqual([false, true]);
      expect(logged.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    } finally {
      logged.mockRestore();
    }
  });

  test('Animated and Static narrow by what a template delivers, stacked on the status filter', async () => {
    const comp = (name: string, durationSec: number, isDelivery = true) => ({
      name,
      width: 1920,
      height: 1080,
      frameRate: 30,
      durationSec,
      layerCount: 3,
      isTop: isDelivery,
      isDelivery,
    });
    const parsed = (displayName: string, comps: ReturnType<typeof comp>[], updatedAt: string) => {
      const base = source({ displayName, updatedAt });
      return { ...base, parse: { ...base.parse!, comps } };
    };
    // A 15s precomp under a one-frame delivery comp is still a stills template (template 133).
    const stills = parsed(
      'Promo stills',
      [comp('Main', 1 / 30), comp('Background', 15, false)],
      '2026-09-11T00:00:00Z',
    );
    const card = parsed('Inyogo card', [comp('RENDER Card 1', 21.6)], '2026-09-12T00:00:00Z');
    // Operator-built and unparsed: only its render says it is video.
    const inyogo: SharedTemplate = {
      templateKey: '298',
      name: 'inyogo demo',
      draft: false,
      granted: true,
      updatedAt: '2026-09-09T00:00:00Z',
      workspaceId: 'six-app',
    };
    const unknown: SharedTemplate = { ...inyogo, templateKey: '88', name: 'Hero offer' };
    jobs = [
      apiRenderJobSchema.parse({
        id: crypto.randomUUID(),
        brandId: BRAND,
        templateKey: '298',
        templateName: 'inyogo demo',
        contractHash: 'hash',
        taskUid: 'T1',
        status: 'finished',
        outputs: [
          {
            id: 'card.mp4',
            kind: 'video',
            fileName: 'card.mp4',
            mimeType: 'video/mp4',
            url: 'https://cdn.test/card.mp4',
            width: null,
            height: null,
          },
        ],
        delivery: [],
        error: null,
        createdAt: '2026-09-12T00:00:00Z',
        updatedAt: '2026-09-12T00:00:00Z',
      }),
    ];
    renderGallery(undefined, { sources: [stills, card], shared: [inyogo, unknown] });

    const animated = await screen.findByRole('button', { name: 'Animated 2' });
    fireEvent.click(animated);
    expect(cardNames()).toEqual(['Inyogo demo', 'Inyogo card']);

    fireEvent.click(screen.getByRole('button', { name: /^Shared with you/ }));
    expect(cardNames()).toEqual(['Inyogo demo']);

    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Static 1' }));
    expect(cardNames()).toEqual(['Promo stills']);

    // Pressing it again clears it; the template nothing can classify is back, under neither.
    fireEvent.click(screen.getByRole('button', { name: 'Static 1' }));
    expect(cardNames()).toEqual(['Inyogo demo', 'Hero offer', 'Inyogo card', 'Promo stills']);
  });

  test('no uuid, app name, draft marker or "template N" is on the page', () => {
    renderGallery();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(text).not.toMatch(/Continuum_app|\[DRAFT|template \d+/i);
    expect(screen.getByText('New template')).toBeTruthy();
  });
});

test('the grouped table filters original design type and keeps child variants under their original', async () => {
  const original = source({ displayName: 'Client Illustrator', templateKey: '401' });
  const child = source({ displayName: 'Reordered copy', templateKey: '402' });
  const ae = source({ displayName: 'Client After Effects', templateKey: '403' });
  const meta = (item: TemplateSource, parentAssetId: string | null): TemplateVariant => ({
    assetId: item.assetId,
    rootAssetId: original.assetId,
    parentAssetId,
    parentVersionId: parentAssetId ? original.versionId : null,
    name: item.displayName!,
    sourceKind: 'illustrator',
    originalAssetId: original.assetId,
    originalVersionId: original.versionId,
    originalFileName: 'Client.ai',
    source: item,
  });
  renderGallery(undefined, {
    sources: [original, child, ae],
    shared: [],
    catalog: [meta(original, null), meta(child, original.assetId)],
  });
  expect(cardNames()).toEqual(['Client Illustrator', 'Client After Effects']);
  fireEvent.click(screen.getByRole('combobox', { name: 'Filter by source type' }));
  const option = await screen.findByRole('option', { name: 'Illustrator', exact: true });
  fireEvent.pointerDown(option, { pointerType: 'mouse', button: 0 });
  fireEvent.click(option);
  await waitFor(() => expect(cardNames()).toEqual(['Client Illustrator']));
  expect(screen.getByText('1:1 · 9:16 / 2')).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole('table', { name: 'Templates' })).getByRole('button', {
      name: 'Collapse Ready',
    }),
  );
  expect(cardNames()).toEqual([]);
  cleanup();
  renderGallery(undefined, {
    sources: [],
    shared: [{ ...SHARED[0]!, name: 'Published artboard', sourceAssetId: original.assetId }],
    catalog: [meta(original, null), meta(child, original.assetId)],
  });
  fireEvent.click(screen.getByRole('combobox', { name: 'Filter by source type' }));
  const publishedOption = await screen.findByRole('option', { name: 'Illustrator', exact: true });
  fireEvent.pointerDown(publishedOption, { pointerType: 'mouse', button: 0 });
  fireEvent.click(publishedOption);
  await waitFor(() => expect(cardNames()).toEqual(['Published artboard']));
  expect(screen.getByText('1:1 · 9:16 / 2')).toBeTruthy();
});

describe('template families', () => {
  const original = source({ displayName: 'Summer promo', updatedAt: '2026-09-10T00:00:00Z' });
  const secondRevision = source({ displayName: 'Summer promo v2' });
  const squareCrop = source({ displayName: 'Square crop' });
  const revision = (
    variantId: string,
    number: number,
    asset: TemplateSource,
  ): TemplateRevision => ({
    templateId: original.assetId,
    variantId,
    id: crypto.randomUUID(),
    number,
    parentRevisionId: null,
    sourceAssetId: asset.assetId,
    sourceVersionId: asset.versionId,
    checksum: 'a'.repeat(64),
    edits: { layers: [], slots: [] },
    source: asset,
    dependencies: null,
    publications: [],
    createdAt: '2026-09-10T00:00:00Z',
    createdBy: null,
    nativeCommitId: null,
  });
  const variant = (
    variantId: string,
    name: string,
    revisions: TemplateRevision[],
    publishedHeadRevisionId: string | null,
  ): TemplateRevisionVariant => ({
    templateId: original.assetId,
    variantId,
    name,
    original: variantId === original.assetId,
    parentRevisionId: null,
    draftHeadRevisionId: revisions.at(-1)!.id,
    publishedHeadRevisionId,
    archivedAt: null,
    sourceKind: 'after_effects',
    revisions,
  });
  const originalRevisions = [
    revision(original.assetId, 1, original),
    revision(original.assetId, 2, secondRevision),
  ];
  const cropId = crypto.randomUUID();
  const families = [
    variant(original.assetId, 'Summer promo', originalRevisions, originalRevisions[0]!.id),
    variant(cropId, 'Square crop', [revision(cropId, 1, squareCrop)], null),
  ];

  test('variants and revisions are cards under their original, never rows of their own', () => {
    const onOpen = mock((_assetId: string, _tab?: string) => undefined);
    renderGallery(undefined, {
      sources: [original, secondRevision, squareCrop],
      shared: [],
      families,
      onOpen,
    });
    expect(cardNames()).toEqual(['Summer promo']);
    expect(screen.getByText('1:1 · 9:16 / 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show 2 variants of Summer promo' }));
    const cards = within(screen.getByRole('list', { name: 'Variants of Summer promo' }));
    expect(cards.getAllByRole('button').map((card) => card.getAttribute('aria-label'))).toEqual([
      'Original · Published · Revision 2 · 2 revisions',
      'Square crop · Draft · Revision 1 · 1 revision',
    ]);
    // Search, filters and counts still count templates, not the cards under them.
    expect(screen.getByRole('button', { name: /^All\s*1$/ })).toBeTruthy();

    fireEvent.click(cards.getByRole('button', { name: /^Square crop/ }));
    expect(onOpen).toHaveBeenLastCalledWith(squareCrop.assetId, 'variants');
    fireEvent.click(cards.getByRole('button', { name: /^Original/ }));
    expect(onOpen).toHaveBeenLastCalledWith(secondRevision.assetId, 'variants');

    fireEvent.click(screen.getByRole('button', { name: 'Hide 2 variants of Summer promo' }));
    expect(screen.queryByRole('list', { name: 'Variants of Summer promo' })).toBeNull();
  });

  test('a template with one revision has nothing to expand, and its gear opens its settings', () => {
    const onOpen = mock((_assetId: string, _tab?: string) => undefined);
    renderGallery(undefined, { sources: [original], shared: [], onOpen });
    expect(screen.queryByRole('button', { name: /variants? of Summer promo/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Template settings for Summer promo' }));
    expect(onOpen).toHaveBeenCalledWith(original.assetId, 'layers');
  });

  test('a shared build of a variant is not a row; one of the original stands in for it', () => {
    const build = (name: string, asset: TemplateSource): SharedTemplate => ({
      templateKey: crypto.randomUUID(),
      name,
      draft: false,
      granted: true,
      updatedAt: null,
      sourceAssetId: asset.assetId,
    });
    renderGallery(undefined, {
      sources: [],
      shared: [build('Square crop build', squareCrop), build('Summer promo build', original)],
      families,
    });
    expect(cardNames()).toEqual(['Summer promo build']);
  });

  test('a registry that cannot be read says so, and Retry reads it again', async () => {
    const registry = spyOn(templateSources, 'fetchTemplateRevisionVariants').mockRejectedValue(
      new Error('offline'),
    );
    try {
      renderGallery(undefined, { sources: [original], shared: [], families: null });
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('Could not read template variants');
      expect(cardNames()).toEqual(['Summer promo']);
      fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(registry).toHaveBeenCalledTimes(2));
    } finally {
      registry.mockRestore();
    }
  });

  test('until the registry answers, no upload is listed as a template of its own', () => {
    const registry = spyOn(templateSources, 'fetchTemplateRevisionVariants').mockImplementation(
      () => new Promise(() => undefined),
    );
    try {
      renderGallery(undefined, {
        sources: [original, secondRevision, squareCrop],
        shared: [],
        families: null,
      });
      expect(cardNames()).toEqual([]);
      expect(screen.getByText('Reading templates…')).toBeTruthy();
    } finally {
      registry.mockRestore();
    }
  });
});
