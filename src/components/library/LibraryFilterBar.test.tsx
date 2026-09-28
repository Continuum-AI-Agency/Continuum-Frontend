import { afterEach, describe, expect, it, mock } from 'bun:test';
import { type CustomField, HDR_DYNAMIC_RANGES } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { StructuredLibraryFilters } from '@/lib/media/filters';
import { LibraryFilterBar } from './LibraryFilterBar';

// A brand with custom fields also gets the sort-by-field picker, which reads the router.
mock.module('next/navigation', () => ({
  usePathname: () => '/library',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    replace: () => undefined,
    push: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    refresh: () => undefined,
  }),
}));

afterEach(() => cleanup());

const BRAND_ID = '00000000-0000-4000-8000-000000000001';

function field(overrides: Partial<CustomField> & Pick<CustomField, 'id' | 'name' | 'type'>) {
  return {
    brandId: BRAND_ID,
    options: [],
    position: 0,
    isDefault: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } satisfies CustomField;
}

// The seeded ★ select, named in lower case to prove the match ignores case.
const RATING_SELECT = field({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'rating',
  type: 'single_select',
  options: ['★', '★★', '★★★', '★★★★', '★★★★★'].map((label, index) => ({
    id: `r${index + 1}`,
    label,
  })),
});
const USAGE_RIGHTS = field({
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Usage rights',
  type: 'single_select',
  options: [{ id: 'unlimited', label: 'Unlimited' }],
});

function renderPageBar(
  props: {
    structuredFilters?: StructuredLibraryFilters;
    familyCounts?: Record<string, number>;
    customFields?: CustomField[];
    mediaType?: 'all' | 'carousel';
    selectedTags?: string[];
  } = {},
) {
  const onStructuredFiltersChange = mock((_filters: StructuredLibraryFilters) => undefined);
  const onMediaTypeChange = mock((_value: string) => undefined);
  render(
    <LibraryFilterBar
      source="all"
      kind="all"
      onSourceChange={() => {}}
      onKindChange={() => {}}
      mediaType={props.mediaType ?? 'all'}
      onMediaTypeChange={onMediaTypeChange}
      createdWith={[]}
      onCreatedWithChange={() => {}}
      selectedTags={props.selectedTags ?? []}
      onTagsChange={() => {}}
      customFields={props.customFields}
      structuredFilters={props.structuredFilters ?? {}}
      onStructuredFiltersChange={onStructuredFiltersChange}
      familyCounts={props.familyCounts}
    />,
  );
  return { onStructuredFiltersChange, onMediaTypeChange };
}

