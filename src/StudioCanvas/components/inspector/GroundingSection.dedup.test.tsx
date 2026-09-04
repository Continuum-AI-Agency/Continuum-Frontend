// The real double-mount, end to end through the component tree.
//
// GroundingSection reads the brand's direction pieces and design sections for its own
// toggle handlers, and the GroundingPopover it renders reads the SAME two for its rows.
// The hooks are real here and only the network boundary is mocked, so this counts actual
// requests — which is the thing that was wrong: two of each, in the same millisecond.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import type React from 'react';

global.getComputedStyle = global.window.getComputedStyle.bind(global.window);
(global as { MutationObserver?: unknown }).MutationObserver = window.MutationObserver;

const BRAND = 'f24075ca-ea03-49fd-b98d-71915c271506';

const fetchBrandDirectionPieces = mock(async () => ({
  brandId: BRAND,
  directionVersion: 2,
  pieces: [{ piece: 'photography', ruleCount: 3, approvedCount: 2, gates: true }],
}));
mock.module('@/lib/api/brandDirectionPieces.client', () => ({ fetchBrandDirectionPieces }));

const fetchDesignSystem = mock(async () => ({
  present: true,
  status: 'ready',
  version: 1,
  updated_at: '2026-08-01T00:00:00.000Z',
  design_system: {
    rigor: 'strict',
    sections: [{ section: 'colour', title: 'Colour', enabled: true, rules: [{ id: 'r1' }] }],
  },
  design_system_id: 'ds-1',
}));
mock.module('@/lib/brands/designSystem.client', () => ({ fetchDesignSystem }));

mock.module('@/components/ui/ToastProvider', () => ({
  TOAST_VARIANTS: ['success', 'info', 'warning', 'error'] as const,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  ToastError: class ToastError extends Error {},
  coerceToastOptions: (_error: unknown, fallback: unknown) => fallback,
  useToastContext: () => ({ show: () => {} }),
  useToast: () => ({ show: () => {} }),
  throwToastError: (options: { title: string }) => {
    throw new Error(options.title);
  },
}));

// Static brand data — not what this test counts. `brandBookQueryKey`/`fetchBrandBookClient`
// are re-exported because mock.module replaces the WHOLE module and brandTypeInputs.client
// imports them from here.
mock.module('@/lib/brands/useBrandBook.client', () => ({
  useBrandBook: () => ({
    brandBook: null,
    brandTokens: {
      colors: [{ name: 'Primary', hex: '#000000' }],
      typography: [{ name: 'Body', family: 'Inter' }],
      voice: 'Direct',
      imagery: null,
      personality: null,
      audience: null,
      logo: null,
    },
    isLoading: false,
    isError: false,
  }),
  brandBookQueryKey: (brandId?: string) => ['brand-book', brandId],
  fetchBrandBookClient: async () => null,
}));
mock.module('@/lib/organic/skills', () => ({
  useBrandSkills: () => ({ all: [], skills: [], templates: [], isLoading: false }),
}));

const { useStudioStore } = await import('../../stores/useStudioStore');
const { GroundingSection } = await import('./GroundingSection');

type StoreNode = ReturnType<typeof useStudioStore.getState>['nodes'][number];

const node = {
  id: 'i1',
  type: 'imageGen',
  position: { x: 0, y: 0 },
  data: {},
  selected: true,
} as StoreNode;

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GroundingSection node={node} brandId={BRAND} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  fetchBrandDirectionPieces.mockClear();
  fetchDesignSystem.mockClear();
  useStudioStore.setState({ nodes: [] });
});

describe('GroundingSection network cost', () => {
  it('reads each brand endpoint once, though two components in the tree ask for it', async () => {
    useStudioStore.setState({ brandId: BRAND, saveTrigger: 0, nodes: [node] });
    renderSection();

    await waitFor(() => {
      expect(fetchBrandDirectionPieces).toHaveBeenCalledTimes(1);
      expect(fetchDesignSystem).toHaveBeenCalledTimes(1);
    });

    // Settle: a second instance firing late would push these past one.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchBrandDirectionPieces).toHaveBeenCalledTimes(1);
    expect(fetchDesignSystem).toHaveBeenCalledTimes(1);
  });
});
