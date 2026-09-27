import { describe, expect, test } from 'bun:test';
import { libraryBrowseQuerySchema } from '@continuum/contracts';
import {
  browseNarrowingPredicate,
  isNarrowed,
  libraryBrowseRpcArgs,
  reviewPrefilterStatuses,
} from './browse-args';

const brandId = '11111111-1111-4111-8111-111111111111';

describe('libraryBrowseRpcArgs destinations', () => {
  test('Home sends p_destination and aspect-ratio bins by name', () => {
    const args = libraryBrowseRpcArgs(
      libraryBrowseQuerySchema.parse({
        brandId,
        destination: 'home',
        aspectRatios: ['9:16', '1:1'],
      }),
    );
    expect(args.p_destination).toBe('home');
    expect(args.p_aspect_ratios).toEqual(['9:16', '1:1']);
    expect(args.p_media_type).toBe('all');
  });

  test('omits destination and aspect when the caller is on the legacy dump', () => {
    const args = libraryBrowseRpcArgs(libraryBrowseQuerySchema.parse({ brandId }));
    expect(args.p_destination).toBeNull();
    expect(args.p_aspect_ratios).toBeNull();
  });
});

describe('browse narrowing — custom review states and field filters', () => {
  const LEGAL = 'state-legal';
  const asset = (id: string, review_status: string, review_state_id: string | null = null) => ({
    id,
    review_status,
    review_state_id,
  });
  const unfiltered = { kind: 'unfiltered' } as const;

  test("'Approved' + 'Legal' (a state under In review) keeps both, not only Legal", () => {
    const passes = browseNarrowingPredicate(['approved'], {
      reviewStateIds: [LEGAL],
      fieldConstraint: unfiltered,
    });
    expect(passes(asset('a', 'approved'))).toBe(true);
    expect(passes(asset('b', 'in_review', LEGAL))).toBe(true);
    expect(passes(asset('c', 'in_review'))).toBe(false);
    expect(passes(asset('d', 'draft'))).toBe(false);
  });

  test('a base alone includes its custom states; a state alone is only that state', () => {
    const baseWithState = browseNarrowingPredicate(['approved'], {
      reviewStateIds: [LEGAL],
      fieldConstraint: unfiltered,
    });
    expect(baseWithState(asset('a', 'approved', 'state-other'))).toBe(true);
    const stateOnly = browseNarrowingPredicate([], {
      reviewStateIds: [LEGAL],
      fieldConstraint: unfiltered,
    });
    expect(stateOnly(asset('a', 'approved', LEGAL))).toBe(true);
    expect(stateOnly(asset('b', 'approved'))).toBe(false);
  });

  test('field constraints AND with the review choice', () => {
    const passes = browseNarrowingPredicate(['approved'], {
      reviewStateIds: [LEGAL],
      fieldConstraint: { kind: 'ids', ids: ['a'] },
    });
    expect(passes(asset('a', 'approved'))).toBe(true);
    expect(passes(asset('b', 'approved'))).toBe(false);
    const excluding = browseNarrowingPredicate([], {
      reviewStateIds: [],
      fieldConstraint: { kind: 'exclude', ids: ['a'] },
    });
    expect(excluding(asset('a', 'draft'))).toBe(false);
    expect(excluding(asset('b', 'draft'))).toBe(true);
  });

  test('the RPC pre-filters on the chosen bases plus each state’s base, every other filter intact', () => {
    const statuses = reviewPrefilterStatuses(['approved'], ['in_review', 'approved']);
    expect(statuses).toEqual(['approved', 'in_review']);
    const args = libraryBrowseRpcArgs(
      libraryBrowseQuerySchema.parse({
        brandId,
        reviewStatuses: statuses,
        placements: ['feed'],
        used: true,
        shared: false,
      }),
    );
    expect(args.p_review_statuses).toEqual(['approved', 'in_review']);
    expect(args.p_placements).toEqual(['feed']);
    expect(args.p_used).toBe(true);
    expect(args.p_shared).toBe(false);
  });

  test('narrowed only when a state or a field filter is on', () => {
    expect(isNarrowed({ reviewStateIds: [], fieldConstraint: unfiltered })).toBe(false);
    expect(isNarrowed({ reviewStateIds: [LEGAL], fieldConstraint: unfiltered })).toBe(true);
    expect(isNarrowed({ reviewStateIds: [], fieldConstraint: { kind: 'ids', ids: [] } })).toBe(
      true,
    );
  });
});
