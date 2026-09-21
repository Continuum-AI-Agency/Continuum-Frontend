/**
 * A shared template, opened: what it asks for comes from its render contract (read with the binding
 * it lives in), a reserved variable is not offered, a failed read says why, and Back / Render /
 * Remove do what the card's buttons do.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
  type ApiRenderTemplateContract,
  apiRenderTemplateContractSchema,
} from '@continuum/contracts';

const BRAND = '22222222-2222-4222-8222-222222222222';
const BINDING = '55555555-5555-4555-8555-555555555552';

const CONTRACT = apiRenderTemplateContractSchema.parse({
  template: {
    key: '100',
    name: '[DRAFT/agent] StarCraft API Render Proof',
    bindingId: BINDING,
    environment: 'Continuum_app',
    contractVersion: '1',
    contractHash: 'hash-100',
    contractSource: 'template_forge',
    outputKinds: ['image'],
    variableCount: 3,
    previewUrl: null,
    updatedAt: '2026-09-13T00:00:00Z',
    ratios: ['1:1', '9:16'],
  },
  variables: [
    { key: 'headline', label: 'Headline', kind: 'text', required: true },
    {
      key: 'tier',
      label: 'Tier',
      kind: 'enum',
      required: false,
      options: ['Bronze', 'Gold'],
      description: 'Which league badge shows',
    },
    { key: 'watermark_logo', label: 'Brand logo', kind: 'image', required: true, reserved: true },
  ],
});

let contract: () => Promise<ApiRenderTemplateContract> = async () => CONTRACT;
const getContract = mock((_brandId: string, _templateKey: string, _bindingId?: string | null) =>
  contract(),
);

// The Renders section subscribes to job changes; this spec needs no live channel.
mock.module('@/lib/supabase/realtime', () => ({
  subscribeToPostgresChanges: () => () => undefined,
}));
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    getContract,
    listJobs: async () => ({ items: [], nextCursor: null }),
    listRenderSets: async () => ({ items: [], nextCursor: null }),
  },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SharedTemplateDetail } from './SharedTemplateDetail';
import type { SharedTemplate } from './TemplateCard';

afterEach(() => {
  cleanup();
  contract = async () => CONTRACT;
  getContract.mockClear();
});

const TEMPLATE: SharedTemplate = {
  templateKey: '100',
  name: '[DRAFT/agent] StarCraft API Render Proof',
  displayName: null,
  draft: false,
  granted: true,
  updatedAt: '2026-09-13T00:00:00Z',
  workspaceId: BINDING,
};

function renderDetail() {
  const onBack = mock(() => undefined);
  const onToggle = mock(() => undefined);
  const onOpenRender = mock((_intent: { templateKey: string }) => undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SharedTemplateDetail
        brandId={BRAND}
        brandName="StarCraft"
        template={TEMPLATE}
        busy={false}
        onBack={onBack}
        onToggle={onToggle}
        onOpenRender={onOpenRender}
      />
    </QueryClientProvider>,
  );
  return { onBack, onToggle, onOpenRender };
}

describe('SharedTemplateDetail', () => {
  test("lists the contract's variables, read with the template's own binding, never a reserved one", async () => {
    renderDetail();
    const list = await screen.findByRole('list', { name: 'Variables' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.font-medium')?.textContent)).toEqual([
      'Headline',
      'Tier',
    ]);
    expect(within(rows[0]!).getByText('Required')).toBeTruthy();
    expect(within(rows[1]!).getByText('Choice')).toBeTruthy();
    expect(within(rows[1]!).getByText('One of: Bronze, Gold')).toBeTruthy();
    expect(within(rows[1]!).getByText('Which league badge shows')).toBeTruthy();
    expect(screen.queryByText('Brand logo')).toBeNull();
    expect(getContract).toHaveBeenCalledWith(BRAND, '100', BINDING);
    // The heading is the display name, never the draft marker the catalog stores.
    expect(
      screen.getByRole('heading', { level: 2, name: 'StarCraft API Render Proof' }),
    ).toBeTruthy();
  });

  test('a failed contract read says why instead of an empty list', async () => {
    contract = async () => {
      throw new Error('render_template_not_found');
    };
    renderDetail();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('render_template_not_found');
    expect(screen.queryByRole('list', { name: 'Variables' })).toBeNull();
  });

  test('Back, Render and Remove call through', async () => {
    const { onBack, onToggle, onOpenRender } = renderDetail();
    await screen.findByRole('list', { name: 'Variables' });

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Render with this' }));
    expect(onOpenRender).toHaveBeenCalledWith({ templateKey: '100' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove StarCraft API Render Proof from StarCraft' }),
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
