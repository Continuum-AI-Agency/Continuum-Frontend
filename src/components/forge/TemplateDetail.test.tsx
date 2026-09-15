/**
 * A template's detail sheet: the default view names things and hides identifiers — the render
 * table, the workspace's app name, the asset uuid and the build's template key live only in the
 * Details tab — "Render with this" opens Render on the template, saved variable defaults come back
 * from the variables response's edits, and the checks say what they found where the facts are.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { ApiRenderJob, ApiRenderOutput, TemplateSource } from '@continuum/contracts';

const BRAND = '22222222-2222-4222-8222-222222222222';
const ASSET = '55555555-5555-4555-8555-555555555555';

const SOURCE: TemplateSource = {
  assetId: ASSET,
  brandId: BRAND,
  versionId: '66666666-6666-4666-8666-666666666666',
  family: 'after_effects',
  parseState: 'parsed',
  parser: 'py_aep',
  parse: {
    parser: 'py_aep',
    sourceFamily: 'after_effects',
    appVersion: null,
    filename: 'd2f9637b-8fde-4b8a-9c3e-1a2b3c4d5e6f.aep',
    comps: [],
    ratios: [
      { ratio: '1:1', width: 1080, height: 1080, comps: ['Main 1x1'] },
      { ratio: '9:16', width: 1080, height: 1920, comps: ['Story 9x16'] },
    ],
    slots: [],
    fonts: [],
    staticText: [],
    warnings: [],
  },
  fonts: ['HeadingNow-36CompBold'],
  ratios: ['1:1', '9:16'],
  slotCount: 1,
  forgeRunId: 'run-1',
  forgeState: 'published',
  templateKey: '133',
  displayName: 'StarCraft Promo',
  parseError: null,
  parsedAt: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-12T00:00:00Z',
};

const CONTINUUM_WORKSPACE = {
  id: '77777777-7777-4777-8777-777777777777',
  picinst: 'Continuum_app',
  environmentKey: 'prod',
  clientKey: 'starcraft_b17d81',
  isDefault: true,
};
const PARSED_WORKSPACE = {
  id: '88888888-8888-4888-8888-888888888888',
  picinst: 'Parsed_app',
  environmentKey: 'prod',
  clientKey: 'starcraft_b17d81',
  isDefault: false,
};
const PUBLISHED_RUN = {
  run_id: 'run-1',
  state: 'published',
  done: true,
  ok: true,
  progress: null,
  findings: [],
  needs: [],
  error: null,
  root_table: 'tpl_starcraft_b17d81_starcraft_promo_root',
  application: 'Continuum_app',
};
let workspaces = [CONTINUUM_WORKSPACE];
let run: typeof PUBLISHED_RUN | null = PUBLISHED_RUN;
let fontReadiness = {
  fonts: [{ family: 'HeadingNow-36CompBold', layers: 4, held: true }],
  missing: 0,
  parseState: 'parsed' as const,
};
let jobs: ApiRenderJob[] = [];

const job = (overrides: Partial<ApiRenderJob>): ApiRenderJob => ({
  id: crypto.randomUUID(),
  brandId: BRAND,
  templateKey: '133',
  templateName: 'StarCraft Promo',
  contractHash: 'hash',
  taskUid: 'T1',
  status: 'finished',
  test: true,
  outputs: [],
  delivery: [],
  error: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  label: null,
  renderRequestId: null,
  renderSetId: null,
  renderSetRowId: null,
  rootRowId: null,
  parentRowId: null,
  renderSetName: null,
  labelPath: [],
  renderSetRevision: null,
  templateSource: null,
  environment: null,
  fit: null,
  judge: null,
  deliveryTarget: null,
  slackDelivery: null,
  approval: null,
  ...overrides,
});

const file = (fileName: string): ApiRenderOutput => ({
  id: `hash-${fileName}`,
  kind: 'image',
  fileName,
  mimeType: 'image/jpeg',
  url: `https://cdn.test/${fileName}`,
  width: null,
  height: null,
  assetId: null,
  versionId: null,
});
const advanceTemplateForgeRun = mock(
  async (_brandId: string, _assetId: string, _action: string) => undefined,
);
const pushTemplateFonts = mock(async (_brandId: string, _assetId: string, fire: boolean) =>
  fire
    ? {
        fired: true as const,
        families: ['HeadingNow-36CompBold'],
        linked: [
          {
            filename: 'HeadingNow-36CompBold.otf',
            postScriptName: 'HeadingNow-36CompBold',
          },
        ],
        alreadyLinked: [],
        refused: [],
        wrote: true,
      }
    : {
        fired: false as const,
        families: ['HeadingNow-36CompBold'],
        files: [{ filename: 'HeadingNow-36CompBold.otf', bytes: 1024 }],
      },
);

mock.module('@/lib/library/templateSources', () => ({
  fetchTemplateVariables: async () => ({
    variables: [
      {
        key: 'Headline',
        label: 'Headline',
        kind: 'text',
        required: true,
        multiple: false,
        accept: [],
        options: [],
        description: null,
        reserved: false,
        role: null,
        roleSource: null,
        charBudget: 24,
        comps: ['Main 1x1'],
        sample: null,
        placement: null,
      },
    ],
    edits: [
      {
        slotKey: 'Headline',
        defaultValue: 'Saved copy',
        assetId: ASSET,
        kind: 'text',
        updatedAt: '2026-09-12T00:00:00Z',
      },
    ],
    parseState: 'parsed',
  }),
  fetchRenderWorkspaces: async () => workspaces,
  fetchTemplateFonts: async () => fontReadiness,
  pushTemplateFonts,
  saveTemplateVariables: async () => undefined,
  sendTemplateToForge: async () => SOURCE,
  advanceTemplateForgeRun,
  // The History and Source revision panels render for real, from these. Mocking the panels
  // themselves would replace them for LineagePanel.test too: a multi-file Bun run shares mocks.
  fetchTemplateLineage: async () => ({
    connected: false,
    known: false,
    master: null,
    currentMaster: null,
    pinnedToOlderMaster: false,
    roots: [],
    log: [],
    worktrees: [],
  }),
  previewTemplateRebind: async () => null,
  confirmTemplateRebind: async () => null,
  fetchTemplateRun: async () => null,
}));
mock.module('@/components/forge/useForgeRun', () => ({
  useForgeRun: () => ({
    run,
    pushed: true,
    loading: false,
    refresh: async () => undefined,
  }),
}));
mock.module('@/lib/library/versions', () => ({
  listAssetVersions: async () => [],
  uploadNewAssetVersion: async () => ({ versionId: null }),
}));
mock.module('@/components/forge/OutputSettingsPanel', () => ({
  OutputSettingsPanel: () => <h3>Output settings</h3>,
}));
// The Renders section subscribes to job changes; the sheet's tests need no live channel.
mock.module('@/lib/supabase/realtime', () => ({
  subscribeToPostgresChanges: () => () => undefined,
}));
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    listJobs: async () => ({ items: jobs, nextCursor: null }),
    listRenderSets: async () => ({ items: [{ id: 'set-1' }, { id: 'set-2' }], nextCursor: null }),
  },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TemplateDetail } from './TemplateDetail';

afterEach(() => {
  cleanup();
  workspaces = [CONTINUUM_WORKSPACE];
  run = PUBLISHED_RUN;
  fontReadiness = {
    fonts: [{ family: 'HeadingNow-36CompBold', layers: 4, held: true }],
    missing: 0,
    parseState: 'parsed',
  };
  jobs = [];
  pushTemplateFonts.mockClear();
  advanceTemplateForgeRun.mockClear();
});

/** What a person sees: everything except a hidden (inactive, kept-mounted) tab panel. */
function visibleText(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  for (const hidden of clone.querySelectorAll('[hidden]')) hidden.remove();
  return clone.textContent ?? '';
}

