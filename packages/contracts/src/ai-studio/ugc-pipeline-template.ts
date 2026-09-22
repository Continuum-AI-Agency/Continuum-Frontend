// The UGC talking head every caller can run: one persona Element, three spoken shots, one
// stitched mp4. Published from code per brand (the way the optimizer publishes its flash
// flow), so MCP, Jaina and the Library all find the same contract.
//
// What stays OUTSIDE the graph, on purpose: captions (script-timed captions need the shot
// timings and a subtitles step that does not run headless), the brand watermark and the
// music bed. Organic's own UGC path adds those in its server recipe, which starts with the
// same `video.stitch` step this graph ends on.
//
// The description is brand-agnostic so the contract hash is identical for every brand; only
// the pipeline id differs. Change anything here and every brand republishes on next use.

import type { PipelinePublicationRequest } from './pipeline-publication';

export const UGC_PIPELINE_NAME = 'UGC talking head';
export const UGC_PIPELINE_SHOT_COUNT = 3;
export const UGC_PIPELINE_SHOT_SECONDS = 8;
export const UGC_PIPELINE_PERSONA_PORT = 'persona';
export const UGC_PIPELINE_OUTPUT_PORT = 'ugc_video';
export const UGC_PIPELINE_STITCH_NODE = 'stitch';

export const ugcPipelineShotPort = (shot: number): string => `shot_${shot}`;
export const ugcPipelineVeoNode = (shot: number): string => `shot_${shot}_veo`;

const SHOTS = Array.from({ length: UGC_PIPELINE_SHOT_COUNT }, (_, index) => index + 1);

// The part of the UGC prompt policy a graph can hold: a wired prompt replaces a Veo node's
// own prompt outright, but the negative prompt is never overwritten by a wire.
const NEGATIVE_PROMPT =
  'on-screen text, captions, subtitles, logos, watermarks, a different person, a second speaker, ' +
  'distorted face, extra fingers, lip-sync drift, music drowning out the voice';

// The canonical image-reference handle a Veo node renders in `images` mode.
const REFERENCE_HANDLE = 'ref-images';

export function ugcTalkingHeadPipelineCandidate(input: {
  brandProfileId: string;
}): PipelinePublicationRequest {
  const veoNodes = SHOTS.map((shot) => ({
    id: ugcPipelineVeoNode(shot),
    type: 'videoGen' as const,
    position: { x: 0, y: (shot - 1) * 360 },
    data: {
      model: 'veo-3.1-fast',
      prompt: '',
      negativePrompt: NEGATIVE_PROMPT,
      enhancePrompt: false,
      aspectRatio: '9:16',
      resolution: '720p',
      durationSeconds: UGC_PIPELINE_SHOT_SECONDS,
      referenceMode: 'images',
      generateAudio: true,
    },
  }));

  return {
    brand_profile_id: input.brandProfileId,
    name: UGC_PIPELINE_NAME,
    description:
      'A 9:16 talking-head UGC video: one persona Element speaks three 8-second shots with ' +
      "Veo's native voice, stitched in order into one mp4. No captions, watermark or music — " +
      'add those downstream. Created from code; edit freely in AI Studio.',
    nodes: [
      ...veoNodes,
      {
        id: UGC_PIPELINE_STITCH_NODE,
        type: 'action',
        position: { x: 600, y: 360 },
        data: { actionId: 'video.stitch', config: { transition: 'none', transitionSec: 0.5 } },
      },
    ],
    // Order is the cut order: the stitch step takes its inputs in edge order.
    edges: SHOTS.map((shot) => ({
      id: `${ugcPipelineVeoNode(shot)}-${UGC_PIPELINE_STITCH_NODE}`,
      source: ugcPipelineVeoNode(shot),
      sourceHandle: 'video',
      target: UGC_PIPELINE_STITCH_NODE,
      targetHandle: 'in',
    })),
    pipeline: {
      version: 1,
      kind: 'generation',
      inputPorts: [
        {
          id: UGC_PIPELINE_PERSONA_PORT,
          nodeRef: ugcPipelineVeoNode(1),
          handleId: REFERENCE_HANDLE,
          alsoFeeds: SHOTS.slice(1).map((shot) => ({
            nodeRef: ugcPipelineVeoNode(shot),
            handleId: REFERENCE_HANDLE,
          })),
          dataType: 'image',
          label: 'Persona',
          origin: 'open',
          pipelineBinding: { kind: 'element', allowedCategories: ['character', 'model'] },
        },
        ...SHOTS.map((shot) => ({
          id: ugcPipelineShotPort(shot),
          nodeRef: ugcPipelineVeoNode(shot),
          handleId: 'prompt',
          dataType: 'text' as const,
          label: `Shot ${shot}`,
          origin: 'open' as const,
        })),
      ],
      outputPorts: [
        {
          id: UGC_PIPELINE_OUTPUT_PORT,
          nodeRef: UGC_PIPELINE_STITCH_NODE,
          handleId: 'video',
          dataType: 'video',
          label: 'UGC video',
          origin: 'terminal',
        },
      ],
    },
    agent_guide: {
      version: 1,
      use_when: [
        'A short vertical UGC video of a recurring creator speaking to camera.',
        'The same persona Element should front a video on any surface (MCP, Jaina, AI Studio).',
      ],
      avoid_when: [
        'Captions, a brand watermark or a music bed are required in the file itself.',
        'The creator must be a real person without a rights note on their Element.',
        'Product-only footage with nobody on camera.',
      ],
      input_guidance: [
        {
          input_id: UGC_PIPELINE_PERSONA_PORT,
          instruction:
            'A character or model Element with a rights note and a default reference; it is the face in every shot.',
        },
        ...SHOTS.map((shot) => ({
          input_id: ugcPipelineShotPort(shot),
          instruction:
            `Shot ${shot}: framing and motion, then the exact line the creator says in double quotes. ` +
            "Repeat the persona's voice fact verbatim so every shot keeps one voice. No on-screen text.",
        })),
      ],
      invocation_notes: [
        'Returns one 24-second 9:16 mp4 with native speech; each shot renders at 8 seconds.',
        'One attempt per run: a rejected video is refused, not regenerated.',
      ],
    },
  };
}
