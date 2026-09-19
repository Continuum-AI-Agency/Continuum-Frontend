// The simplest Creative+ pipeline that can make flash creatives, built when a brand has
// none: one image generator whose prompt, negative prompt and (optionally) reference-image
// handles are left open as pipeline ports, and whose four variations are the output.
//
// It is deliberately minimal — a person can open it in AI Studio and grow the middle (brand
// book pieces, a layer editor, a judge) without changing the contract the optimizer feeds.

import type { PipelinePublicationRequest } from '../ai-studio/pipeline-publication';

export const FLASH_PIPELINE_NAME = 'Flash creatives · paid ads';
export const FLASH_PIPELINE_GENERATOR_ID = 'flash-gen';

export type FlashPipelineTemplateInput = {
  brandProfileId: string;
  /** Declare a reference-image port. The port is required once declared, so only when the
   *  recommendations that will run it can hand a Library asset in. */
  withReference: boolean;
  /** Placement ratio the variants come in; defaults to the feed's 4:5. */
  ratio?: string | null;
  brandName?: string | null;
};

export function flashPipelineName(withReference: boolean): string {
  return withReference ? `${FLASH_PIPELINE_NAME} · with reference` : FLASH_PIPELINE_NAME;
}

export function flashPipelineCandidate(
  input: FlashPipelineTemplateInput,
): PipelinePublicationRequest {
  const gen = FLASH_PIPELINE_GENERATOR_ID;
  const brand = input.brandName?.trim() || 'the brand';
  const inputPorts: PipelinePublicationRequest['pipeline']['inputPorts'] = [
    {
      id: 'prompt',
      nodeRef: gen,
      handleId: 'prompt',
      dataType: 'text',
      label: 'Prompt',
      origin: 'open',
    },
    {
      id: 'negative_prompt',
      nodeRef: gen,
      handleId: 'negative',
      dataType: 'text',
      label: 'Negative prompt',
      origin: 'open',
    },
    ...(input.withReference
      ? [
          {
            id: 'reference_image',
            nodeRef: gen,
            handleId: 'ref-image',
            dataType: 'image' as const,
            label: 'Reference image',
            origin: 'open' as const,
          },
        ]
      : []),
  ];
  return {
    brand_profile_id: input.brandProfileId,
    name: flashPipelineName(input.withReference),
    description:
      `Fast static ad variations for ${brand}: takes the optimizer's prompt (angle, audience, ` +
      `offer) and a negative prompt${input.withReference ? ', plus the winning ad as reference' : ''}, ` +
      'and returns four image candidates in the placement ratio. Created by the optimizer; edit freely in AI Studio.',
    nodes: [
      {
        id: gen,
        type: 'nanoGen',
        position: { x: 0, y: 0 },
        data: {
          model: 'nano-banana-2',
          positivePrompt: '',
          negativePrompt: '',
          aspectRatio: input.ratio ?? '4:5',
          imageSize: '1K',
          variationCount: 4,
          maxReferenceImages: 3,
        },
      },
    ],
    edges: [],
    pipeline: {
      version: 1,
      kind: 'generation',
      inputPorts,
      outputPorts: [
        {
          id: 'flash_images',
          nodeRef: gen,
          dataType: 'image',
          label: 'Flash images',
          origin: 'terminal',
        },
      ],
    },
    agent_guide: {
      version: 1,
      use_when: [
        'Paid ad flash creatives: static image variations of a winning ad for the same audience.',
        'Developing a communication angle into several visual executions quickly.',
      ],
      avoid_when: [
        'Video, carousel or animated formats.',
        'Anything that must reproduce an exact product photo without a reference image.',
      ],
      input_guidance: [
        {
          input_id: 'prompt',
          instruction:
            'The full creative brief: angle, audience, offer, hook, format and what must stay true to the brand.',
        },
        {
          input_id: 'negative_prompt',
          instruction:
            'What must not appear: invented brand names, fake prices, text artefacts, off-brand styles.',
        },
        ...(input.withReference
          ? [
              {
                input_id: 'reference_image',
                instruction:
                  'The winning ad, so the variations keep its subject, palette and framing.',
              },
            ]
          : []),
      ],
      invocation_notes: [
        'Returns four candidates per run; keep the best three as flash slots.',
        'Placement ratio is fixed on the generator; republish with another ratio for stories.',
      ],
    },
  };
}
