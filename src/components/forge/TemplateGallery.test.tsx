/**
 * The Templates gallery: search and the status filter narrow the cards, each card shows its newest
 * rendered frame (found by file name, from one list read), shared workspace templates sit behind
 * "Shared with you" with a "Use in {brand}" action that says what it does, and nothing a person
 * would have to decode — an upload's uuid filename, the workspace's app name, "template 133", the
 * version hash — reaches the page.
 */

import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { type ApiRenderJob, apiRenderJobSchema, type TemplateSource } from '@continuum/contracts';
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
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    shared = SHARED,
    adopting = null,
    onOpenShared = () => undefined,
  }: {
    sources?: TemplateSource[];
    shared?: SharedTemplate[];
    adopting?: string | null;
    onOpenShared?: (template: SharedTemplate) => void;
  } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TemplateGallery
        brandId={BRAND}
        brandName="StarCraft"
        sources={sources}
        shared={shared}
        adopting={adopting}
        onOpen={() => undefined}
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
  within(screen.getByRole('list', { name: 'Templates' }))
    .queryAllByRole('article')
    .map((card) => card.querySelector('.truncate')?.textContent);

describe('TemplateGallery', () => {
  test('cards are named, newest first, and search narrows them', () => {
    renderGallery();
    expect(cardNames()).toEqual(['Winter sale', 'Summer promo', 'Untitled template', 'Hero offer']);

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

    const card = screen.getByRole('button', { name: 'Open Summer promo' }).closest('article')!;
    const frame = (await within(card as HTMLElement).findByRole('img', {
      name: 'Summer promo · last render',
    })) as HTMLImageElement;
    expect(frame.src).toBe('https://cdn.test/Main_1x1_aaa.png');
    expect(listJobs).toHaveBeenCalledTimes(1);
    expect(listJobs.mock.calls[0]?.slice(1)).toEqual([50, { status: 'finished' }]);

    // A template that never rendered says so over its drawing; no card face carries the hash.
    const winter = screen.getByRole('button', { name: 'Open Winter sale' }).closest('article')!;
    expect(within(winter as HTMLElement).getByText('No render yet')).toBeTruthy();
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
    const shared = screen.getAllByRole('article')[0]!;
    expect(within(shared).getByText('Draft')).toBeTruthy();
    expect(
      within(shared).getByText(
        'Lets StarCraft render this template. Nothing is copied — it stays in the shared library. Remove any time.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(shared).getByRole('button', { name: 'Use in StarCraft' }));
    expect(onToggleShared).toHaveBeenCalledWith(SHARED[0]);
  });

  test('a shared template already in the brand says so and offers Remove', () => {
    const granted = { ...SHARED[0]!, name: 'Hero offer', draft: false, granted: true };
    const onToggleShared = renderGallery(undefined, { shared: [granted] });
    fireEvent.click(screen.getByRole('button', { name: /^Shared with you/ }));
    const card = screen.getAllByRole('article')[0]!;
    expect(within(card).getByText('In StarCraft')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Use in StarCraft' })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Remove Hero offer from StarCraft' }));
    expect(onToggleShared).toHaveBeenCalledWith(granted);
  });

  test('a shared card opens its detail, and its own buttons do not', () => {
    const onOpenShared = mock((_template: SharedTemplate) => undefined);
    const onToggleShared = renderGallery(undefined, { onOpenShared });
    fireEvent.click(screen.getByRole('button', { name: /^Shared with you/ }));
    const card = screen.getAllByRole('article')[0]!;

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
    expect(cardNames()).toEqual(['Inyogo card', 'Inyogo demo']);

    fireEvent.click(screen.getByRole('button', { name: /^Shared with you/ }));
    expect(cardNames()).toEqual(['Inyogo demo']);

    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Static 1' }));
    expect(cardNames()).toEqual(['Promo stills']);

    // Pressing it again clears it; the template nothing can classify is back, under neither.
    fireEvent.click(screen.getByRole('button', { name: 'Static 1' }));
    expect(cardNames()).toEqual(['Inyogo card', 'Promo stills', 'Inyogo demo', 'Hero offer']);
  });

  test('no uuid, app name, draft marker or "template N" is on the page', () => {
    renderGallery();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(text).not.toMatch(/Continuum_app|\[DRAFT|template \d+/i);
    expect(screen.getByText('New template')).toBeTruthy();
  });
});
