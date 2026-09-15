/**
 * The Templates gallery: search and the status filter narrow the cards, shared workspace templates
 * sit behind "Shared with you" with an "Add to {brand}" action, and nothing a person would have to
 * decode — an upload's uuid filename, the workspace's app name, "template 133" — reaches the page.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { TemplateSource } from '@continuum/contracts';

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { listJobs: async () => ({ items: [], nextCursor: null }) },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { SharedTemplate } from './TemplateCard';
import { TemplateGallery } from './TemplateGallery';

afterEach(cleanup);

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
  source({ displayName: 'Summer promo', templateKey: '133', updatedAt: '2026-09-10T00:00:00Z' }),
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

function renderGallery(onToggleShared = mock((_template: SharedTemplate) => undefined)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TemplateGallery
        brandId={BRAND}
        brandName="StarCraft"
        sources={SOURCES}
        shared={SHARED}
        adopting={null}
        onOpen={() => undefined}
        onRename={() => undefined}
        onToggleShared={onToggleShared}
        onFiles={() => undefined}
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

  test('the status filter groups cards, and shared templates carry an Add action and a Draft pill', () => {
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
    fireEvent.click(within(shared).getByRole('button', { name: 'Add to StarCraft' }));
    expect(onToggleShared).toHaveBeenCalledWith(SHARED[0]);
  });

  test('no uuid, app name, draft marker or "template N" is on the page', () => {
    renderGallery();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(text).not.toMatch(/Continuum_app|\[DRAFT|template \d+/i);
    expect(screen.getByText('New template')).toBeTruthy();
  });
});
