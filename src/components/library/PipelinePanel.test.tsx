import { afterEach, describe, expect, it } from 'bun:test';
import type { PipelineCapabilityV2, PipelineManifest } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  brandPipelineManifestsQueryKey,
  pipelineCapabilitiesQueryKey,
} from '@/lib/ai-studio/pipelines';
import { PipelinePanel } from './PipelinePanel';

const brandId = '22222222-2222-4222-8222-222222222222';

const capability = {
  contract_version: 2,
  pipeline_id: '33333333-3333-4333-8333-333333333333',
  identity: {
    family_id: '11111111-1111-4111-8111-111111111111',
    revision: 2,
    contract_hash: 'a'.repeat(64),
  },
  name: 'Product hero variations',
  source: 'brand',
  inputs: [],
  controls: [],
  outputs: [{ output_id: 'hero', kind: 'asset', label: 'Hero image', media: 'image', count: 1 }],
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
    required_checks: ['polish-level-match'],
    on_failure: 'refuse',
  },
} as PipelineCapabilityV2;

const legacy = {
  pipeline_id: 'legacy-1',
  name: 'Old product workflow',
  source: 'brand',
  inputs: [],
  outputs: [{ port_id: 'hero', node_type: 'nanoGen', media: 'image', count: 1 }],
  headless: {
    runnable_headless: true,
    blocked: '',
    runnable_when_fed: true,
    blocked_when_fed: '',
    generators: 1,
    generator_cap: 3,
    over_cap: false,
    requires_authorisation: false,
  },
  runnable: true,
} as PipelineManifest;

function renderPanel({
  capabilities = [capability],
  manifests = [legacy],
}: {
  capabilities?: PipelineCapabilityV2[];
  manifests?: PipelineManifest[];
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(pipelineCapabilitiesQueryKey(brandId), capabilities);
  queryClient.setQueryData(brandPipelineManifestsQueryKey(brandId), manifests);
  return render(
    <QueryClientProvider client={queryClient}>
      <PipelinePanel brandId={brandId} />
    </QueryClientProvider>,
  );
}

describe('PipelinePanel', () => {
  afterEach(cleanup);

  it('shows runnable V2 capabilities and legacy manifests without offering legacy execution', () => {
    renderPanel();

    expect(screen.getByText('Product hero variations')).toBeDefined();
    expect(screen.getByText('Old product workflow')).toBeDefined();
    expect(screen.getAllByText('Needs republish')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Set up run' })).toHaveLength(1);
  });

  it('opens the manifest-driven form from a V2 card', async () => {
    renderPanel({ manifests: [] });

    fireEvent.click(screen.getByRole('button', { name: 'Set up run' }));

    expect(await screen.findByTestId('pipeline-invocation-form')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Run pipeline' })).toBeDefined();
  });

  it('keeps the existing empty-state direction when neither catalog has a pipeline', () => {
    renderPanel({ capabilities: [], manifests: [] });

    expect(screen.getByText('No pipelines published yet')).toBeDefined();
  });
});
