/**
 * The Templates tab end to end in the DOM: a card whose upload is a uuid filename shows a name,
 * renames optimistically (and puts the old name back when the server refuses), and opens into the
 * detail panel and back.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { TemplateSource } from '@continuum/contracts';

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
let discovered: unknown[] = [];
const renameTemplateSource = mock(async (_brandId: string, _assetId: string, title: string) => ({
  ...SOURCE,
  displayName: title,
}));

mock.module('@/lib/library/templateSources', () => ({
  fetchTemplateSources: async () => [SOURCE],
  renameTemplateSource,
  fetchRenderWorkspaces: async () => [],
  discoverWorkspaceTemplates: async () => ({ items: discovered }),
  setTemplateAdoption: async () => ({ granted: true }),
  fetchTemplateVariables: async () => ({ variables: [], edits: [], parseState: 'parsed' }),
  saveTemplateVariables: async () => undefined,
  sendTemplateToForge: async () => SOURCE,
  advanceTemplateForgeRun: async () => undefined,
}));
mock.module('@/components/forge/useForgeRun', () => ({
  useForgeRun: () => ({ run: null, pushed: true, loading: false, refresh: async () => undefined }),
}));
mock.module('@/components/forge/PendingApprovals', () => ({ PendingApprovals: () => null }));
mock.module('@/components/forge/LineagePanel', () => ({ LineagePanel: () => null }));
mock.module('@/components/forge/SourceRebindPanel', () => ({ SourceRebindPanel: () => null }));
mock.module('@/components/forge/OutputSettingsPanel', () => ({ OutputSettingsPanel: () => null }));
mock.module('@/components/library/useMediaUpload', () => ({
  useMediaUpload: () => ({ uploads: [], uploadFiles: async () => undefined }),
}));
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { listJobs: async () => ({ items: [], nextCursor: null }) },
}));
mock.module('@/components/ui/toast-imperative', () => ({
  toast: { success: () => undefined, error: toastError },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ForgeWorkbench } from './ForgeWorkbench';

beforeEach(() => {
  discovered = [];
  renameTemplateSource.mockClear();
  toastError.mockClear();
});
afterEach(cleanup);

function workspaceTemplate(overrides: Record<string, unknown>) {
  return {
    templateId: Number(overrides.templateKey),
    rootTable: 'tpl_starcraft_root',
    updatedAt: null,
    granted: false,
    sourceAssetId: null,
    draft: false,
    ...overrides,
  };
}

function renderWorkbench() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
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
    expect(screen.getByRole('button', { name: 'Open StarCraft Promo' })).toBeTruthy();
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
    expect(screen.getByRole('button', { name: 'Added' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\[DRAFT|template \d+|Continuum_app/);
  });

  test('a card opens into its detail panel and Templates goes back', async () => {
    renderWorkbench();
    fireEvent.click(await screen.findByRole('button', { name: 'Open Untitled template' }));

    expect(await screen.findByRole('heading', { name: 'Variables' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Untitled template/ })).toBeTruthy();
    expect(screen.queryByLabelText('Search templates')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    expect(await screen.findByLabelText('Search templates')).toBeTruthy();
  });
});
