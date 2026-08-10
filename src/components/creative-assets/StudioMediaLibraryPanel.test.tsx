import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { MediaAsset, OnboardingInspirationsStreamFrame } from '@continuum/contracts';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { SourceFilterValue } from '@/lib/media/filters';

// Ticket #251 — the Inspiration folder was a plain `source = 'inspiration'`
// equality with only two writers (both behind an explicit "Save to Library"
// click in competitor ad spy), so most brands opened it to the generic
// "No assets in the library yet." with nothing to do about it.
//
// The Frontend half is this panel: a real grid for the folder, a Regenerate
// action that re-runs the competitor pull and re-reads the folder, and an empty
// state that says why it is empty instead of implying the whole library is.

(globalThis as any).IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// The filter bar is a heavy standalone control; the panel only needs it to be
// able to select the Inspiration source, which is what this stand-in does.
mock.module('@/components/library/LibraryFilterBar', () => ({
  LibraryFilterBar: ({
    onSourceChange,
  }: {
    onSourceChange: (value: SourceFilterValue) => void;
  }) => (
    <button
      type="button"
      data-testid="pick-inspiration"
      onClick={() => onSourceChange('inspiration')}
    >
      Inspiration
    </button>
  ),
}));

mock.module('@/components/library/reformat/QuickReformatMenu', () => ({
  QuickReformatMenu: () => null,
}));

let streamFrames: OnboardingInspirationsStreamFrame[] = [];
let streamError: Error | null = null;
let streamCalls = 0;

mock.module('@/lib/onboarding/inspirationsClient', () => ({
  streamInspirations: async (params: {
    brandId: string;
    onFrame: (frame: OnboardingInspirationsStreamFrame) => void;
  }) => {
    streamCalls += 1;
    if (streamError) throw streamError;
    for (const frame of streamFrames) params.onFrame(frame);
  },
}));

const { StudioMediaLibraryPanel } = await import('./StudioMediaLibraryPanel');

const asset = (id: string): MediaAsset =>
  ({
    id,
    brandId: 'brand-1',
    kind: 'image',
    source: 'inspiration',
    fileName: `${id}.jpg`,
    title: `Inspiration ${id}`,
    signedUrl: `https://example.test/${id}.jpg`,
    tags: [],
  }) as unknown as MediaAsset;

const postPulled = (id: string): OnboardingInspirationsStreamFrame =>
  ({
    type: 'post_pulled',
    data: { competitorName: 'Rival Co', post: { id, imageUrl: `https://example.test/${id}.jpg` } },
  }) as unknown as OnboardingInspirationsStreamFrame;

// Sequenced list responses: each call to GET /api/library/assets pops the next
// page from this queue, so a re-read after a pull can return different rows.
let listPages: MediaAsset[][] = [];
let listRequests: string[] = [];

const installFetch = () => {
  (globalThis as any).fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    listRequests.push(url);
    const items = listPages.length > 1 ? (listPages.shift() ?? []) : (listPages[0] ?? []);
    return {
      ok: true,
      status: 200,
      json: async () => ({ items, nextOffset: null }),
    } as unknown as Response;
  };
};

const selectInspiration = async (getByTestId: (id: string) => HTMLElement) => {
  await act(async () => {
    fireEvent.click(getByTestId('pick-inspiration'));
  });
};

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

describe('StudioMediaLibraryPanel — Inspiration folder (#251)', () => {
  beforeEach(() => {
    streamFrames = [];
    streamError = null;
    streamCalls = 0;
    listPages = [[]];
    listRequests = [];
    installFetch();
  });

  afterEach(cleanup);

  it('renders a populated grid for the Inspiration folder', async () => {
    listPages = [[asset('a'), asset('b'), asset('c'), asset('d')]];
    const { getByTestId, queryByTestId, getAllByRole } = render(
      <StudioMediaLibraryPanel brandProfileId="brand-1" />,
    );
    await settle();
    await selectInspiration(getByTestId);
    await settle();

    expect(listRequests.some((url) => url.includes('source=inspiration'))).toBe(true);
    expect(getAllByRole('img').length).toBe(4);
    expect(queryByTestId('studio-inspiration-empty')).toBeNull();
    // A populated folder still offers the tester's "regenerate" affordance.
    expect(getByTestId('studio-inspiration-regenerate')).toBeTruthy();
  });

  it('explains why the folder is empty instead of blaming the whole library', async () => {
    const { getByTestId, queryByText } = render(
      <StudioMediaLibraryPanel brandProfileId="brand-1" />,
    );
    await settle();
    await selectInspiration(getByTestId);
    await settle();

    const empty = getByTestId('studio-inspiration-empty');
    expect(empty.textContent).toContain('No inspiration saved yet');
    expect(empty.textContent).toContain('competitor creative');
    expect(queryByText('No assets in the library yet.')).toBeNull();
    expect(getByTestId('studio-inspiration-regenerate')).toBeTruthy();
  });

  it('regenerating pulls a new set and re-reads the folder so the grid fills', async () => {
    listPages = [[], [asset('a'), asset('b'), asset('c')]];
    streamFrames = [postPulled('a'), postPulled('b'), postPulled('c')];

    const { getByTestId, getAllByRole } = render(
      <StudioMediaLibraryPanel brandProfileId="brand-1" />,
    );
    await settle();
    await selectInspiration(getByTestId);
    await settle();

    await act(async () => {
      fireEvent.click(getByTestId('studio-inspiration-regenerate'));
    });
    await settle();

    expect(streamCalls).toBe(1);
    await waitFor(() => expect(getAllByRole('img').length).toBe(3));
  });

  it('surfaces a failed pull instead of silently looking empty again', async () => {
    streamError = new Error('upstream exploded');
    const { getByTestId } = render(<StudioMediaLibraryPanel brandProfileId="brand-1" />);
    await settle();
    await selectInspiration(getByTestId);
    await settle();

    await act(async () => {
      fireEvent.click(getByTestId('studio-inspiration-regenerate'));
    });
    await settle();

    expect(getByTestId('studio-inspiration-error').textContent).toContain("Couldn't pull");
  });

  it('says so when the pull completes but returns nothing', async () => {
    streamFrames = [];
    const { getByTestId } = render(<StudioMediaLibraryPanel brandProfileId="brand-1" />);
    await settle();
    await selectInspiration(getByTestId);
    await settle();

    await act(async () => {
      fireEvent.click(getByTestId('studio-inspiration-regenerate'));
    });
    await settle();

    expect(getByTestId('studio-inspiration-error').textContent).toContain('Add competitors');
  });
});
