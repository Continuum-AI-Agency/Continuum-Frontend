import { describe, expect, test } from 'bun:test';
import {
  hyperframesClientRenderSpecSchema,
  organicHyperframeClientRenderSpecSchema,
} from '../media/client-render';
import { bulkHyperframeBriefSchema } from '../streaming/bulk';
import { organicHyperframeAssetSchema } from '../streaming/organic-pipeline';
import {
  hyperframesAgentNodeDataSchema,
  hyperframesAgentTurnRequestSchema,
} from './hyperframes-agent';
import { shaderStackV1Schema } from './shader-stack';

const shaderStack = {
  version: 1 as const,
  effects: [{ effectId: 'film_grain' as const, parameters: { amount: 0.35 } }],
};
const parsedShaderStack = shaderStackV1Schema.parse(shaderStack);

describe('shader stack transport', () => {
  test('survives HyperFrames node and turn contracts', () => {
    expect(hyperframesAgentNodeDataSchema.parse({ shaderStack }).shaderStack).toEqual(
      parsedShaderStack,
    );
    expect(
      hyperframesAgentTurnRequestSchema.parse({
        canvasId: 'canvas-1',
        nodeId: 'node-1',
        prompt: 'Add texture',
        shaderStack,
      }).shaderStack,
    ).toEqual(parsedShaderStack);
  });

  test('survives HyperFrames and Organic client-render contracts', () => {
    expect(
      hyperframesClientRenderSpecSchema.parse({
        kind: 'hyperframes_agent',
        runId: '00000000-0000-4000-8000-000000000001',
        canvasId: 'canvas-1',
        nodeId: 'node-1',
        shaderStack,
        origin: { label: 'HyperFrames', viewHref: '/ai-studio' },
      }).shaderStack,
    ).toEqual(parsedShaderStack);
    expect(
      organicHyperframeClientRenderSpecSchema.parse({
        kind: 'organic_hyperframe',
        draftId: '00000000-0000-4000-8000-000000000002',
        compositionId: 'composition-1',
        htmlPath: 'brand/composition.html',
        durationSeconds: 10,
        width: 1080,
        height: 1920,
        shaderStack,
        origin: { label: 'Organic HyperFrame', viewHref: '/organic' },
      }).shaderStack,
    ).toEqual(parsedShaderStack);
  });

  test('survives Organic planning and persisted asset contracts', () => {
    expect(
      bulkHyperframeBriefSchema.parse({
        stylePreset: 'kinetic-type',
        tone: 'high-energy',
        aspectRatio: '9:16',
        durationSec: 10,
        shaderStack,
      }).shaderStack,
    ).toEqual(parsedShaderStack);
    expect(
      organicHyperframeAssetSchema.parse({
        generated: true,
        compositionId: 'composition-1',
        shaderStack,
      }).shaderStack,
    ).toEqual(parsedShaderStack);
  });
});
