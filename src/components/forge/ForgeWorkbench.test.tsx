/**
 * The Templates tab end to end in the DOM: a card whose upload is a uuid filename shows a name,
 * renames optimistically (and puts the old name back when the server refuses), and opens into the
 * detail panel and back.
 */

import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import {
  type TemplateSource,
  WEB_COMPONENT_BINDING_ID,
  type WorkspaceTemplate,
} from '@continuum/contracts';
import React from 'react';
import * as realtime from '@/lib/supabase/realtime';

const subscribe = spyOn(realtime, 'subscribeToRowBroadcasts').mockImplementation(
  () => () => undefined,
);
afterAll(() => subscribe.mockRestore());

const BRAND = '22222222-2222-4222-8222-222222222222';
const ASSET = '55555555-5555-4555-8555-555555555555';

const SOURCE: TemplateSource = {
  assetId: ASSET,
  brandId: BRAND,
  versionId: '66666666-6666-4666-8666-666666666666',
  family: 'after_effects',
  parseState: 'parsed',
  parser: 'py_aep',
  parse: null,
  fonts: [],
  ratios: ['1:1'],
  slotCount: 2,
  forgeRunId: null,
  forgeState: null,
  templateKey: null,
  displayName: null,
  parseError: null,
  parsedAt: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: null,
};

const toastError = mock((_message: string) => undefined);
let discovered: WorkspaceTemplate[] = [];
let discoveryFailures: { bindingId: string; code: string }[] = [];
let fetchedSources: TemplateSource[] = [SOURCE];
type UploadFinished = (result: { file: File; uploaded: { assetId: string } }) => void;
let uploadFinished: UploadFinished | undefined;
const fetchTemplateSources = mock(async () => fetchedSources);
const importDesignTemplate = mock(async (_brandId: string, assetId: string) => ({
  assetId,
  parseState: 'parsed',
  status: 'created' as const,
}));
const fetchRenderWorkspaces = mock(async () => []);
const workspaceDiscoveryResponse = (
  items: WorkspaceTemplate[] = discovered,
  failures: { bindingId: string; code: string }[] = discoveryFailures,
) => ({
  workspace: {
    id: '00000000-0000-4000-8000-0000000000b1',
    picinst: 'Continuum_app',
    environmentKey: 'prod',
    clientKey: 'starcraft',
    isDefault: true,
  },
  items,
  failures,
});
const discoverWorkspaceTemplates = mock(async () => workspaceDiscoveryResponse());
const renameTemplateSource = mock(async (_brandId: string, _assetId: string, title: string) => ({
  ...SOURCE,
  displayName: title,
}));