function openFilters(name = 'Filter') {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('LibraryFilterBar', () => {
  it('labels source and format filters on embedded surfaces', () => {
    render(
      <LibraryFilterBar
        source="all"
        kind="all"
        onSourceChange={() => {}}
        onKindChange={() => {}}
        variant="compact"
      />,
    );

    expect(screen.getByRole('group', { name: 'Filter by source' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Filter by format' })).toBeDefined();
  });

  it('can omit the redundant source row on the full Library page', () => {
    render(
      <LibraryFilterBar
        source="all"
        kind="all"
        onSourceChange={() => {}}
        onKindChange={() => {}}
        showSource={false}
      />,
    );

    expect(screen.queryByRole('group', { name: 'Filter by source' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Filter by format' })).toBeDefined();
  });

  it('collapses page taxonomy and tags into one searchable filter control', () => {
    render(
      <LibraryFilterBar
        source="all"
        kind="all"
        onSourceChange={() => {}}
        onKindChange={() => {}}
        mediaType="all"
        onMediaTypeChange={() => {}}
        createdWith={[]}
        onCreatedWithChange={() => {}}
        tagOptions={[
          { tag: 'launch', count: 12 },
          { tag: 'winning', count: 7 },
        ]}
        selectedTags={['launch']}
        onTagsChange={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Filter 1' })).toBeDefined();
    expect(screen.getByText('launch')).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Filter by format' })).toBeNull();
  });

  it('lists every format group with its count and toggles one into families', () => {
    const { onStructuredFiltersChange, onMediaTypeChange } = renderPageBar({
      structuredFilters: { families: ['image'] },
      familyCounts: { video: 12, image: 30, design: 0 },
    });
    openFilters('Filter 1');
    const format = within(screen.getByRole('group', { name: 'Format' }));

    const video = format.getByRole('button', { name: /^Video/ });
    expect(video.textContent).toBe('Video12');
    expect(format.getByRole('button', { name: /^Design/ }).textContent).toBe('Design0');
    expect(format.getByRole('button', { name: /^Image/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    for (const label of ['Audio', 'Document', '3D', 'HTML', 'Archive', 'Other']) {
      expect(format.getByRole('button', { name: new RegExp(`^${label}`) })).toBeDefined();
    }

    fireEvent.click(video);
    expect(onStructuredFiltersChange).toHaveBeenLastCalledWith({ families: ['image', 'video'] });

    // Carousels is not a file format; it stays the carousel media type.
    fireEvent.click(format.getByRole('button', { name: 'Carousels' }));
    expect(onMediaTypeChange).toHaveBeenLastCalledWith('carousel');
  });

  it('maps a resolution preset, the HDR toggle and typed bounds onto ranges and technical', () => {
    const { onStructuredFiltersChange } = renderPageBar();
    openFilters();

    fireEvent.click(screen.getByRole('button', { name: '4K+' }));
    expect(onStructuredFiltersChange).toHaveBeenLastCalledWith({
      ranges: { resolution: { min: 2160 } },
    });

    fireEvent.click(screen.getByRole('button', { name: 'HDR' }));
    expect(onStructuredFiltersChange).toHaveBeenLastCalledWith({
      technical: { dynamicRanges: [...HDR_DYNAMIC_RANGES] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'ProRes' }));
    expect(onStructuredFiltersChange).toHaveBeenLastCalledWith({
      technical: { videoCodecs: ['prores'] },
    });

    const minDuration = screen.getByRole('spinbutton', { name: 'Minimum duration in s' });
    fireEvent.change(minDuration, { target: { value: '30' } });
    fireEvent.blur(minDuration);
    expect(onStructuredFiltersChange).toHaveBeenLastCalledWith({
      ranges: { durationMs: { min: 30_000 } },
    });

    const minBitRate = screen.getByRole('spinbutton', { name: 'Minimum bit rate in Mb/s' });
    fireEvent.change(minBitRate, { target: { value: '1.5' } });
    fireEvent.blur(minBitRate);
    expect(onStructuredFiltersChange).toHaveBeenLastCalledWith({
      ranges: { bitRate: { min: 1_500_000 } },
    });
  });

  it('keeps a min typed past the max a valid range by swapping the two', () => {
    const { onStructuredFiltersChange } = renderPageBar({
      structuredFilters: { ranges: { sizeBytes: { max: 5_000_000 } } },
    });
    openFilters('Filter 1');

    const minSize = screen.getByRole('spinbutton', { name: 'Minimum file size in MB' });
    fireEvent.change(minSize, { target: { value: '100' } });
    fireEvent.blur(minSize);
    expect(onStructuredFiltersChange).toHaveBeenLastCalledWith({
      ranges: { sizeBytes: { min: 5_000_000, max: 100_000_000 } },
    });
  });

  it('maps Rating ≥ 4 onto the brand Rating select as option position 4', () => {
    // A filter already on hides "Save as collection", which would otherwise read the brand role.
    const { onStructuredFiltersChange } = renderPageBar({
      structuredFilters: { families: ['video'] },
      customFields: [USAGE_RIGHTS, RATING_SELECT],
    });
    openFilters('Filter 1');

    fireEvent.click(screen.getByRole('button', { name: 'Rated 4 or more' }));
    expect(onStructuredFiltersChange).toHaveBeenLastCalledWith({
      families: ['video'],
      fieldRanges: [{ fieldId: RATING_SELECT.id, min: 4 }],
    });
  });

  it('hides the Rating control when the brand has no Rating field', () => {
    renderPageBar({ structuredFilters: { families: ['video'] }, customFields: [USAGE_RIGHTS] });
    openFilters('Filter 1');

    expect(screen.queryByRole('button', { name: 'Rated 4 or more' })).toBeNull();
    expect(screen.getByRole('button', { name: '4K+' })).toBeDefined();
  });

  it('counts every active filter in the badge and removes one chip at a time', () => {
    const structuredFilters: StructuredLibraryFilters = {
      families: ['video', 'design'],
      ranges: { resolution: { min: 2160 }, durationMs: { min: 30_000 } },
      technical: { videoCodecs: ['prores'], dynamicRanges: [...HDR_DYNAMIC_RANGES] },
      fieldRanges: [{ fieldId: RATING_SELECT.id, min: 4 }],
    };
    const { onStructuredFiltersChange } = renderPageBar({
      structuredFilters,
      customFields: [RATING_SELECT],
      mediaType: 'carousel',
      selectedTags: ['launch'],
    });

    // Carousels + 7 structured filters + 1 tag.
    expect(screen.getByRole('button', { name: 'Filter 9' })).toBeDefined();
    for (const label of ['Video', 'Design', '≥ 30 s', '4K+', 'ProRes', 'HDR', '★ 4+']) {
      expect(screen.getByRole('button', { name: `Remove ${label} filter` })).toBeDefined();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Remove 4K+ filter' }));
    expect(onStructuredFiltersChange).toHaveBeenLastCalledWith({
      ...structuredFilters,
      ranges: { durationMs: { min: 30_000 } },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove ★ 4+ filter' }));
    const { fieldRanges: _rating, ...withoutRating } = structuredFilters;
    expect(onStructuredFiltersChange).toHaveBeenLastCalledWith(withoutRating);
  });
});
