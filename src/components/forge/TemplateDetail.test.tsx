/**
 * A template's detail panel: the default view names things and hides identifiers — the render
 * table, the workspace's app name, the asset uuid and the build's template key live only inside the
 * closed "Details" — "Render with this" opens Render on the template, and saved variable defaults
 * come back from the variables response's edits.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
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
  fetchRenderWorkspaces: async () => [
    {
      id: '77777777-7777-4777-8777-777777777777',
      picinst: 'Continuum_app',
      environmentKey: 'prod',
      clientKey: 'starcraft_b17d81',
      isDefault: true,
    },
  ],
  saveTemplateVariables: async () => undefined,
  sendTemplateToForge: async () => SOURCE,
  advanceTemplateForgeRun: async () => undefined,
}));
mock.module('@/components/forge/useForgeRun', () => ({
  useForgeRun: () => ({
    run: {
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
    },
    pushed: true,
    loading: false,
    refresh: async () => undefined,
  }),
}));
mock.module('@/components/forge/LineagePanel', () => ({ LineagePanel: () => null }));
mock.module('@/components/forge/SourceRebindPanel', () => ({ SourceRebindPanel: () => null }));
mock.module('@/components/forge/OutputSettingsPanel', () => ({
  OutputSettingsPanel: () => <h3>Output settings</h3>,
}));
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { listJobs: async () => ({ items: [], nextCursor: null }) },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TemplateDetail } from './TemplateDetail';

afterEach(cleanup);

/** What a person sees: everything except the body of a closed disclosure. */
function visibleText(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  for (const details of clone.querySelectorAll('details')) {
    if (details.hasAttribute('open')) continue;
    for (const child of [...details.children]) if (child.tagName !== 'SUMMARY') child.remove();
  }
  return clone.textContent ?? '';
}

function renderDetail(onOpenRender = mock((_intent: unknown) => undefined)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TemplateDetail
        brandId={BRAND}
        source={SOURCE}
        onBack={() => undefined}
        onRename={() => undefined}
        onOpenRender={onOpenRender}
        onChanged={async () => undefined}
      />
    </QueryClientProvider>,
  );
  return onOpenRender;
}

describe('TemplateDetail', () => {
  test('identifiers stay inside the closed Details; the default view names things', async () => {
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
    expect(screen.getByRole('heading', { name: 'Output settings' })).toBeTruthy();

    const details = screen.getByText('Details').closest('details')!;
    details.setAttribute('open', '');
    const opened = visibleText();
    expect(opened).toContain('tpl_starcraft_b17d81_starcraft_promo_root');
    expect(opened).toContain('Continuum_app');
    expect(opened).toContain(ASSET);
  });

  test('Render with this opens Render on the template', async () => {
    const onOpenRender = renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Render with this' }));
    expect(onOpenRender).toHaveBeenCalledWith({ templateKey: '133' });
  });
});
