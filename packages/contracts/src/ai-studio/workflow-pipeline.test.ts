import { describe, expect, test } from 'bun:test';
import {
  canvasPipelineMetadataSchema,
  PIPELINE_METADATA_FLAG,
  parsePipelineMetadata,
  parseTechniqueMetadata,
  TECHNIQUE_METADATA_FLAG,
} from './workflow-fragment';

const ports = {
  version: 1 as const,
  kind: 'generation' as const,
  inputPorts: [{ id: 'in-1', nodeRef: 'gen', handleId: 'ref-image' }],
  outputPorts: [{ id: 'out-1', nodeRef: 'gen', handleId: 'image' }],
};

describe('publishing is a separate act from saving', () => {
  // The guard that matters: every shipped Technique is a demonstration, and without a
  // separate flag all of them would be silently eligible for the DCO to run unattended
  // against a live ad account.
  test('a Technique is not a Pipeline', () => {
    const metadata = { [TECHNIQUE_METADATA_FLAG]: ports };
    expect(parseTechniqueMetadata(metadata)).toBeDefined();
    expect(parsePipelineMetadata(metadata)).toBeUndefined();
  });

  test('a published Pipeline parses', () => {
    const metadata = { [PIPELINE_METADATA_FLAG]: ports };
    expect(parsePipelineMetadata(metadata)?.inputPorts).toHaveLength(1);
  });

  // A workflow can be both: dropped in by hand AND runnable unattended. Publishing does
  // not take the hand-wiring affordance away.
  test('a row may carry both, and each reader sees its own', () => {
    const metadata = { [TECHNIQUE_METADATA_FLAG]: ports, [PIPELINE_METADATA_FLAG]: ports };
    expect(parseTechniqueMetadata(metadata)).toBeDefined();
    expect(parsePipelineMetadata(metadata)).toBeDefined();
  });

  test('a plain saved workflow is neither', () => {
    expect(parsePipelineMetadata({ starter: true })).toBeUndefined();
    expect(parsePipelineMetadata(null)).toBeUndefined();
  });

  test('publishedAt rides the contract so a stale one is legible', () => {
    const at = '2026-09-04T00:00:00.000Z';
    expect(
      parsePipelineMetadata({ [PIPELINE_METADATA_FLAG]: { ...ports, publishedAt: at } })
        ?.publishedAt,
    ).toBe(at);
  });

  test('the port shape is shared, so inference has one implementation', () => {
    expect(canvasPipelineMetadataSchema.safeParse(ports).success).toBe(true);
  });
});
