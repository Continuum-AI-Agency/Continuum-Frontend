import { describe, expect, it } from 'bun:test';
import { pipelinePublicationRequestSchema } from '../ai-studio/pipeline-publication';
import { flashPipelineCandidate, flashPipelineName } from './flash-pipeline-template';

describe('flashPipelineCandidate', () => {
  it('is a valid publication request: one open generator, ports on its free handles', () => {
    const candidate = flashPipelineCandidate({
      brandProfileId: '5f4d2b3a-9d2e-4a1b-8c7d-2e1f0a9b8c7d',
      withReference: true,
      ratio: '9:16',
      brandName: 'Vivo',
    });
    const parsed = pipelinePublicationRequestSchema.parse(candidate);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.edges).toHaveLength(0);
    expect(parsed.pipeline.inputPorts.map((p) => p.handleId)).toEqual([
      'prompt',
      'negative',
      'ref-image',
    ]);
    expect(parsed.pipeline.outputPorts[0]?.origin).toBe('terminal');
    expect(parsed.nodes[0]?.data.aspectRatio).toBe('9:16');
    expect(parsed.name).toBe(flashPipelineName(true));
    expect(parsed.agent_guide.input_guidance.map((g) => g.input_id)).toEqual([
      'prompt',
      'negative_prompt',
      'reference_image',
    ]);
  });
  it('leaves the reference port out when nothing could feed it', () => {
    const candidate = flashPipelineCandidate({
      brandProfileId: '5f4d2b3a-9d2e-4a1b-8c7d-2e1f0a9b8c7d',
      withReference: false,
    });
    const parsed = pipelinePublicationRequestSchema.parse(candidate);
    expect(parsed.pipeline.inputPorts).toHaveLength(2);
    expect(parsed.name).toBe(flashPipelineName(false));
  });
});
