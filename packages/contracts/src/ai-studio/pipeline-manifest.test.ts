import { describe, expect, it } from 'bun:test';
import {
  PIPELINE_CATALOG_ROUTE,
  PIPELINE_RUNS_ROUTE,
  type PipelineManifest,
  type PipelineManifestInput,
  pipelineBlockedReason,
  pipelineCapabilityListResponseSchema,
  pipelineCapabilitySchema,
  pipelineCapabilityV2Schema,
  pipelineInvocationRequestSchema,
  pipelineManifestSchema,
  pipelineRunReceiptSchema,
  pipelineRunRoute,
} from './pipeline-manifest';

const input = (over: Partial<PipelineManifestInput> = {}): PipelineManifestInput => ({
  port_id: 'brief',
  kind: 'text',
  required: true,
  consumer_node_type: 'nanoGen',
  handle_free: true,
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

describe('pipelineManifestSchema', () => {
  it('accepts the shape describePipeline produces', () => {
    expect(pipelineManifestSchema.parse(manifest()).pipeline_id).toBe('p-1');
  });

  // `.strict()` is the point: the Backend adds a field, the Frontend renders a stale one,
  // and a permissive schema lets that drift ship silently.
  it('refuses a field the contract does not declare', () => {
    expect(() => pipelineManifestSchema.parse({ ...manifest(), spend_cap: 5 })).toThrow();
  });
});

describe('pipelineBlockedReason', () => {
  it('says nothing about a pipeline that runs', () => {
    expect(pipelineBlockedReason(manifest())).toBeUndefined();
  });

  // The failure this whole manifest exists to surface early. Occupancy, not legality: the
  // port is type-legal and still unwritable, and without this it refuses inside runPipeline
  // as "no compatible handle" after a room has already been resolved.
  it('names the required port sitting on an occupied handle, and the repair', () => {
    const reason = pipelineBlockedReason(
      manifest({
        runnable: false,
        inputs: [input({ label: 'brief', handle_free: false })],
      }),
    );
    expect(reason).toContain('Required port brief is declared on a handle');
    expect(reason).toContain('republished against a free handle');
  });

  it('pluralises and lists every blocked port', () => {
    const reason = pipelineBlockedReason(
      manifest({
        runnable: false,
        inputs: [
          input({ port_id: 'brief', label: 'brief', handle_free: false }),
          input({ port_id: 'ref', label: 'reference', handle_free: false }),
        ],
      }),
    );
    expect(reason).toContain('Required ports brief, reference are declared');
    expect(reason).toContain('for them can never be written');
  });

  // An optional port on a fed handle is not a blocker — the caller was never going to
  // supply it. Reporting it would send the author to republish a pipeline that is fine.
  it('ignores an optional port whose handle is taken', () => {
    const reason = pipelineBlockedReason(
      manifest({
        runnable: false,
        inputs: [input({ required: false, handle_free: false })],
        headless: { ...manifest().headless, runnable_when_fed: false, blocked_when_fed: 'x' },
      }),
    );
    expect(reason).toBe('It needs a browser: x');
  });

  it('reports the generator cap when the graph is over it', () => {
    expect(
      pipelineBlockedReason(
        manifest({
          runnable: false,
          headless: { ...manifest().headless, over_cap: true, generators: 7 },
        }),
      ),
    ).toBe('It runs 7 generators, over the 3 one unattended run may start.');
  });

  it('falls back to a sentence rather than an empty string', () => {
    expect(pipelineBlockedReason(manifest({ runnable: false }))).toBe('It cannot run headlessly.');
  });
});

const uuid = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const identity = {
  family_id: uuid('1'),
  revision: 7,
  contract_hash: 'a'.repeat(64),
} as const;

const capabilityV2 = {
  contract_version: 2,
  pipeline_id: uuid('2'),
  identity,
  name: 'Product hero variations',
  description: 'Creates review-ready product hero images.',
  agent_guide: {
    version: 1,
    use_when: ['The user needs polished product hero images from an approved product Element.'],
    avoid_when: ['The user needs an editable multi-scene video.'],
    input_guidance: [
      {
        input_id: 'brief',
        instruction: 'State the campaign objective, desired setting, and intended audience.',
      },
      {
        input_id: 'product',
        instruction: 'Choose the exact approved product Element that must remain recognizable.',
      },
    ],
    invocation_notes: ['The pipeline applies its published product-photography craft automatically.'],
  },
  source: 'brand',
  inputs: [
    {
      input_id: 'brief',
      kind: 'text',
      label: 'Brief',
      required: true,
      semantic_role: 'creative_brief',
      min_length: 10,
      max_length: 2_000,
    },
    {
      input_id: 'product',
      kind: 'element',
      label: 'Product',
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
    {
      control_id: 'grade',
      kind: 'enum',
      label: 'Color grade',
      required: false,
      options: ['neutral', 'warm'],
      default: 'neutral',
    },
  ],
  outputs: [
    {
      output_id: 'hero',
      kind: 'asset',
      label: 'Hero image',
      media: 'image',
      count: 1,
    },
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
} as const;

describe('pipelineCapabilityV2Schema', () => {
  it('publishes immutable identity, semantic inputs, approved controls, outputs, and policy', () => {
    const parsed = pipelineCapabilityV2Schema.parse(capabilityV2);

    expect(parsed.identity).toEqual(identity);
    expect(parsed.inputs.map((item) => item.kind)).toEqual(['text', 'element']);
    expect(parsed.controls.map((item) => item.control_id)).toEqual(['blur_radius', 'grade']);
    expect(parsed.outputs.map((item) => item.kind)).toEqual(['asset', 'element_candidate']);
    expect(parsed.quality_policy.on_failure).toBe('refuse');
    expect(parsed.agent_guide?.input_guidance.map((item) => item.input_id)).toEqual([
      'brief',
      'product',
    ]);
  });

  it('keeps the guide optional for existing V2 rows and rejects guidance for undeclared inputs', () => {
    const { agent_guide: _guide, ...legacyV2 } = capabilityV2;
    expect(pipelineCapabilityV2Schema.parse(legacyV2)).not.toHaveProperty('agent_guide');
    expect(() =>
      pipelineCapabilityV2Schema.parse({
        ...capabilityV2,
        agent_guide: {
          ...capabilityV2.agent_guide,
          input_guidance: [{ input_id: 'private_node', instruction: 'Rewrite its prompt.' }],
        },
      }),
    ).toThrow(/declared public input/);
  });

  it('rejects mutable or ambiguous contract identity', () => {
    expect(() =>
      pipelineCapabilityV2Schema.parse({
        ...capabilityV2,
        identity: { ...identity, contract_hash: 'latest' },
      }),
    ).toThrow();
  });

  it('normalizes a V1 manifest as explicitly legacy without changing the V1 parser', () => {
    expect(pipelineManifestSchema.parse(manifest())).not.toHaveProperty('contract_version');
    expect(pipelineCapabilitySchema.parse(manifest())).toMatchObject({
      contract_version: 1,
      legacy: true,
      pipeline_id: 'p-1',
    });
  });

  it('uses a V2-only capability catalog envelope', () => {
    expect(
      pipelineCapabilityListResponseSchema.parse({ capabilities: [capabilityV2] }).capabilities[0]
        .contract_version,
    ).toBe(2);
    expect(() =>
      pipelineCapabilityListResponseSchema.parse({ capabilities: [manifest()] }),
    ).toThrow();
  });
});

describe('pipelineInvocationRequestSchema', () => {
  it('pins the requested contract and lets the server resolve an Element version set', () => {
    const request = pipelineInvocationRequestSchema.parse({
      brand_profile_id: uuid('3'),
      pipeline_id: capabilityV2.pipeline_id,
      identity,
      idempotency_key: 'launch-hero-01',
      origin: 'server_agent',
      inputs: {
        brief: { kind: 'text', value: 'A precise launch brief.' },
        product: {
          kind: 'element',
          element_id: uuid('4'),
        },
      },
      controls: { blur_radius: 12, grade: 'warm' },
    });

    expect(request.identity.revision).toBe(7);
    expect(request.inputs.product).toMatchObject({
      kind: 'element',
      element_id: uuid('4'),
    });
  });

  it('rejects an asset input without an exact version', () => {
    expect(() =>
      pipelineInvocationRequestSchema.parse({
        brand_profile_id: uuid('3'),
        pipeline_id: capabilityV2.pipeline_id,
        identity,
        idempotency_key: 'launch-hero-02',
        origin: 'client',
        inputs: {
          product: {
            kind: 'asset',
            assets: [{ asset_id: uuid('5') }],
          },
        },
        controls: {},
      }),
    ).toThrow();
  });

  it('rejects undeclared object-shaped control patches', () => {
    expect(() =>
      pipelineInvocationRequestSchema.parse({
        brand_profile_id: uuid('3'),
        pipeline_id: capabilityV2.pipeline_id,
        identity,
        idempotency_key: 'launch-hero-03',
        origin: 'service_provider',
        inputs: { brief: { kind: 'text', value: 'A precise launch brief.' } },
        controls: { blur_node: { radius: 12 } },
      }),
    ).toThrow();
  });
});

const passedQuality = {
  verdict: 'passed',
  score: 0.97,
  checks: [
    {
      check_id: 'product-identity-match',
      verdict: 'passed',
      score: 0.99,
      evidence: 'Packaging geometry and wordmark match the pinned reference.',
    },
  ],
} as const;

describe('pipelineRunReceiptSchema', () => {
  it('returns durable asset and candidate Element artifacts with provenance and quality evidence', () => {
    const receipt = pipelineRunReceiptSchema.parse({
      run_id: uuid('7'),
      brand_profile_id: uuid('3'),
      pipeline_id: capabilityV2.pipeline_id,
      identity,
      idempotency_key: 'launch-hero-01',
      origin: 'server_agent',
      status: 'completed',
      resolved_inputs: {
        brief: { kind: 'text', value: 'A precise launch brief.' },
        product: {
          kind: 'element',
          element_id: uuid('4'),
          reference_assets: [{ asset_id: uuid('5'), version_id: uuid('6') }],
        },
      },
      artifacts: [
        {
          artifact_id: uuid('8'),
          output_id: 'hero',
          kind: 'asset',
          media: 'image',
          asset: { asset_id: uuid('9'), version_id: uuid('10') },
          provenance: {
            run_id: uuid('7'),
            pipeline_id: capabilityV2.pipeline_id,
            identity,
            output_id: 'hero',
            generated_at: '2026-09-08T12:01:00.000Z',
          },
          quality: passedQuality,
        },
        {
          artifact_id: uuid('11'),
          output_id: 'product_candidate',
          kind: 'element_candidate',
          candidate: {
            candidate_id: uuid('12'),
            name: 'Launch bottle',
            category: 'product',
            guidelines: 'Keep the label and cap geometry exact.',
            rights_note: null,
            member_assets: [{ asset_id: uuid('9'), version_id: uuid('10') }],
            reference_asset: { asset_id: uuid('13'), version_id: uuid('14') },
          },
          provenance: {
            run_id: uuid('7'),
            pipeline_id: capabilityV2.pipeline_id,
            identity,
            output_id: 'product_candidate',
            generated_at: '2026-09-08T12:01:00.000Z',
          },
          quality: passedQuality,
        },
      ],
      cost: { amount_minor: null, currency: 'USD', generation_count: 2 },
      quality: passedQuality,
      error: null,
      created_at: '2026-09-08T12:00:00.000Z',
      started_at: '2026-09-08T12:00:01.000Z',
      finished_at: '2026-09-08T12:01:00.000Z',
    });

    expect(receipt.artifacts[0]).toMatchObject({
      kind: 'asset',
      asset: { version_id: uuid('10') },
    });
    expect(receipt.artifacts[1]).toMatchObject({
      kind: 'element_candidate',
      candidate: { reference_asset: { version_id: uuid('14') } },
    });
    expect(receipt.resolved_inputs?.product).toMatchObject({
      kind: 'element',
      reference_assets: [{ version_id: uuid('6') }],
    });
    expect(receipt.cost).toMatchObject({ amount_minor: null, generation_count: 2 });

    expect(() =>
      pipelineRunReceiptSchema.parse({
        ...receipt,
        artifacts: [
          {
            ...receipt.artifacts[0],
            provenance: { ...receipt.artifacts[0]?.provenance, run_id: uuid('99') },
          },
        ],
      }),
    ).toThrow();
  });

  it('requires a structured error for refused, failed, and indeterminate runs', () => {
    expect(() =>
      pipelineRunReceiptSchema.parse({
        run_id: uuid('7'),
        brand_profile_id: uuid('3'),
        pipeline_id: capabilityV2.pipeline_id,
        identity,
        idempotency_key: 'launch-hero-01',
        origin: 'server_agent',
        status: 'refused',
        resolved_inputs: null,
        artifacts: [],
        cost: null,
        quality: null,
        error: null,
        created_at: '2026-09-08T12:00:00.000Z',
        started_at: null,
        finished_at: '2026-09-08T12:00:01.000Z',
      }),
    ).toThrow();

    expect(
      pipelineRunReceiptSchema.parse({
        run_id: uuid('7'),
        brand_profile_id: uuid('3'),
        pipeline_id: capabilityV2.pipeline_id,
        identity,
        idempotency_key: 'launch-hero-01',
        origin: 'server_agent',
        status: 'refused',
        resolved_inputs: null,
        artifacts: [],
        cost: null,
        quality: null,
        error: {
          code: 'quality_failed',
          message: 'The output did not meet the product identity threshold.',
          retryable: false,
          field: 'quality_policy',
          context: { check_id: 'product-identity-match' },
        },
        created_at: '2026-09-08T12:00:00.000Z',
        started_at: '2026-09-08T12:00:01.000Z',
        finished_at: '2026-09-08T12:01:00.000Z',
      }).error,
    ).toMatchObject({ code: 'quality_failed', retryable: false });
  });
});

describe('pipeline capability routes', () => {
  it('keeps list, invoke, and status paths in the shared contract', () => {
    expect(PIPELINE_CATALOG_ROUTE).toBe('/api/ai-studio/pipeline-capabilities');
    expect(PIPELINE_RUNS_ROUTE).toBe('/api/ai-studio/pipeline-runs');
    expect(pipelineRunRoute(uuid('7'))).toBe(`/api/ai-studio/pipeline-runs/${uuid('7')}`);
  });
});
