import { describe, expect, it } from 'bun:test';
import { pipelinePublicationRequestSchema } from './pipeline-publication';
import {
  UGC_PIPELINE_OUTPUT_PORT,
  UGC_PIPELINE_PERSONA_PORT,
  UGC_PIPELINE_STITCH_NODE,
  ugcPipelineVeoNode,
  ugcTalkingHeadPipelineCandidate,
} from './ugc-pipeline-template';
import { canvasPipelineMetadataSchema } from './workflow-fragment';

const BRAND_A = '11111111-1111-4111-8111-111111111111';
const BRAND_B = '22222222-2222-4222-8222-222222222222';

describe('ugcTalkingHeadPipelineCandidate', () => {
  const candidate = ugcTalkingHeadPipelineCandidate({ brandProfileId: BRAND_A });

  it('is a valid publication request', () => {
    expect(pipelinePublicationRequestSchema.safeParse(candidate).success).toBe(true);
  });

  it('feeds ONE persona Element port into every Veo shot', () => {
    const persona = candidate.pipeline.inputPorts.find(
      (port) => port.id === UGC_PIPELINE_PERSONA_PORT,
    );
    expect(persona?.pipelineBinding).toEqual({
      kind: 'element',
      allowedCategories: ['character', 'model'],
    });
    const consumers = [
      { nodeRef: persona?.nodeRef, handleId: persona?.handleId },
      ...(persona?.alsoFeeds ?? []),
    ];
    expect(consumers).toEqual(
      [1, 2, 3].map((shot) => ({
        nodeRef: ugcPipelineVeoNode(shot),
        handleId: 'ref-images',
      })),
    );
  });

  it('takes one prompt per shot and returns only the stitched video', () => {
    const textPorts = candidate.pipeline.inputPorts.filter((port) => port.dataType === 'text');
    expect(textPorts.map((port) => [port.id, port.nodeRef, port.handleId])).toEqual([
      ['shot_1', 'shot_1_veo', 'prompt'],
      ['shot_2', 'shot_2_veo', 'prompt'],
      ['shot_3', 'shot_3_veo', 'prompt'],
    ]);
    expect(candidate.pipeline.outputPorts).toHaveLength(1);
    expect(candidate.pipeline.outputPorts[0]).toMatchObject({
      id: UGC_PIPELINE_OUTPUT_PORT,
      nodeRef: UGC_PIPELINE_STITCH_NODE,
      dataType: 'video',
      origin: 'terminal',
    });
  });

  it('renders 9:16, 8s Veo 3.1 Fast shots with native speech from reference images', () => {
    const veo = candidate.nodes.filter((node) => node.type === 'videoGen');
    expect(veo).toHaveLength(3);
    for (const node of veo) {
      expect(node.data).toMatchObject({
        model: 'veo-3.1-fast',
        aspectRatio: '9:16',
        durationSeconds: 8,
        referenceMode: 'images',
        generateAudio: true,
      });
    }
  });

  it('stitches the shots in order', () => {
    const stitch = candidate.nodes.find((node) => node.id === UGC_PIPELINE_STITCH_NODE);
    expect((stitch?.data as { actionId?: string }).actionId).toBe('video.stitch');
    expect(candidate.edges.map((edge) => edge.source)).toEqual([
      'shot_1_veo',
      'shot_2_veo',
      'shot_3_veo',
    ]);
    expect(candidate.edges.every((edge) => edge.target === UGC_PIPELINE_STITCH_NODE)).toBe(true);
  });

  it('is brand-agnostic apart from the brand id, so every brand gets the same contract hash', () => {
    const { brand_profile_id: _a, ...a } = candidate;
    const { brand_profile_id: _b, ...b } = ugcTalkingHeadPipelineCandidate({
      brandProfileId: BRAND_B,
    });
    expect(a).toEqual(b);
  });
});

describe('canvasPipelineMetadataSchema alsoFeeds', () => {
  const port = {
    id: 'out',
    nodeRef: 'gen',
    dataType: 'image' as const,
    origin: 'terminal' as const,
  };

  it('refuses a fan-out on an output port', () => {
    const parsed = canvasPipelineMetadataSchema.safeParse({
      version: 1,
      kind: 'generation',
      inputPorts: [],
      outputPorts: [{ ...port, alsoFeeds: [{ nodeRef: 'other' }] }],
    });
    expect(parsed.success).toBe(false);
  });
});
