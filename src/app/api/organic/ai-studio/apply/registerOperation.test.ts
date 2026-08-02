import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

import { APPLY_OPERATION, buildApplyRegisterOperation } from './registerOperation';

const input = {
  brandProfileId: '33333333-3333-4333-8333-333333333333',
  userId: '44444444-4444-4444-8444-444444444444',
  draftId: 'draft-9',
  bucket: 'brand-profile-assets',
  storagePath: '33333333-3333-4333-8333-333333333333/organic-planner/draft-9/1-1-hero.png',
  fileName: '1-1-hero.png',
  mimeType: 'image/png',
  kind: 'image' as const,
  sizeBytes: 68,
  width: 1024,
  height: 1024,
};

describe('buildApplyRegisterOperation', () => {
  it('builds a Creative Operations payload rather than a raw assets row', () => {
    const operation = buildApplyRegisterOperation(input);

    expect(operation.action).toBe('register_generated_asset');
    expect(operation.brandId).toBe(input.brandProfileId);
    expect(operation.bucket).toBe(input.bucket);
    expect(operation.storagePath).toBe(input.storagePath);
    expect(operation.fileName).toBe(input.fileName);
    expect(operation.mimeType).toBe('image/png');
    expect(operation.kind).toBe('image');
    expect(operation.sizeBytes).toBe(68);
    expect(operation.width).toBe(1024);
    expect(operation.height).toBe(1024);
    expect(operation.source).toBe('ai_generated');
    expect(operation.operation).toBe(APPLY_OPERATION);
  });

  it('keeps the draft on the provenance record', () => {
    const operation = buildApplyRegisterOperation(input);
    expect(operation.originRef).toMatchObject({ draftId: 'draft-9', surface: 'organic_planner' });
  });

  // The Backend registers Studio generations with this exact derivation. Both sides
  // must land on the same key for the same stored object, or the same bytes would be
  // registered twice as two different assets.
  it('derives the idempotency key exactly as the Backend does', () => {
    const operation = buildApplyRegisterOperation(input);
    const expected = createHash('sha256')
      .update(`${input.bucket}\0${input.storagePath}`)
      .digest('hex');

    expect(operation.idempotencyKey).toBe(`generated:${expected}`);
  });

  it('produces a stable key for the same object across calls', () => {
    expect(buildApplyRegisterOperation(input).idempotencyKey).toBe(
      buildApplyRegisterOperation({ ...input, draftId: 'a-different-draft' }).idempotencyKey,
    );
  });

  it('defaults absent dimensions to null instead of dropping them', () => {
    const operation = buildApplyRegisterOperation({
      ...input,
      width: undefined,
      height: undefined,
      sizeBytes: undefined,
    });

    expect(operation.width).toBeNull();
    expect(operation.height).toBeNull();
    expect(operation.sizeBytes).toBeNull();
  });

  it('rejects a payload the RPC would refuse, at the boundary', () => {
    expect(() => buildApplyRegisterOperation({ ...input, brandProfileId: 'not-a-uuid' })).toThrow();
  });
});
