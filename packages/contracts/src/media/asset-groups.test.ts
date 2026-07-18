import { describe, expect, it } from 'bun:test';
import { assetGroupSchema } from './asset-groups';

describe('assetGroupSchema', () => {
  it('keeps a competitor carousel as one ordered connected group', () => {
    const group = assetGroupSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      brandId: '22222222-2222-4222-8222-222222222222',
      kind: 'carousel',
      externalKey: 'competitor_organic:p1',
      members: [
        { assetId: '33333333-3333-4333-8333-333333333333', position: 0 },
        { assetId: '44444444-4444-4444-8444-444444444444', position: 1 },
      ],
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    });
    expect(group.members.map((member) => member.position)).toEqual([0, 1]);
  });

  it('rejects duplicate positions', () => {
    expect(
      assetGroupSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        brandId: '22222222-2222-4222-8222-222222222222',
        kind: 'carousel',
        members: [
          { assetId: '33333333-3333-4333-8333-333333333333', position: 0 },
          { assetId: '44444444-4444-4444-8444-444444444444', position: 0 },
        ],
        createdAt: '2026-07-16T00:00:00.000Z',
        updatedAt: '2026-07-16T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});
