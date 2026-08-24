import { describe, expect, it } from 'bun:test';
import {
  canvasTechniqueMetadataSchema,
  joinWorkflowFragments,
  parallelWorkflowPlanSchema,
  parseTechniqueMetadata,
  TECHNIQUE_METADATA_FLAG,
  type WorkflowFragment,
  workflowFragmentPortSchema,
} from './workflow-fragment';

const plan = parallelWorkflowPlanSchema.parse({
  objective: 'Build a creator product ad',
  modules: [
    {
      id: 'character',
      label: 'Character reference',
      kind: 'reference',
      objective: 'Prepare the character reference branch.',
      allowedNodeTypes: ['string', 'nanoGen'],
      inputPorts: [],
      outputPorts: [{ id: 'character-image', description: 'Character image' }],
    },
    {
      id: 'product',
      label: 'Product reference',
      kind: 'reference',
      objective: 'Prepare the product reference branch.',
      allowedNodeTypes: ['string', 'nanoGen'],
      inputPorts: [],
      outputPorts: [{ id: 'product-image', description: 'Product image' }],
    },
    {
      id: 'shots',
      label: 'Shot sequence',
      kind: 'generation',
      objective: 'Create the talking-head shot branch.',
      allowedNodeTypes: ['string', 'videoGen'],
      inputPorts: [
        { id: 'character-image', description: 'Character reference', role: 'ref-images' },
        { id: 'product-image', description: 'Product reference', role: 'ref-images' },
      ],
      outputPorts: [{ id: 'clip', description: 'Generated clip' }],
    },
  ],
  joins: [
    {
      from: { kind: 'module', moduleId: 'character', portId: 'character-image' },
      to: { moduleId: 'shots', portId: 'character-image' },
    },
    {
      from: { kind: 'module', moduleId: 'product', portId: 'product-image' },
      to: { moduleId: 'shots', portId: 'product-image' },
    },
  ],
});

const fragments: WorkflowFragment[] = [
  {
    version: 1,
    moduleId: 'character',
    label: 'Character reference',
    summary: 'Character prompt and image generator.',
    nodes: [
      { ref: 'prompt', type: 'string', data: { value: 'Consistent creator portrait' } },
      { ref: 'image', type: 'nanoGen' },
    ],
    connections: [{ from_ref: 'prompt', to_ref: 'image', role: 'prompt' }],
    inputPorts: [],
    outputPorts: [{ id: 'character-image', nodeRef: 'image' }],
  },
  {
    version: 1,
    moduleId: 'product',
    label: 'Product reference',
    summary: 'Product prompt and image generator.',
    nodes: [
      { ref: 'prompt', type: 'string', data: { value: 'Exact product packshot' } },
      { ref: 'image', type: 'nanoGen' },
    ],
    connections: [{ from_ref: 'prompt', to_ref: 'image', role: 'prompt' }],
    inputPorts: [],
    outputPorts: [{ id: 'product-image', nodeRef: 'image' }],
  },
  {
    version: 1,
    moduleId: 'shots',
    label: 'Shot sequence',
    summary: 'Prompt and video generator.',
    nodes: [
      { ref: 'prompt', type: 'string', data: { value: 'Direct-to-camera creator hook' } },
      { ref: 'clip', type: 'videoGen' },
    ],
    connections: [{ from_ref: 'prompt', to_ref: 'clip', role: 'prompt' }],
    inputPorts: [
      { id: 'character-image', nodeRef: 'clip' },
      { id: 'product-image', nodeRef: 'clip' },
    ],
    outputPorts: [{ id: 'clip', nodeRef: 'clip' }],
  },
];

