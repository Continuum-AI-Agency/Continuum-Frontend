import { describe, expect, it } from 'bun:test';
import { resolvePlannerHandoff } from './planner-handoff';

const PABLO = 'd0028c83-1e1a-467e-bc81-36e72fb98f10';
const CBA = '877bee6d-7ffc-40ef-9f73-5a254f30e6be';
const DRAFT = '6f2fc3e4-e65b-4ca0-a811-3df8258c1af3';

describe('resolvePlannerHandoff', () => {
  it('returns a fixed Planner destination for an accessible brand and matching draft', () => {
    expect(
      resolvePlannerHandoff({
        brandId: PABLO,
        draftId: DRAFT,
        accessibleBrandIds: [CBA, PABLO],
        draftBrandId: PABLO,
      }),
    ).toEqual({
      brandId: PABLO,
      destination: `/organic?tab=planner&draftId=${DRAFT}`,
    });
  });

  it('opens the brand Planner without a draft when none is supplied', () => {
    expect(resolvePlannerHandoff({ brandId: PABLO, accessibleBrandIds: [PABLO] })).toEqual({
      brandId: PABLO,
      destination: '/organic?tab=planner',
    });
  });

  it('fails closed for an inaccessible brand or a draft from another brand', () => {
    expect(() => resolvePlannerHandoff({ brandId: PABLO, accessibleBrandIds: [CBA] })).toThrow(
      'Brand access denied',
    );
    expect(() =>
      resolvePlannerHandoff({
        brandId: PABLO,
        draftId: DRAFT,
        accessibleBrandIds: [PABLO],
        draftBrandId: CBA,
      }),
    ).toThrow('Draft does not belong to brand');
  });

  it('rejects malformed identifiers before any preference write', () => {
    expect(() =>
      resolvePlannerHandoff({ brandId: 'pablo', accessibleBrandIds: ['pablo'] }),
    ).toThrow('Invalid brand id');
    expect(() =>
      resolvePlannerHandoff({
        brandId: PABLO,
        draftId: 'latest',
        accessibleBrandIds: [PABLO],
      }),
    ).toThrow('Invalid draft id');
  });
});
