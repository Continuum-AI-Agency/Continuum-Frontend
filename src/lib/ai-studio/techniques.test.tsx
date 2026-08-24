import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import type { WorkflowLibraryItem } from '@/lib/schemas/workflowLibrary';

const listWorkflows = mock(async () => [] as AiStudioWorkflow[]);
const libraryItems = { current: [] as WorkflowLibraryItem[] };

// bun's mock.module is process-wide: a PARTIAL mock of a shared module makes
// every other test file that imports a missing export fail to link. Mock the
// whole surface, and never mock a module another suite is the test OF —
// useApplyWorkflow has its own tests, so this file reaches it through the pure
// options helper instead.
mock.module('./workflowActions', () => ({
  listAiStudioWorkflowsAction: listWorkflows,
  createAiStudioWorkflowAction: mock(async () => ({})),
  updateAiStudioWorkflowAction: mock(async () => ({})),
  deleteAiStudioWorkflowAction: mock(async () => {}),
}));
mock.module('./useWorkflowLibrary', () => ({
  useWorkflowLibrary: () => ({
    items: libraryItems.current,
    isLoading: false,
    isError: false,
    refetch: mock(() => {}),
  }),
}));

const {
  isTechnique,
  mergeTechniqueTiers,
  techniqueApplyOptions,
  techniqueFromLibraryItem,
  techniqueFromWorkflow,
  useTechniques,
} = await import('./techniques');

const BRAND = '868a01f9-101b-4e0e-8392-6358a127ad97';

const technique = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  kind: 'generation',
  inputPorts: [
    { id: 'in-1', nodeRef: 'gen', handleId: 'ref-image', dataType: 'image', origin: 'edge' },
  ],
  outputPorts: [
    { id: 'out-1', nodeRef: 'gen', handleId: 'image', dataType: 'image', origin: 'terminal' },
  ],
  ...overrides,
});

const workflow = (name: string, metadata?: Record<string, unknown>): AiStudioWorkflow => ({
  id: `wf-${name}`,
  brandProfileId: BRAND,
  name,
  nodes: [{ id: 'gen' }, { id: 'prompt' }],
  edges: [{ id: 'e1' }],
  metadata,
  createdAt: '2026-08-24T00:00:00.000Z',
});

const libraryItem = (name: string, metadata?: Record<string, unknown>): WorkflowLibraryItem =>
  ({
    id: `lib-${name}`,
    name,
    description: 'A premade',
    content: { nodes: [{ id: 'gen' }], edges: [], metadata },
    tags: ['technique'],
    createdAt: '2026-08-24T00:00:00.000Z',
  }) as WorkflowLibraryItem;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  cleanup();
  listWorkflows.mockClear();
  libraryItems.current = [];
});

describe('technique row mapping', () => {
  it('reads a brand row and keeps its typed ports', () => {
    const item = techniqueFromWorkflow(workflow('Product vs model', { technique: technique() }));

    expect(item).toMatchObject({
      name: 'Product vs model',
      tier: 'brand',
      kind: 'generation',
      nodeCount: 2,
      edgeCount: 1,
    });
    expect(item?.inputPorts[0]?.dataType).toBe('image');
  });

  it('refuses a row that is not a technique', () => {
    expect(techniqueFromWorkflow(workflow('Plain', { starter: true }))).toBeNull();
    expect(techniqueFromWorkflow(workflow('Plain'))).toBeNull();
    expect(isTechnique(workflow('Plain', { technique: technique() }))).toBe(true);
    expect(isTechnique(workflow('Plain', { starter: true }))).toBe(false);
  });

  it('lifts a global library row onto the same apply path', () => {
    const item = techniqueFromLibraryItem(
      libraryItem('Palette smash-up', { technique: technique() }),
    );

    expect(item).toMatchObject({ tier: 'global', kind: 'generation' });
    // The graph moves out of `content` so useApplyWorkflow can eat it unchanged.
    expect(item?.workflow.nodes).toHaveLength(1);
    expect(item?.workflow.source).toBe('global');
  });

  it('skips library rows that carry no technique block', () => {
    expect(techniqueFromLibraryItem(libraryItem('Just a workflow'))).toBeNull();
  });
});

describe('mergeTechniqueTiers', () => {
  it('puts brand techniques first and lets them shadow a premade of the same name', () => {
    const brand = [
      techniqueFromWorkflow(workflow('Palette smash-up', { technique: technique() })),
      techniqueFromWorkflow(workflow('Alpha', { technique: technique() })),
    ].filter((item) => item !== null);
    const global = [
      techniqueFromLibraryItem(libraryItem('Palette smash-up', { technique: technique() })),
      techniqueFromLibraryItem(
        libraryItem('Brand extension generator', { technique: technique() }),
      ),
    ].filter((item) => item !== null);

    const merged = mergeTechniqueTiers(brand, global);

    expect(merged.map((item) => `${item.tier}:${item.name}`)).toEqual([
      'brand:Alpha',
      'brand:Palette smash-up',
      'global:Brand extension generator',
    ]);
  });
});

describe('useTechniques', () => {
  it('merges both tiers and filters non-techniques out of each', async () => {
    listWorkflows.mockImplementation(async () => [
      workflow('Mine', { technique: technique() }),
      workflow('A starter', { starter: true }),
    ]);
    libraryItems.current = [
      libraryItem('Premade', { technique: technique({ kind: 'reference' }) }),
      libraryItem('Not a technique'),
    ];

    const { result } = renderHook(() => useTechniques(BRAND), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items.map((item) => [item.tier, item.name])).toEqual([
      ['brand', 'Mine'],
      ['global', 'Premade'],
    ]);
  });

  it('serves the premades with no brand selected', async () => {
    libraryItems.current = [libraryItem('Premade', { technique: technique() })];

    const { result } = renderHook(() => useTechniques(undefined), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(listWorkflows).not.toHaveBeenCalled();
  });
});

describe('techniqueApplyOptions', () => {
  it('carries the pointer position through to the shared apply path', () => {
    expect(techniqueApplyOptions({ x: 120, y: 340 })).toEqual({
      toastTitle: 'Technique added',
      position: { x: 120, y: 340 },
    });
    // No position: placement falls back to mergeGraphs, below existing work.
    expect(techniqueApplyOptions().position).toBeUndefined();
  });
});
