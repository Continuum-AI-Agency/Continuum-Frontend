import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const executePipelineMock = mock(() => Promise.resolve({} as never));

mock.module('@/lib/ai-studio/elements', () => ({
  ELEMENT_CATEGORY_LABEL: {
    model: 'Model',
    character: 'Character',
    product: 'Product',
    object: 'Object',
    material: 'Material',
    setting: 'Setting',
    location: 'Location',
    landscape: 'Landscape',
    style: 'Style',
    moodboard: 'Moodboard',
    palette: 'Palette',
    animation: 'Animation',
    effect: 'Effect',
    general: 'General',
  },
  useElements: () => ({
    elements: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Bottle system',
        category: 'product',
        members: [{ assetId: '55555555-5555-4555-8555-555555555555', position: 0 }],
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));

mock.module('@/lib/creative-assets/useStudioLibraryBrowser', () => ({
  useStudioLibraryBrowser: () => ({
    assets: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        headVersionId: '77777777-7777-4777-8777-777777777777',
        title: 'Bottle front',
        fileName: 'bottle-front.png',
        kind: 'image',
        mimeType: 'image/png',
        signedUrl: 'https://storage/bottle-front.png',
      },
    ],
    loading: false,
    hasMore: false,
    loadMore: () => {},
    query: '',
    setQuery: () => {},
    filters: { source: 'all', kind: 'image' },
    setFilters: () => {},
    error: null,
  }),
}));

import type { PipelineCapabilityV2, PipelineRunReceipt } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PipelineInvocationForm } from './PipelineInvocationForm';

const identity = {
  family_id: '11111111-1111-4111-8111-111111111111',
  revision: 2,
  contract_hash: 'a'.repeat(64),
};

const capability = {
  contract_version: 2,
  pipeline_id: '33333333-3333-4333-8333-333333333333',
  identity,
  name: 'Product hero variations',
  source: 'brand',
  inputs: [
    {
      input_id: 'brief',
      kind: 'text',
      label: 'Creative brief',
      required: true,
      semantic_role: 'creative_brief',
      min_length: 10,
      max_length: 2000,
    },
    {
      input_id: 'reference',
      kind: 'asset',
      label: 'Reference image',
      required: true,
      semantic_role: 'visual_reference',
      media: 'image',
      min_items: 1,
      max_items: 1,
    },
    {
      input_id: 'product',
      kind: 'element',
      label: 'Product Element',
      required: true,
      semantic_role: 'primary_subject',
      allowed_categories: ['product'],
      min_items: 1,
      max_items: 1,
    },
  ],
  controls: [
    {
      control_id: 'blur_radius',
      kind: 'number',
      label: 'Background blur',
      required: false,
      minimum: 0,
      maximum: 40,
      step: 1,
      default: 8,
    },
  ],
  outputs: [
    { output_id: 'hero', kind: 'asset', label: 'Hero image', media: 'image', count: 1 },
    {
      output_id: 'product_candidate',
      kind: 'element_candidate',
      label: 'Reusable product Element',
      category: 'product',
      count: 1,
    },
  ],
  execution_policy: {
    runtime: 'server',
    timeout_seconds: 300,
    max_attempts: 2,
    max_generations: 3,
  },
  cost_policy: {
    currency: 'USD',
    max_amount_minor: 500,
    approval: 'within_limit',
    on_exceed: 'refuse',
  },
  quality_policy: {
    minimum_score: 0.9,
    required_checks: ['product-identity-match'],
    on_failure: 'refuse',
  },
} as PipelineCapabilityV2;

const quality = {
  verdict: 'passed' as const,
  score: 0.97,
  checks: [
    {
      check_id: 'product-identity-match',
      verdict: 'passed' as const,
      score: 0.97,
      evidence: 'The product identity matches.',
    },
  ],
};

