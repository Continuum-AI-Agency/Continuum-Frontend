import { describe, expect, it } from 'bun:test';
import type {
  PipelineCapabilityV2,
  PipelineManifest,
  PipelineManifestInput,
} from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { PipelineContract } from './PipelineContract';

const input = (over: Partial<PipelineManifestInput> = {}): PipelineManifestInput => ({
  port_id: 'brief',
  kind: 'text',
  required: true,
  consumer_node_type: 'nanoGen',
  handle_free: true,
  label: 'brief',
  ...over,
});

const manifest = (over: Partial<PipelineManifest> = {}): PipelineManifest => ({
  pipeline_id: 'p-1',
  name: 'StarCraft concept art',
  source: 'brand',
  inputs: [input()],
  outputs: [{ port_id: 'concept', node_type: 'nanoGen', media: 'image', count: 1 }],
  headless: {
    runnable_headless: false,
    blocked: 'prompt is unwired',
    runnable_when_fed: true,
    blocked_when_fed: '',
    generators: 1,
    generator_cap: 3,
    over_cap: false,
    requires_authorisation: false,
  },
  runnable: true,
  ...over,
});

const capability = (over: Partial<PipelineCapabilityV2> = {}): PipelineCapabilityV2 =>
  ({
    contract_version: 2,
    pipeline_id: '33333333-3333-4333-8333-333333333333',
    identity: {
      family_id: '11111111-1111-4111-8111-111111111111',
      revision: 2,
      contract_hash: 'a'.repeat(64),
    },
    name: 'Product hero variations',
    source: 'brand',
    inputs: [
      {
        input_id: 'brief',
        kind: 'text',
        label: 'Creative brief',
        required: true,
        semantic_role: 'creative_brief',
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
        default: 8,
      },
    ],
    outputs: [
      { output_id: 'hero', kind: 'asset', label: 'Hero image', media: 'image', count: 2 },
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
      required_checks: ['product-identity-match', 'polish-level-match'],
      on_failure: 'refuse',
    },
    ...over,
  }) as PipelineCapabilityV2;

describe('PipelineContract', () => {
  it('shows the minimal required inputs and promised V2 outputs', () => {
    render(<PipelineContract manifest={capability()} />);

    expect(screen.getByText(/Creative brief \(text\)/)).toBeDefined();
    expect(screen.getByText(/Product Element \(element\)/)).toBeDefined();
    expect(screen.getByText(/Hero image \(2 images\)/)).toBeDefined();
    expect(screen.getByText(/Reusable product Element \(Element candidate\)/)).toBeDefined();
    expect(screen.getByText('Runnable')).toBeDefined();
    cleanup();
  });

  it('shows the cost ceiling and quality promise before a V2 run', () => {
    render(<PipelineContract manifest={capability()} />);

    expect(screen.getByText(/Up to \$5.00 USD/)).toBeDefined();
    expect(screen.getByText(/90% minimum/)).toBeDefined();
    expect(screen.getByText(/product identity match/)).toBeDefined();
    cleanup();
  });

  it('shows the published agent guide with its declared input guidance', () => {
    render(
      <PipelineContract
        manifest={capability({
          description: 'Turns an approved product reference into two launch heroes.',
          agent_guide: {
            version: 1,
            use_when: ['The user needs launch hero images.'],
            avoid_when: ['The user needs video.'],
            input_guidance: [
              { input_id: 'brief', instruction: 'State the audience and campaign objective.' },
            ],
            invocation_notes: ['Use the approved product Element.'],
          },
        })}
      />,
    );

    expect(screen.getByText('Turns an approved product reference into two launch heroes.')).toBeDefined();
    expect(screen.getByText(/The user needs launch hero images/)).toBeDefined();
    expect(screen.getByText(/State the audience and campaign objective/)).toBeDefined();
    cleanup();
  });

  // The whole reason this component exists: the Library listed pipelines with a name, a
  // description and an "Updated" date, so the one thing that made a row a pipeline — its
  // port contract — was the only thing you could not see.
  it('names the ports a caller must feed and what comes back', () => {
    render(<PipelineContract manifest={manifest()} />);
    expect(screen.getByText(/brief \(text\)/)).toBeDefined();
    expect(screen.getByText(/concept \(image\)/)).toBeDefined();
    expect(screen.getByText('Needs republish')).toBeDefined();
    expect(screen.getByText(/published with the legacy V1 contract/i)).toBeDefined();
    expect(screen.queryByText('Runnable')).toBeNull();
    cleanup();
  });

  // Occupancy, not legality. Before this the port was type-legal, permanently unwritable,
  // and refused only inside runPipeline after a room had been resolved.
  it('says a pipeline cannot run and names the port blocking it', () => {
    render(
      <PipelineContract
        manifest={manifest({ runnable: false, inputs: [input({ handle_free: false })] })}
      />,
    );
    expect(screen.getByText('Cannot run')).toBeDefined();
    expect(screen.getByText(/Required port brief is declared on a handle/)).toBeDefined();
    expect(screen.getByText(/republished against a free handle/)).toBeDefined();
    cleanup();
  });

  // variationCount multiplies every attempt — a node saved at 4 makes four images per
  // attempt and delivers one, so a 3-attempt refusal is twelve generations. Showing a flat
  // count per port is how that cost stayed invisible until the bill.
  it('surfaces how many assets an attempt actually generates', () => {
    render(
      <PipelineContract
        manifest={manifest({
          outputs: [{ port_id: 'concept', node_type: 'nanoGen', media: 'image', count: 4 }],
        })}
      />,
    );
    expect(screen.getByText(/4 generated per attempt/)).toBeDefined();
    cleanup();
  });

  it('does not claim a per-attempt count when each port yields one', () => {
    render(<PipelineContract manifest={manifest()} />);
    expect(screen.queryByText(/generated per attempt/)).toBeNull();
    cleanup();
  });

  it('marks a pipeline that needs an authorised run', () => {
    render(
      <PipelineContract
        manifest={manifest({
          headless: { ...manifest().headless, requires_authorisation: true },
        })}
      />,
    );
    expect(screen.getByText('Needs approval')).toBeDefined();
    cleanup();
  });
});
