import { describe, expect, test } from 'bun:test';
import {
  templateAuthoringPreparationArtifactSchema,
  templateAuthoringPreparationRequestSchema,
  templateAuthoringPreparationSchema,
} from './template-authoring-preparation';

const ids = {
  artifactId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  brandId: '33333333-3333-4333-8333-333333333333',
  assetId: '44444444-4444-4444-8444-444444444444',
  baseVersionId: '55555555-5555-4555-8555-555555555555',
};
const hashes = { sourceChecksum: 'a'.repeat(64), commandDigest: 'b'.repeat(64), packageChecksum: 'c'.repeat(64) };

describe('private authoring preparation contracts', () => {
  test('pins every owner, version, revision and byte digest strictly', () => {
    expect(templateAuthoringPreparationArtifactSchema.parse({ ...ids, ...hashes, draftRevision: 3 })).toEqual({
      ...ids, ...hashes, draftRevision: 3,
    });
    expect(templateAuthoringPreparationArtifactSchema.safeParse({ ...ids, ...hashes, draftRevision: 3, path: '/tmp/private.zip' }).success).toBe(false);
  });

  test('preparation request cannot supply a storage path or native run id', () => {
    const request = { artifactId: ids.artifactId, expectedDraftRevision: 3, ...hashes };
    expect(templateAuthoringPreparationRequestSchema.parse(request)).toEqual(request);
    expect(templateAuthoringPreparationRequestSchema.safeParse({ ...request, runId: 'foreign' }).success).toBe(false);
  });

  test('status distinguishes private preparation from draft-ready and pending native proof', () => {
    expect(templateAuthoringPreparationSchema.parse({
      artifactId: ids.artifactId,
      scope: { brandId: ids.brandId, assetId: ids.assetId, baseVersionId: ids.baseVersionId },
      userId: ids.userId,
      draftRevision: 3,
      ...hashes,
      state: 'submitted',
      runId: 'forge-run-1',
      forgeState: 'created',
      progress: null,
      errorCode: null,
      updatedAt: '2026-10-12T00:00:00.000Z',
    }).state).toBe('submitted');
  });
});