const completedReceipt = {
  run_id: '88888888-8888-4888-8888-888888888888',
  brand_profile_id: '22222222-2222-4222-8222-222222222222',
  pipeline_id: capability.pipeline_id,
  identity,
  idempotency_key: 'run-1',
  origin: 'client',
  status: 'completed',
  artifacts: [
    {
      artifact_id: '99999999-9999-4999-8999-999999999999',
      output_id: 'hero',
      kind: 'asset',
      media: 'image',
      asset: {
        asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        version_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      provenance: {
        run_id: '88888888-8888-4888-8888-888888888888',
        pipeline_id: capability.pipeline_id,
        identity,
        output_id: 'hero',
        generated_at: '2026-09-08T12:01:00.000Z',
      },
      quality,
    },
    {
      artifact_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      output_id: 'product_candidate',
      kind: 'element_candidate',
      candidate: {
        candidate_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        name: 'Launch bottle',
        category: 'product',
        guidelines: null,
        rights_note: null,
        member_assets: [
          {
            asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            version_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
        ],
        reference_asset: {
          asset_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          version_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        },
      },
      provenance: {
        run_id: '88888888-8888-4888-8888-888888888888',
        pipeline_id: capability.pipeline_id,
        identity,
        output_id: 'product_candidate',
        generated_at: '2026-09-08T12:01:00.000Z',
      },
      quality,
    },
  ],
  cost: { amount_minor: 238, currency: 'USD', generation_count: 2 },
  quality,
  error: null,
  created_at: '2026-09-08T12:00:00.000Z',
  started_at: '2026-09-08T12:00:01.000Z',
  finished_at: '2026-09-08T12:01:00.000Z',
} as PipelineRunReceipt;

describe('PipelineInvocationForm', () => {
  beforeEach(() => {
    executePipelineMock.mockReset();
  });

  afterEach(cleanup);

  it('shows required semantic inputs while keeping controls collapsed', () => {
    render(
      <PipelineInvocationForm
        brandId="22222222-2222-4222-8222-222222222222"
        capability={capability}
        executePipeline={executePipelineMock}
      />,
    );

    expect(screen.getByLabelText(/Creative brief/)).toBeDefined();
    expect(screen.getByText('Bottle front')).toBeDefined();
    expect(screen.getByText('Bottle system')).toBeDefined();
    expect(screen.queryByLabelText('Background blur')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Advanced/ }));
    expect(screen.getByLabelText('Background blur')).toBeDefined();
  });

  it('invokes with exact asset versions and displays outputs grouped by promise', async () => {
    executePipelineMock.mockResolvedValueOnce(completedReceipt as never);

    render(
      <PipelineInvocationForm
        brandId="22222222-2222-4222-8222-222222222222"
        capability={capability}
        executePipeline={executePipelineMock}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Creative brief/), {
      target: { value: 'A precise product launch brief' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Bottle front/ }));
    fireEvent.click(screen.getByRole('button', { name: /Bottle system/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Run pipeline' }));

    await waitFor(() => expect(executePipelineMock).toHaveBeenCalledTimes(1));
    expect(executePipelineMock.mock.calls[0]?.[0]).toMatchObject({
      brand_profile_id: '22222222-2222-4222-8222-222222222222',
      pipeline_id: capability.pipeline_id,
      identity,
      origin: 'client',
      inputs: {
        brief: { kind: 'text', value: 'A precise product launch brief' },
        reference: {
          kind: 'asset',
          assets: [
            {
              asset_id: '66666666-6666-4666-8666-666666666666',
              version_id: '77777777-7777-4777-8777-777777777777',
            },
          ],
        },
        product: {
          kind: 'element',
          element_id: '44444444-4444-4444-8444-444444444444',
        },
      },
      controls: { blur_radius: 8 },
    });

    expect(await screen.findByText('Hero image')).toBeDefined();
    expect(screen.getByText(/asset aaaaaaaa/)).toBeDefined();
    expect(screen.getByText(/version bbbbbbbb/)).toBeDefined();
    expect(screen.getByText('Reusable product Element')).toBeDefined();
    expect(screen.getByText('Launch bottle')).toBeDefined();
    expect(screen.getByText(/Candidate Element/)).toBeDefined();
  });

  it('does not send untouched optional inputs or controls', async () => {
    executePipelineMock.mockResolvedValueOnce(completedReceipt as never);
    const optionalCapability = {
      ...capability,
      inputs: [
        {
          input_id: 'direction',
          kind: 'text' as const,
          label: 'Extra direction',
          required: false,
          semantic_role: 'creative_direction',
          min_length: 10,
        },
      ],
      controls: [
        {
          control_id: 'contrast',
          kind: 'number' as const,
          label: 'Contrast',
          required: false,
          minimum: 0,
          maximum: 1,
        },
      ],
    } as PipelineCapabilityV2;

    render(
      <PipelineInvocationForm
        brandId="22222222-2222-4222-8222-222222222222"
        capability={optionalCapability}
        executePipeline={executePipelineMock}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run pipeline' }));

    await waitFor(() => expect(executePipelineMock).toHaveBeenCalledTimes(1));
    expect(executePipelineMock.mock.calls[0]?.[0]).toMatchObject({ inputs: {}, controls: {} });
  });
});