/** A fact's value, read off the fact list by its label. */
const fact = (label: string) =>
  [...document.querySelectorAll('dt')].find((dt) => dt.textContent === label)?.nextElementSibling
    ?.textContent;

/** One CHECKS row's text, found by its mono name. */
const check = (name: string) =>
  within(screen.getByRole('list', { name: 'Checks' }))
    .getAllByRole('listitem')
    .find((row) => row.querySelector('.font-mono')?.textContent === name)!;

function renderDetail(
  onOpenRender = mock((_intent: unknown) => undefined),
  source: TemplateSource = SOURCE,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (nextSource: TemplateSource) => (
    <QueryClientProvider client={client}>
      <TemplateDetail
        brandId={BRAND}
        source={nextSource}
        onBack={() => undefined}
        onRename={() => undefined}
        onOpenRender={onOpenRender}
        onChanged={async () => undefined}
      />
    </QueryClientProvider>
  );
  const view = render(tree(source));
  return {
    onOpenRender,
    rerenderSource: (nextSource: TemplateSource) => view.rerender(tree(nextSource)),
  };
}

describe('TemplateDetail', () => {
  test('identifiers stay inside the Details tab; the default view names things', async () => {
    renderDetail();
    // The saved default comes from `edits` — it is on screen once the variables have loaded.
    expect(((await screen.findByLabelText('Headline default')) as HTMLInputElement).value).toBe(
      'Saved copy',
    );

    const text = visibleText();
    expect(text).toContain('StarCraft Promo');
    expect(text).toContain('Ready to render');
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(text).not.toMatch(/Continuum_app|tpl_|root_table|template \d+|\b133\b/i);
    fireEvent.click(screen.getByRole('tab', { name: 'Output' }));
    expect(await screen.findByRole('heading', { name: 'Output settings' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    await waitFor(() => expect(visibleText()).toContain(ASSET));
    const opened = visibleText();
    expect(opened).toContain('tpl_starcraft_b17d81_starcraft_promo_root');
    expect(opened).toContain('Continuum_app');
    expect(opened).toContain(ASSET);
  });

  test('a brand with two workspaces picks between names, not app names', async () => {
    workspaces = [CONTINUUM_WORKSPACE, PARSED_WORKSPACE];
    run = null;
    renderDetail();
    // The build form lives in the BUILD check's detail.
    fireEvent.click(await screen.findByRole('button', { name: 'Build details' }));
    const picker = (await screen.findByLabelText('Render workspace')) as HTMLSelectElement;
    expect([...picker.options].map((option) => option.textContent)).toEqual([
      'Workspace 1 (default)',
      'Workspace 2',
    ]);
    expect(visibleText()).not.toMatch(/Continuum_app|Parsed_app/);

    // The app name is still findable, inside Details, for whichever workspace is chosen.
    fireEvent.change(picker, { target: { value: PARSED_WORKSPACE.id } });
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    await waitFor(() => expect(visibleText()).toContain('Parsed_app'));
  });

  test('Render with this opens Render on the template', async () => {
    const { onOpenRender } = renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Render with this' }));
    expect(onOpenRender).toHaveBeenCalledWith({ templateKey: '133' });
  });

  test('reports unread font requirements truthfully instead of claiming none', async () => {
    fontReadiness = { fonts: [], missing: 0, parseState: 'pending' };
    renderDetail(undefined, { ...SOURCE, parseState: 'pending', parse: null, fonts: [] });
    await waitFor(() => expect(fact('Fonts')).toBe('Not known yet'));
    expect(check('Fonts').textContent).toContain('Waits for the file to be read');
    expect(visibleText()).not.toMatch(/All 0 uploaded|Uses no typefaces/);
  });

  test('refreshes pending font state from readiness without mixing in stale source names', async () => {
    fontReadiness = { fonts: [], missing: 0, parseState: 'pending' };
    const pending = { ...SOURCE, parseState: 'pending' as const, parse: null, fonts: [] };
    const { rerenderSource } = renderDetail(undefined, pending);
    await waitFor(() => expect(fact('Fonts')).toBe('Not known yet'));

    fontReadiness = {
      fonts: [{ family: 'Fresh Parsed Face', layers: 2, held: false }],
      missing: 1,
      parseState: 'parsed',
    };
    rerenderSource({
      ...SOURCE,
      fonts: [],
      versionId: '99999999-9999-4999-8999-999999999999',
      updatedAt: '2026-09-14T12:00:00Z',
    });

    await waitFor(() => expect(fact('Fonts')).toBe('1 · 1 missing'));
    expect(check('Fonts').textContent).toContain('1 of 1 not uploaded: Fresh Parsed Face');
    expect(visibleText()).not.toContain('HeadingNow');

    // The footer's next step opens the failing row onto each face's state.
    fireEvent.click(screen.getByRole('button', { name: 'Investigate' }));
    expect(await screen.findByText('Fresh Parsed Face · not uploaded')).toBeTruthy();
  });

  test('reviews a dry plan before installing held faces', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Fonts details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review font install' }));
    expect(await screen.findByText(/HeadingNow-36CompBold\.otf/)).toBeTruthy();
    expect(pushTemplateFonts).toHaveBeenNthCalledWith(1, BRAND, ASSET, false, [
      'HeadingNow-36CompBold',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Install fonts' }));
    expect(await screen.findByText(/installed.*HeadingNow-36CompBold/i)).toBeTruthy();
    expect(pushTemplateFonts).toHaveBeenNthCalledWith(2, BRAND, ASSET, true, [
      'HeadingNow-36CompBold',
    ]);
  });

  test('five checks say what they look at; a draft offers its test render on its own row', async () => {
    run = { ...PUBLISHED_RUN, state: 'draft_ready' };
    renderDetail(undefined, { ...SOURCE, templateKey: null, forgeState: 'draft_ready' });
    const rows = within(await screen.findByRole('list', { name: 'Checks' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((row) => row.querySelector('.font-mono')?.textContent)).toEqual([
      'Parse',
      'Fonts',
      'Build',
      'Test render',
      'Publish',
    ]);
    expect(check('Test render').textContent).toContain(
      'Renders one watermarked frame to prove each variable reaches its layer.',
    );
    expect(screen.getByText('2 to do').getAttribute('role')).toBe('status');

    fireEvent.click(within(check('Test render')).getByRole('button', { name: 'Test render' }));
    await waitFor(() =>
      expect(advanceTemplateForgeRun).toHaveBeenCalledWith(BRAND, ASSET, 'smoke'),
    );
  });

  test('facts read formats, unassigned variables, sets and the last render from cached reads', async () => {
    jobs = [
      job({ status: 'failed', updatedAt: new Date(Date.now() - 60 * 60_000).toISOString() }),
      job({ finishedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString() }),
    ];
    renderDetail();
    await waitFor(() => expect(fact('Last render')).toBe('2h ago'));
    expect(screen.getByRole('img', { name: '1 of 2 done' })).toBeTruthy();
    expect(fact('Formats')).toBe('1:19:16');
    await waitFor(() => expect(fact('Variables')).toBe('1 · 1 unassigned'));
    await waitFor(() => expect(fact('Sets')).toBe('2'));
  });

  test('the preview shows the picked format’s own file, whatever order the job listed them in', async () => {
    jobs = [
      job({
        label: 'Spain',
        renderSetName: 'Launch week',
        finishedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
        // The fleet's order, not the template's: the story file first.
        outputs: [file('Story_9x16_ooqxxwb.jpg'), file('Main_1x1_1mjxxwb.jpg')],
      }),
    ];
    renderDetail();
    const preview = await screen.findByRole('group', { name: 'Template preview' });
    const frame = () => preview.querySelector('[data-slot="format-preview-frame"]') as HTMLElement;

    const square = await within(preview).findByRole('img', { name: 'StarCraft Promo · 1:1' });
    expect(square.getAttribute('src')).toBe('https://cdn.test/Main_1x1_1mjxxwb.jpg');
    expect(frame().style.aspectRatio).toBe('1080 / 1080');
    expect(within(preview).getByText('Rendered · 2h ago')).toBeTruthy();

    fireEvent.click(within(preview).getByRole('button', { name: 'Story 9x16' }));
    expect(
      within(preview).getByRole('img', { name: 'StarCraft Promo · 9:16' }).getAttribute('src'),
    ).toBe('https://cdn.test/Story_9x16_ooqxxwb.jpg');
    expect(frame().style.aspectRatio).toBe('1080 / 1920');

    fireEvent.click(within(preview).getByRole('button', { name: 'Estimate' }));
    expect(within(preview).getByRole('img', { name: '9:16 layout' })).toBeTruthy();
    expect(within(preview).getByText('Estimate · wireframe')).toBeTruthy();

    // Its renders, grouped by the set that asked for them.
    expect(await screen.findByRole('button', { name: /Launch week/ })).toBeTruthy();
    expect(screen.getByText('Spain')).toBeTruthy();
  });

  test('switching tabs keeps an unsaved variable edit', async () => {
    renderDetail();
    const field = (await screen.findByLabelText('Headline default')) as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'Unsaved copy' } });
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Variables' }));
    expect((screen.getByLabelText('Headline default') as HTMLInputElement).value).toBe(
      'Unsaved copy',
    );
    expect(screen.getByText('1 changed')).toBeTruthy();
  });
});
