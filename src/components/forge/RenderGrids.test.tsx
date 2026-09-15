/**
 * The two Forge grids against a mocked render API.
 *
 * What this guards is the wiring, not the pixels: a template is discovered and its contract
 * seeds a row from the designer's samples; the row's dry-run lands and the status reads Ready;
 * the jobs grid lists what the brand has rendered. The pure row logic has its own test.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';

const preflightMock = mock(async () => ({
  confirmationToken: 't',
  confirmationHash: 'a'.repeat(64),
  expiresAt: new Date().toISOString(),
  template: TEMPLATE,
  target: null,
  inputKeys: ['headline'],
  effects: 'none' as const,
  test: true,
  watermarkLogo: null,
  fit: null,
}));

const listRenderSetsMock = mock(async () => ({ items: [] as unknown[], nextCursor: null }));

const TEMPLATE = {
  key: '133',
  name: 'forge_bench_starcraft',
  environment: 'Continuum_app',
  contractVersion: '1',
  contractHash: 'hash',
  contractSource: 'template_forge' as const,
  outputKinds: ['image' as const],
  variableCount: 2,
  previewUrl: null,
  updatedAt: null,
  ratios: ['1:1'],
  sourceAssetId: null,
  fontsMissing: [],
};

const VARIABLES = [
  {
    key: 'headline',
    label: 'Headline',
    kind: 'text' as const,
    required: true,
    multiple: false,
    accept: [],
    options: [],
    description: null,
    reserved: false,
    role: 'name' as const,
    roleSource: 'declared' as const,
    charBudget: 12,
    comps: [],
    sample: 'Hola mundo',
    placement: null,
  },
  {
    key: 'hero',
    label: 'Hero',
    kind: 'image' as const,
    required: false,
    multiple: false,
    accept: [],
    options: [],
    description: null,
    reserved: false,
    role: 'product_image' as const,
    roleSource: 'declared' as const,
    charBudget: null,
    comps: [],
    sample: null,
    placement: null,
  },
];

const JOB = {
  id: '11111111-1111-4111-8111-111111111111',
  brandId: '22222222-2222-4222-8222-222222222222',
  templateKey: '133',
  templateName: 'forge_bench_starcraft',
  contractHash: 'hash',
  taskUid: 'T1',
  status: 'finished' as const,
  test: true,
  outputs: [],
  delivery: [],
  error: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  environment: 'Continuum_app',
  fit: null,
  judge: null,
  renderSetName: 'Campaign set',
  labelPath: ['Root', 'Spain'],
};

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    listEnvironments: async () => ({
      items: [
        {
          bindingId: '44444444-4444-4444-8444-444444444444',
          workspace: 'Continuum_app',
          isDefault: true,
        },
      ],
    }),
    listTemplates: async () => ({ items: [TEMPLATE], nextCursor: null }),
    getContract: async () => ({
      template: TEMPLATE,
      variables: VARIABLES,
      outputs: [],
      fonts: [],
      layout: null,
      divergence: [],
    }),
    listInputSets: async () => ({ items: [], nextCursor: null }),
    listRenderSets: listRenderSetsMock,
    createRenderSet: async (input: Record<string, unknown>) => ({
      ...input,
      id: '33333333-3333-4333-8333-333333333333',
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    batchPreflight: async () => ({ confirmationToken: 'batch-token' }),
    createBatch: async () => ({ jobs: [JOB] }),
    preflight: preflightMock,
    listJobs: async () => ({ items: [JOB], nextCursor: null }),
    getJob: async () => JOB,
  },
}));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ realtime: { setAuth: async () => undefined } }),
}));
mock.module('@/lib/supabase/realtime', () => ({
  subscribeToPostgresChanges: () => () => undefined,
}));
// The Library picker drags the whole media stack in; the cell only needs its anchor.
mock.module('@/components/organic/primitives/MediaSelectPopover', () => ({
  MediaSelectPopover: ({ anchor }: { anchor: React.ReactNode }) => <>{anchor}</>,
}));

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { ApiError } from '@/lib/api/errors';
import { RenderJobsGrid } from './RenderJobsGrid';
import { RenderRequestsGrid } from './RenderRequestsGrid';

const BRAND = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  cleanup();
  localStorage.clear();
  preflightMock.mockClear();
  listRenderSetsMock.mockClear();
});

describe('RenderRequestsGrid', () => {
  test('associates an authoritative guardrail refusal with its row and cell', async () => {
    preflightMock.mockImplementationOnce(async () => {
      throw new ApiError('render_brand_guardrail_blocked', 422, undefined, {
        detail: 'Use a permitted brand color.',
        guardrails: [
          {
            code: 'BRAND_COLOR_OUTSIDE_PALETTE',
            severity: 'block',
            variableKey: 'headline',
            message: 'Use a permitted brand color.',
          },
        ],
      });
    });
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByLabelText('Headline');
    await waitFor(() => expect(screen.getByText(/BLOCKED · 0 ready · 1 blocked/)).toBeTruthy());
    expect(
      screen.getByLabelText('Headline').closest('[title="Use a permitted brand color."]'),
    ).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText('Select row')[0]!);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Render 1/ }).disabled).toBe(true);
  });
  test('refuses a whole paste above the fifty-row cap', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    const paste = (count: number) =>
      fireEvent.paste(screen.getByRole('table'), {
        clipboardData: {
          getData: () =>
            ['headline', ...Array.from({ length: count }, (_, index) => `Row ${index}`)].join('\n'),
        },
      });
    paste(50);
    expect(screen.getAllByLabelText('Select row')).toHaveLength(1);
    paste(49);
    expect(screen.getAllByLabelText('Select row')).toHaveLength(50);
    paste(1);
    expect(screen.getAllByLabelText('Select row')).toHaveLength(50);
  });
  test('discovers the one template, seeds a row from the samples, and dry-runs it to Ready', async () => {
    localStorage.clear();
    render(<RenderRequestsGrid brandId={BRAND} />);
    const cell = await screen.findByLabelText('Headline');
    expect((cell as HTMLInputElement).value).toBe('Hola mundo');
    // The counter reads against the designer's budget.
    expect(screen.getByText('10/12')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy(), { timeout: 3000 });
    expect(preflightMock).toHaveBeenCalledTimes(1);
    const sent = (preflightMock.mock.calls[0] as unknown[])[0] as {
      variables: Record<string, unknown>;
    };
    expect(sent.variables).toEqual({ headline: 'Hola mundo' });
    // A media cell offers the Library and is not a text input.
    expect(screen.getByLabelText('Choose Hero')).toBeTruthy();
  });

  test('forks an explicitly selected named row and distinguishes clear from reset to inheritance', async () => {
    render(<RenderRequestsGrid brandId={BRAND} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.click((await screen.findAllByLabelText('Select row'))[0]!);
    expect(screen.getByText(/1 selected/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fork' }));

    expect(await screen.findByDisplayValue('Root fork')).toBeTruthy();
    expect(screen.getByTitle('Root')).toBeTruthy();
    expect(screen.getAllByDisplayValue('Hola mundo')).toHaveLength(2);
    expect(screen.getByText(/1 selected/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear inherited Headline' }));
    expect(screen.getAllByDisplayValue('Hola mundo')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Headline to inherited' }));
    expect(screen.getAllByDisplayValue('Hola mundo')).toHaveLength(2);
  });

  test('keeps the named draft row after submitting its immutable set snapshot', async () => {
    const originalPrompt = window.prompt;
    window.prompt = () => 'Campaign set';
    const onFired = mock((_jobIds: string[]) => undefined);
    render(<RenderRequestsGrid brandId={BRAND} onFired={onFired} />);
    await screen.findByDisplayValue('Hola mundo');
    fireEvent.click((await screen.findAllByLabelText('Select row'))[0]!);
    expect(screen.getByText(/1 selected/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy());
    expect(screen.getByText(/READY · 1 ready · 0 blocked · 0 incomplete/)).toBeTruthy();
    expect(
      screen.getByText(/New fields, hierarchy, or unexposed layout changes require/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Render 1/ }));
    // The set is saved first; the batch only fires from the pre-flight dialog's Confirm.
    expect(await screen.findByText('Render 1 row')).toBeTruthy();
    expect(onFired).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));
    await waitFor(() => expect(onFired).toHaveBeenCalledWith([JOB.id]));
    await waitFor(() => expect(screen.getByDisplayValue('Root')).toBeTruthy());
    window.prompt = originalPrompt;
  });

  test('an intent loads its render set over the newest one', async () => {
    const savedSet = (id: string, name: string, label: string) => ({
      id,
      brandId: BRAND,
      bindingId: '44444444-4444-4444-8444-444444444444',
      name,
      templateKey: '133',
      contractHash: 'hash',
      revision: 1,
      rows: [
        {
          id: `${id.slice(0, -1)}9`,
          parentId: null,
          label,
          overrides: {},
          clearedKeys: [],
          outputIds: [],
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const newest = savedSet('55555555-5555-4555-8555-555555555551', 'Newest', 'Newest row');
    const older = savedSet('55555555-5555-4555-8555-555555555552', 'Older', 'Older row');
    listRenderSetsMock.mockImplementation(async () => ({ items: [newest, older], nextCursor: null }));

    const { rerender } = render(<RenderRequestsGrid brandId={BRAND} />);
    expect(await screen.findByDisplayValue('Newest row')).toBeTruthy();

    rerender(<RenderRequestsGrid brandId={BRAND} intent={{ templateKey: '133', renderSetId: older.id }} />);
    expect(await screen.findByDisplayValue('Older row')).toBeTruthy();
    expect(screen.queryByDisplayValue('Newest row')).toBeNull();
    listRenderSetsMock.mockImplementation(async () => ({ items: [], nextCursor: null }));
  });
});

describe('RenderJobsGrid', () => {
  test('lists the brand’s renders', async () => {
    render(<RenderJobsGrid brandId={BRAND} />);
    expect(await screen.findByText('forge_bench_starcraft')).toBeTruthy();
    expect(screen.getByText('Root')).toBeTruthy();
    expect(screen.getByText('Campaign set')).toBeTruthy();
    expect(screen.getByText('finished')).toBeTruthy();
    expect(screen.getByText(/1 render • 1 finished • 0 in flight/)).toBeTruthy();
  });
});