mock.module('@/lib/library/templateSources', () => ({
  fetchTemplateSources,
  // The gallery streams its list; each stream is one read of the same fixture.
  streamTemplateSources: async function* () {
    yield await fetchTemplateSources();
  },
  fetchTemplateVariants: async () => [],
  fetchTemplateRevisionVariants: async () => [],
  importDesignTemplate,
  renameTemplateSource,
  fetchRenderWorkspaces,
  discoverWorkspaceTemplates,
  loadWorkspaceTemplates: async () => (await discoverWorkspaceTemplates()).items,
  setTemplateAdoption: async () => ({ granted: true }),
  fetchTemplateVariables: async () => ({ variables: [], edits: [], parseState: 'parsed' }),
  saveTemplateVariables: async () => undefined,
  sendTemplateToForge: async () => SOURCE,
  advanceTemplateForgeRun: async () => undefined,
}));
let reducedMotion = false;
const motion = await import('motion/react');
mock.module('motion/react', () => ({ ...motion, useReducedMotion: () => reducedMotion }));
mock.module('@/components/forge/useForgeRun', () => ({
  useForgeRun: () => ({ run: null, pushed: true, loading: false, refresh: async () => undefined }),
}));
mock.module('@/components/forge/SourceRebindPanel', () => ({ SourceRebindPanel: () => null }));
mock.module('@/components/forge/OutputSettingsPanel', () => ({ OutputSettingsPanel: () => null }));
mock.module('@/components/library/useMediaUpload', () => ({
  useMediaUpload: (
    _brandId: string,
    options?: {
      onUploaded?: UploadFinished;
    },
  ) => {
    uploadFinished = options?.onUploaded;
    return { uploads: [], uploadFiles: async () => undefined };
  },
}));
const WEB_KEY = `web:${ASSET}`;
const getContract = mock(async (_brandId: string, templateKey: string, _bindingId?: string | null) => ({
  template: { key: templateKey, name: 'hello', bindingId: WEB_COMPONENT_BINDING_ID },
  variables: [
    { key: 'title_text', label: 'Title · text', kind: 'text', options: [] },
    { key: 'title_align', label: 'Title · align', kind: 'enum', options: ['left', 'center'] },
  ],
  outputs: [],
  publishCheck: { state: 'warn', issues: ['Video needs an even width.'], workerAttachmentId: null, media: [] },
  web: {
    width: 1080,
    height: 1080,
    durationSec: 4,
    fps: 30,
    previewUrl: 'https://api.test/preview',
    variables: [{ key: 'title_text', nodeId: 'title', property: 'text' }],
  },
}));
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { listJobs: async () => ({ items: [], nextCursor: null }), getContract },
}));
const toasts = await import('@/components/ui/toast-imperative');
mock.module('@/components/ui/toast-imperative', () => ({
  ...toasts,
  toast: Object.assign(() => undefined, {
    success: () => undefined,
    error: toastError,
    info: () => undefined,
    warning: () => undefined,
  }),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { ForgeWorkbench } from './ForgeWorkbench';

beforeEach(() => {
  discovered = [];
  discoveryFailures = [];
  fetchedSources = [SOURCE];
  uploadFinished = undefined;
  fetchTemplateSources.mockClear();
  fetchRenderWorkspaces.mockClear();
  discoverWorkspaceTemplates.mockClear();
  renameTemplateSource.mockClear();
  toastError.mockClear();
  importDesignTemplate.mockClear();
});
afterEach(() => {
  cleanup();
  reducedMotion = false;
  window.history.replaceState({}, '', '/');
});

function workspaceTemplate(
  overrides: Partial<WorkspaceTemplate> & Pick<WorkspaceTemplate, 'templateKey' | 'name'>,
): WorkspaceTemplate {
  return {
    templateId: Number(overrides.templateKey),
    bindingId: '00000000-0000-4000-8000-0000000000b1',
    rootTable: 'tpl_starcraft_root',
    updatedAt: null,
    granted: false,
    sourceAssetId: null,
    draft: false,
    ...overrides,
  };
}

function renderWorkbench(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={client}>
      <ForgeWorkbench brandId={BRAND} brandName="StarCraft" />
    </QueryClientProvider>,
  );
}

function rename(from: string, to: string) {
  fireEvent.click(screen.getByRole('button', { name: `Rename ${from}` }));
  const input = screen.getByRole('textbox', { name: `Rename ${from}` });
  fireEvent.change(input, { target: { value: to } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('ForgeWorkbench', () => {
  test('a completed upload appears immediately and keeps showing unpacking progress', async () => {
    fetchedSources = [];
    renderWorkbench();
    await waitFor(() => expect(fetchTemplateSources).toHaveBeenCalledTimes(1));

    let poll: TimerHandler | undefined;
    const interval = spyOn(window, 'setInterval').mockImplementation((handler) => {
      poll = handler;
      return 1;
    });
    try {
      fetchedSources = [{ ...SOURCE, parseState: 'pending' }];
      uploadFinished?.({ file: new File(['x'], 'promo.aep'), uploaded: { assetId: 'asset-new' } });

      expect(await screen.findByText('Opening')).toBeTruthy();
      expect(screen.getByLabelText('Search templates')).toBeTruthy();

      fetchedSources = [SOURCE];
      if (typeof poll === 'function') poll();
      expect(await screen.findByText('Ready to set up')).toBeTruthy();
      // ONE read: the server merges every binding, so the browser never enumerates workspaces.
      expect(fetchRenderWorkspaces).not.toHaveBeenCalled();
      expect(discoverWorkspaceTemplates).toHaveBeenCalledTimes(1);
    } finally {
      interval.mockRestore();
    }
  });

  test('reuses fresh template and workspace data after a remount', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = renderWorkbench(client);
    await screen.findByRole('button', { name: 'Open Untitled template' });
    first.unmount();

    renderWorkbench(client);
    await screen.findByRole('button', { name: 'Open Untitled template' });

    expect(fetchTemplateSources).toHaveBeenCalledTimes(1);
    expect(fetchRenderWorkspaces).not.toHaveBeenCalled();
    expect(discoverWorkspaceTemplates).toHaveBeenCalledTimes(1);
  });

  test('shows a shared catalog failure separately from an empty result and can retry', async () => {
    discoverWorkspaceTemplates.mockRejectedValueOnce(new Error('catalog unavailable'));
    renderWorkbench();
    expect(await screen.findByText('Shared catalog unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Untitled template' })).toBeTruthy();
    discoverWorkspaceTemplates.mockResolvedValueOnce(workspaceDiscoveryResponse([], []));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('shared-catalog-empty')).toBeTruthy();
  });

  test('keeps shared templates visible and offers recovery when the initial own-template read fails', async () => {
    discovered = [workspaceTemplate({ templateKey: '88', name: 'Shared hero' })];
    fetchTemplateSources.mockRejectedValueOnce(new Error('private source detail'));
    renderWorkbench();

    expect(await screen.findByText('Your templates are unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Shared hero' })).toBeTruthy();
    expect(toastError).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Open Untitled template' })).toBeTruthy();
    expect(screen.queryByText('Your templates are unavailable')).toBeNull();
  });

  test('retains cached own-template cards after a failed refresh', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(forgeQueryKeys.templateSources(BRAND), [SOURCE], { updatedAt: 0 });
    fetchTemplateSources.mockRejectedValueOnce(new Error('private source detail'));
    renderWorkbench(client);
    expect(await screen.findByText('Your templates could not be refreshed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Untitled template' })).toBeTruthy();
    expect(fetchTemplateSources).toHaveBeenCalledTimes(1);
  });

  test('shows a successful empty catalog only when there are no workspace failures', async () => {
    discovered = [];
    discoveryFailures = [];
    renderWorkbench();

    expect(await screen.findByTestId('shared-catalog-empty')).toBeTruthy();
    expect(screen.queryByText('Shared catalog unavailable')).toBeNull();
    expect(screen.queryByText('Some shared workspaces could not be checked')).toBeNull();
  });

  test('preserves own and shared templates while warning that some workspaces failed', async () => {
    discovered = [workspaceTemplate({ templateKey: '88', name: 'Hero offer', granted: true })];
    discoveryFailures = [
      { bindingId: '00000000-0000-4000-8000-0000000000b2', code: 'workspace_discovery_failed' },
    ];
    renderWorkbench();

    expect(await screen.findByText('Some shared workspaces could not be checked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Untitled template' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Hero offer from StarCraft' })).toBeTruthy();
    expect(screen.queryByTestId('shared-catalog-empty')).toBeNull();
  });

  test('shows unavailable instead of a confirmed empty catalog when every workspace failed', async () => {
    discovered = [];
    discoveryFailures = [
      { bindingId: '00000000-0000-4000-8000-0000000000b1', code: 'workspace_discovery_failed' },
    ];
    renderWorkbench();

    expect(await screen.findByText('Shared catalog unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Untitled template' })).toBeTruthy();
    expect(screen.queryByTestId('shared-catalog-empty')).toBeNull();
  });

  test('rename shows at once, and the old name comes back when the server refuses', async () => {
    let refuse: (error: Error) => void = () => undefined;
    renameTemplateSource.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );
    renderWorkbench();
    await screen.findByRole('button', { name: 'Open Untitled template' });

    rename('Untitled template', 'StarCraft Promo');
    expect(await screen.findByRole('button', { name: 'Open StarCraft Promo' })).toBeTruthy();
    expect(renameTemplateSource).toHaveBeenCalledWith(BRAND, ASSET, 'StarCraft Promo');

    refuse(new Error('Only members can rename'));
    await screen.findByRole('button', { name: 'Open Untitled template' });
    expect(toastError).toHaveBeenCalledWith('Only members can rename');

    rename('Untitled template', 'StarCraft Promo');
    await waitFor(() => expect(renameTemplateSource).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole('button', { name: 'Open StarCraft Promo' })).toBeTruthy();
  });

  test('an untitled upload takes its build name; other workspace templates are shared', async () => {
    discovered = [
      workspaceTemplate({
        templateKey: '133',
        name: '[DRAFT/agent] StarCraft Promo',
        sourceAssetId: ASSET,
      }),
      workspaceTemplate({ templateKey: '88', name: 'Hero offer', granted: true }),
    ];
    renderWorkbench();
    expect(await screen.findByRole('button', { name: 'Open StarCraft Promo' })).toBeTruthy();
    // Its own build is the card above, not a second "shared" copy of it.
    expect(screen.getByRole('button', { name: /^Shared with you\s*1$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Hero offer from StarCraft' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\[DRAFT|template \d+|Continuum_app/);
  });

  // Owner, 2026-10-05: one design's published builds are sub-entries of it, never rows of their own.
  test('published delivery compositions are rows under the template they were built from', async () => {
    fetchedSources = [{ ...SOURCE, templateKey: '99' }];
    discovered = [
      workspaceTemplate({
        templateKey: '101',
        name: 'Inyogo · Card A',
        sourceAssetId: ASSET,
        granted: true,
      }),
      workspaceTemplate({
        templateKey: '102',
        name: 'Inyogo · Card B',
        sourceAssetId: ASSET,
        granted: true,
      }),
    ];
    renderWorkbench();
    expect(await screen.findByRole('button', { name: 'Open Untitled template' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open Inyogo · Card A' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 variants of Untitled template' }));
    expect(screen.getByRole('button', { name: 'Open Inyogo · Card A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Inyogo · Card B' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Remove Inyogo · Card B from / })).toBeTruthy();
  });

  test('a card opens into its detail panel through a transition, and Templates goes back', async () => {
    const transition = spyOn(React, 'startTransition');
    try {
      renderWorkbench();
      fireEvent.click(await screen.findByRole('button', { name: 'Open Untitled template' }));

      expect(await screen.findByRole('tab', { name: 'Variables' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: /Untitled template/ })).toBeTruthy();
      expect(screen.queryByLabelText('Search templates')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
      expect(await screen.findByLabelText('Search templates')).toBeTruthy();
      // The morph needs a transition; the page-wide <ViewTransition> animates only those.
      expect(transition).toHaveBeenCalledTimes(2);
    } finally {
      transition.mockRestore();
    }
  });

  test('reduced motion swaps the detail in outside a transition, so nothing cross-fades', async () => {
    reducedMotion = true;
    const transition = spyOn(React, 'startTransition');
    try {
      renderWorkbench();
      fireEvent.click(await screen.findByRole('button', { name: 'Open Untitled template' }));
      expect(await screen.findByRole('tab', { name: 'Variables' })).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
      expect(await screen.findByLabelText('Search templates')).toBeTruthy();
      expect(transition).not.toHaveBeenCalled();
    } finally {
      transition.mockRestore();
    }
  });
  test('an imported web component opens its own sheet, and Render with this hands over its web key', async () => {
    fetchedSources = [
      { ...SOURCE, family: 'web_component', templateKey: WEB_KEY, displayName: 'Hello card' },
    ];
    // The preview page never arrives here; the sheet around it is what is under test.
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch,
    );
    const onOpenRender = mock((_intent: { templateKey: string }) => undefined);
    try {
      render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ForgeWorkbench brandId={BRAND} onOpenRender={onOpenRender} />
        </QueryClientProvider>,
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Open Hello card' }));

      const columns = await screen.findByRole('region', { name: 'Render columns' });
      expect(columns.textContent).toContain('Title · text');
      expect(columns.textContent).toContain('One of: left, center');
      expect(screen.getByText('Video needs an even width.')).toBeTruthy();
      expect(screen.getByText(/Web component · 2 fields · 1080×1080 · 4 s/)).toBeTruthy();
      // The Render grid's own read: same template key, the web components' nil binding.
      expect(getContract).toHaveBeenCalledWith(BRAND, WEB_KEY, WEB_COMPONENT_BINDING_ID);
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.test/preview');
      // Not the After Effects sheet: none of its tabs.
      expect(screen.queryByRole('tab', { name: 'Variables' })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Render with this' }));
      expect(onOpenRender).toHaveBeenCalledWith({ templateKey: WEB_KEY });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('a template intent from another tab opens its settings once, and is handed back', async () => {
    const consumed = mock(() => undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <ForgeWorkbench
          brandId={BRAND}
          templateIntent={{ assetId: ASSET }}
          onTemplateIntentConsumed={consumed}
        />
      </QueryClientProvider>,
    );
    const layers = await screen.findByRole('tab', { name: 'Edit layers' });
    expect(layers.getAttribute('aria-selected')).toBe('true');
    expect(consumed).toHaveBeenCalledTimes(1);

    // Dropped by the shell, the intent does not come back: Templates stays on the gallery.
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    view.rerender(
      <QueryClientProvider client={client}>
        <ForgeWorkbench brandId={BRAND} onTemplateIntentConsumed={consumed} />
      </QueryClientProvider>,
    );
    expect(await screen.findByLabelText('Search templates')).toBeTruthy();
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  describe('a link from the Library', () => {
    const SET = '77777777-7777-4777-8777-777777777777';
    const ROW = '88888888-8888-4888-8888-888888888888';
    const at = (search: string) => window.history.replaceState(null, '', `/forge${search}`);
    afterEach(() => at(''));

    test('?template opens that template’s detail', async () => {
      at(`?template=${ASSET}`);
      renderWorkbench();
      expect(await screen.findByRole('tab', { name: 'Variables' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: /Untitled template/ })).toBeTruthy();
    });

    test('a selected template opens the carried composition in its existing Layers workspace', async () => {
      at(`?template=${ASSET}&hfRevision=revision-42&brand=${BRAND}`);
      renderWorkbench();

      expect(await screen.findAllByTestId('hyperframes-seed-handoff')).toHaveLength(2);
      expect(screen.getByRole('tab', { name: 'Author' })).toBeTruthy();
      expect(screen.getByText('Source selected · Untitled template')).toBeTruthy();
      expect(screen.getAllByText(/privately stage and verify the composition package/i)).toHaveLength(2);
      expect(screen.getAllByRole('button', { name: /Import into this Forge workspace|Create private draft and import/ })).toHaveLength(1);
    });

    test('?set and ?row open that set in Render with the row, selected for a re-render', async () => {
      fetchedSources = [{ ...SOURCE, templateKey: '133' }];
      at(`?template=${ASSET}&set=${SET}&row=${ROW}&rerender=1`);
      const onOpenRender = mock((_intent: unknown) => undefined);
      render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <ForgeWorkbench brandId={BRAND} brandName="StarCraft" onOpenRender={onOpenRender} />
        </QueryClientProvider>,
      );
      await waitFor(() => expect(onOpenRender).toHaveBeenCalledTimes(1));
      expect(onOpenRender.mock.calls[0]?.[0]).toEqual({
        templateKey: '133',
        renderSetId: SET,
        rowId: ROW,
        rerender: true,
      });
    });

    test('a HyperFrames handoff stays at the existing source chooser until the person picks a template', async () => {
      at('?hfRevision=revision-42&brand=' + BRAND);
      renderWorkbench();

      expect(await screen.findByText('Choose a Forge source')).toBeTruthy();
      expect(screen.getByLabelText('Search templates')).toBeTruthy();
      expect(await screen.findByRole('button', { name: 'Open Untitled template' })).toBeTruthy();
      expect(screen.queryByRole('tab', { name: 'Layers' })).toBeNull();
    });

    test('a handoff from another active brand is paused without selecting or transferring a source', async () => {
      at('?hfRevision=revision-42&brand=33333333-3333-4333-8333-333333333333');
      renderWorkbench();

      expect(await screen.findByText('HyperFrames handoff paused')).toBeTruthy();
      expect(screen.getByLabelText('Search templates')).toBeTruthy();
      expect(screen.queryByRole('tab', { name: 'Layers' })).toBeNull();
    });
  });
});

for (const extension of ['ai', 'psd']) {
  test(`a direct ${extension.toUpperCase()} upload converts its saved asset and refreshes the gallery`, async () => {
    renderWorkbench();
    await waitFor(() => expect(uploadFinished).toBeDefined());
    uploadFinished?.({
      file: new File(['real upload handled elsewhere'], `design.${extension}`),
      uploaded: { assetId: 'design-source' },
    });
    await waitFor(() => expect(importDesignTemplate).toHaveBeenCalledWith(BRAND, 'design-source'));
    await waitFor(() => expect(fetchTemplateSources.mock.calls.length).toBeGreaterThan(1));
  });
}
