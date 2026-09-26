import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  type PipelineCapabilityV2,
  type PipelinePublicationResponse,
  pipelineCapabilityV2Schema,
  pipelinePublicationRequestSchema,
  ugcTalkingHeadPipelineCandidate,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { pipelineCapabilitiesQueryKey } from '@/lib/ai-studio/pipelines';
import { PipelineProposalCard } from './PipelineProposalCard';
import type { ComposerPipelineProposal } from './useCanvasComposer';

const BRAND = '11111111-1111-4111-8111-111111111111';

// A real, schema-valid publication request, so the test publishes what the agent would send.
const request = ugcTalkingHeadPipelineCandidate({ brandProfileId: BRAND });

const capability: PipelineCapabilityV2 = pipelineCapabilityV2Schema.parse({
  contract_version: 2,
  pipeline_id: '33333333-3333-4333-8333-333333333333',
  identity: {
    family_id: '44444444-4444-4444-8444-444444444444',
    revision: 1,
    contract_hash: 'a'.repeat(64),
  },
  name: request.name,
  description: request.description,
  source: 'brand',
  inputs: [
    {
      input_id: 'shot_1',
      kind: 'text',
      label: 'Shot 1 line',
      required: true,
      semantic_role: 'script_line',
    },
  ],
  outputs: [
    {
      output_id: 'video',
      kind: 'asset',
      label: 'Talking-head video',
      media: 'video',
      count: 1,
      aspect_ratio: '9:16',
    },
  ],
  execution_policy: {
    runtime: 'server',
    timeout_seconds: 600,
    max_attempts: 1,
    max_generations: 3,
  },
  cost_policy: {
    currency: 'USD',
    max_amount_minor: null,
    approval: 'within_limit',
    on_exceed: 'refuse',
  },
  quality_policy: { minimum_score: 0.7, required_checks: ['persona_match'], on_failure: 'refuse' },
});

const proposal: ComposerPipelineProposal = { request, capability };

function renderCard(
  props: Partial<React.ComponentProps<typeof PipelineProposalCard>> = {},
  queryClient = new QueryClient(),
) {
  const onPublished = mock(() => {});
  const onDismiss = mock(() => {});
  const publish = mock(
    async (_input: unknown): Promise<PipelinePublicationResponse> => ({ capability }),
  );
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PipelineProposalCard
          proposal={proposal}
          onPublished={onPublished}
          onDismiss={onDismiss}
          publish={publish}
          {...props}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onPublished, onDismiss, publish };
}

afterEach(cleanup);

describe('PipelineProposalCard', () => {
  it('previews the proposed capability and prefills name and description', () => {
    renderCard();

    expect(screen.getByTestId('pipeline-contract')).toBeDefined();
    expect(screen.getByText(/Talking-head video \(video · 9:16\)/)).toBeDefined();
    expect(screen.getByText(/Up to 3 generations per run/)).toBeDefined();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(request.name);
    expect(
      (screen.getByLabelText('What it makes and when to use it') as HTMLTextAreaElement).value,
    ).toBe(request.description);
  });

  it('publishes the agent request with the edited name and description', async () => {
    const queryClient = new QueryClient();
    const invalidate = mock(queryClient.invalidateQueries.bind(queryClient));
    queryClient.invalidateQueries = invalidate as typeof queryClient.invalidateQueries;
    const { publish, onPublished } = renderCard({}, queryClient);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Founder UGC' } });
    fireEvent.change(screen.getByLabelText('What it makes and when to use it'), {
      target: { value: 'Makes a 9:16 founder talking-head video for launches.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish pipeline' }));

    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const sent = publish.mock.calls[0]?.[0];
    expect(sent).toEqual({
      ...request,
      name: 'Founder UGC',
      description: 'Makes a 9:16 founder talking-head video for launches.',
      created_via: 'canvas_agent',
    });
    expect(pipelinePublicationRequestSchema.safeParse(sent).success).toBe(true);
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toContainEqual(
      pipelineCapabilitiesQueryKey(BRAND),
    );
    // The card itself flips only when the parent records the outcome, so this is the toast.
    expect(await screen.findByText('Pipeline published')).toBeDefined();
  });

  it('refuses a blank description without calling the server', async () => {
    const { publish } = renderCard();

    fireEvent.change(screen.getByLabelText('What it makes and when to use it'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish pipeline' }));

    expect(
      await screen.findByText('Describe what this pipeline makes and when to use it.'),
    ).toBeDefined();
    expect(publish).not.toHaveBeenCalled();
  });

  it("shows the server's message inline when publishing fails", async () => {
    const { onPublished } = renderCard({
      publish: async () => {
        throw new Error('A pipeline named that already exists for this brand.');
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Publish pipeline' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'A pipeline named that already exists for this brand.',
    );
    expect(onPublished).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Publish pipeline' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('locks the card once published', () => {
    renderCard({ proposal: { ...proposal, outcome: 'published' } });

    expect(screen.getByText('Pipeline published')).toBeDefined();
    expect((screen.getByRole('button', { name: 'Published' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Dismiss' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true);
  });

  it('dismisses without publishing', () => {
    const { onDismiss, publish } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });
});
