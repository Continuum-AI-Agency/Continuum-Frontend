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
};

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    listEnvironments: async () => ({ items: [] }),
    listTemplates: async () => ({ items: [TEMPLATE], nextCursor: null }),
    getContract: async () => ({
      template: TEMPLATE,
      variables: VARIABLES,
      fonts: [],
      layout: null,
      divergence: [],
    }),
    listInputSets: async () => ({ items: [], nextCursor: null }),
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

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { RenderJobsGrid } from './RenderJobsGrid';
import { RenderRequestsGrid } from './RenderRequestsGrid';

const BRAND = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  cleanup();
  localStorage.clear();
  preflightMock.mockClear();
});

describe('RenderRequestsGrid', () => {
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
});

describe('RenderJobsGrid', () => {
  test('lists the brand’s renders', async () => {
    render(<RenderJobsGrid brandId={BRAND} />);
    expect(await screen.findByText('forge_bench_starcraft')).toBeTruthy();
    expect(screen.getByText('finished')).toBeTruthy();
    expect(screen.getByText(/1 render • 1 finished • 0 in flight/)).toBeTruthy();
  });
});