describe('parallelWorkflowPlanSchema', () => {
  it('rejects duplicate module ids before any workers run', () => {
    const duplicate = {
      ...plan,
      modules: [...plan.modules, { ...plan.modules[0] }],
    };
    expect(parallelWorkflowPlanSchema.safeParse(duplicate).success).toBe(false);
  });

  it('rejects joins that name undeclared module ports', () => {
    const invalid = {
      ...plan,
      joins: [
        {
          from: { kind: 'module', moduleId: 'character', portId: 'missing' },
          to: { moduleId: 'shots', portId: 'character-image' },
        },
      ],
    };
    expect(parallelWorkflowPlanSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('joinWorkflowFragments', () => {
  it('namespaces isolated fragments and connects their declared ports deterministically', () => {
    const joined = joinWorkflowFragments({ plan, fragments });

    expect(joined.ok).toBe(true);
    expect(joined.errors).toEqual([]);
    expect(joined.nodes.map((node) => node.ref)).toEqual([
      'character:prompt',
      'character:image',
      'product:prompt',
      'product:image',
      'shots:prompt',
      'shots:clip',
    ]);
    expect(joined.connections).toContainEqual({
      from_ref: 'character:image',
      to_ref: 'shots:clip',
      role: 'ref-images',
    });
    expect(joined.connections).toContainEqual({
      from_ref: 'product:image',
      to_ref: 'shots:clip',
      role: 'ref-images',
    });
    expect(joined.modules.map((module) => module.id)).toEqual(['character', 'product', 'shots']);
  });

  it('can join an existing Canvas node into an isolated fragment input', () => {
    const externalPlan = parallelWorkflowPlanSchema.parse({
      objective: 'Animate an existing product image with a separate prompt module',
      modules: [
        {
          id: 'motion',
          label: 'Motion',
          kind: 'generation',
          objective: 'Animate the supplied image.',
          allowedNodeTypes: ['string', 'videoGen'],
          inputPorts: [{ id: 'product-image', description: 'Existing image', role: 'ref-images' }],
          outputPorts: [{ id: 'clip', description: 'Video output' }],
        },
        {
          id: 'cta',
          label: 'CTA',
          kind: 'generation',
          objective: 'Create a CTA still.',
          allowedNodeTypes: ['nanoGen'],
          inputPorts: [],
          outputPorts: [{ id: 'cta-image', description: 'CTA still' }],
        },
      ],
      joins: [
        {
          from: { kind: 'canvas_node', nodeId: 'existing-product' },
          to: { moduleId: 'motion', portId: 'product-image' },
        },
      ],
    });
    const externalFragments: WorkflowFragment[] = [
      {
        version: 1,
        moduleId: 'motion',
        label: 'Motion',
        summary: 'Motion branch',
        nodes: [
          { ref: 'prompt', type: 'string', data: { value: 'Slow product orbit' } },
          { ref: 'clip', type: 'videoGen' },
        ],
        connections: [{ from_ref: 'prompt', to_ref: 'clip', role: 'prompt' }],
        inputPorts: [{ id: 'product-image', nodeRef: 'clip' }],
        outputPorts: [{ id: 'clip', nodeRef: 'clip' }],
      },
      {
        version: 1,
        moduleId: 'cta',
        label: 'CTA',
        summary: 'CTA branch',
        nodes: [{ ref: 'image', type: 'nanoGen', data: { positivePrompt: 'CTA packshot' } }],
        connections: [],
        inputPorts: [],
        outputPorts: [{ id: 'cta-image', nodeRef: 'image' }],
      },
    ];

    const joined = joinWorkflowFragments({ plan: externalPlan, fragments: externalFragments });
    expect(joined.ok).toBe(true);
    expect(joined.connections).toContainEqual({
      from_ref: 'existing-product',
      to_ref: 'motion:clip',
      role: 'ref-images',
    });
  });

  it('refuses the whole join when a worker omits a declared port', () => {
    const broken = fragments.map((fragment) =>
      fragment.moduleId === 'shots' ? { ...fragment, inputPorts: [] } : fragment,
    );
    const joined = joinWorkflowFragments({ plan, fragments: broken });

    expect(joined.ok).toBe(false);
    expect(joined.errors.join('\n')).toContain('shots');
    expect(joined.errors.join('\n')).toContain('character-image');
  });
});

describe('canvas technique metadata', () => {
  const port = { id: 'in-1', nodeRef: 'node-a', handleId: 'ref-image', dataType: 'image' as const };

  it('accepts a technique block with typed, origin-tagged ports', () => {
    const parsed = canvasTechniqueMetadataSchema.parse({
      version: 1,
      kind: 'generation',
      inputPorts: [{ ...port, label: 'Reference image', origin: 'edge' }],
      outputPorts: [
        { id: 'out-1', nodeRef: 'node-b', handleId: 'image', dataType: 'image', origin: 'terminal' },
      ],
    });

    expect(parsed.inputPorts[0]?.origin).toBe('edge');
    expect(parsed.outputPorts[0]?.dataType).toBe('image');
  });

  it('keeps the fragment port caps and rejects an unknown field', () => {
    const overflowing = {
      version: 1,
      kind: 'reference',
      inputPorts: Array.from({ length: 13 }, (_, index) => ({
        id: `in-${index + 1}`,
        nodeRef: 'node-a',
      })),
      outputPorts: [],
    };
    expect(canvasTechniqueMetadataSchema.safeParse(overflowing).success).toBe(false);

    const stray = {
      version: 1,
      kind: 'reference',
      inputPorts: [{ ...port, mystery: true }],
      outputPorts: [],
    };
    expect(canvasTechniqueMetadataSchema.safeParse(stray).success).toBe(false);
  });

  it('reads the block off a metadata bag and ignores every other row', () => {
    const technique = { version: 1, kind: 'assembly', inputPorts: [], outputPorts: [] };

    expect(parseTechniqueMetadata({ [TECHNIQUE_METADATA_FLAG]: technique })?.kind).toBe('assembly');
    expect(parseTechniqueMetadata({ starter: true })).toBeUndefined();
    expect(parseTechniqueMetadata(null)).toBeUndefined();
    expect(parseTechniqueMetadata(undefined)).toBeUndefined();
    // A malformed block is not a Technique — never a throw at a read boundary.
    expect(parseTechniqueMetadata({ [TECHNIQUE_METADATA_FLAG]: { version: 2 } })).toBeUndefined();
  });

  it('leaves the agent fragment port schema unwidened', () => {
    // The Backend hand-duplicates this schema as an LLM Output.object; a field
    // added here silently changes what a model is asked to emit.
    const withHandle = workflowFragmentPortSchema.safeParse({
      id: 'p',
      nodeRef: 'n',
      handleId: 'ref-image',
    });
    expect(withHandle.success).toBe(false);
  });
});
