import { afterEach, describe, expect, it, mock } from 'bun:test';
import { ACCOUNT_DETECTOR_META, type JainaHyperframeSet } from '@continuum/contracts';
import { cleanup, render, waitFor } from '@testing-library/react';

// The part carries a durable bucket and path, never a signed url — a signed url lasts about
// an hour and a transcript is read back months later. The surface signs on demand.
const signed: Array<{ bucket: string; path: string }> = [];
let signResult: string | null = 'https://signed.example/frame.html';
mock.module('@/lib/jaina/brandScope', () => ({
  useJainaBrandScope: () => ({ brandId: 'b1', adAccountId: 'act_1' }),
  JainaBrandScopeProvider: ({ children }: { children: unknown }) => children,
}));
mock.module('@/lib/organic/hyperframeSign', () => ({
  signHyperframeAsset: async (params: { bucket: string; path: string }) => {
    signed.push({ bucket: params.bucket, path: params.path });
    return signResult;
  },
}));

const { JainaOptimizerHyperframes } = await import('./JainaOptimizerHyperframes');

const set = (over: Partial<JainaHyperframeSet> = {}): JainaHyperframeSet => ({
  read_id: 'read-abc',
  read_day: '2026-09-21',
  frames: [
    {
      candidate_id: 'dead_tail:acct',
      detector: 'dead_tail',
      composition: 'figure-top',
      bucket: 'hyperframes-compositions',
      path: 'b1/cards/abc.html',
      width: 1080,
      height: 1080,
      duration_seconds: 6,
    },
  ],
  ...over,
});

afterEach(() => {
  signed.length = 0;
  signResult = 'https://signed.example/frame.html';
  cleanup();
});

describe('a compiled card inside an answer', () => {
  it('signs the durable pair it was given, and shows the document', async () => {
    const { container } = render(<JainaOptimizerHyperframes sets={[set()]} />);
    await waitFor(() => {
      expect(signed).toEqual([{ bucket: 'hyperframes-compositions', path: 'b1/cards/abc.html' }]);
      const frame = container.querySelector('iframe');
      expect(frame?.getAttribute('src')).toBe('https://signed.example/frame.html');
    });
  });

  it('runs the document with no scripts at all — the animation is pure CSS', async () => {
    const { container } = render(<JainaOptimizerHyperframes sets={[set()]} />);
    await waitFor(() => {
      const frame = container.querySelector('iframe');
      expect(frame).toBeTruthy();
      // An empty sandbox is the narrowest there is; `allow-scripts` would be a choice.
      expect(frame?.getAttribute('sandbox')).toBe('');
    });
  });

  it('says so when the document cannot be reached, rather than showing a blank box', async () => {
    signResult = null;
    const { getByTestId, container } = render(<JainaOptimizerHyperframes sets={[set()]} />);
    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeNull();
      expect(getByTestId('optimizer-hyperframe').textContent).toContain('could not be loaded');
    });
  });

  // Bound to the catalogue, not to a guess at the wording: the caption is the detector's own
  // label, which is a human phrase ("Spending on nothing"), never its id.
  it('names the detector by its catalogue label, so a card is identifiable before it paints', () => {
    const { getByTestId } = render(<JainaOptimizerHyperframes sets={[set()]} />);
    const text = getByTestId('optimizer-hyperframe').textContent ?? '';
    expect(text).toContain(ACCOUNT_DETECTOR_META.dead_tail.label);
    expect(text).not.toContain('dead_tail');
  });

  it('keeps the square the card was compiled at, instead of guessing a height', () => {
    const { getByTestId } = render(<JainaOptimizerHyperframes sets={[set()]} />);
    const box = getByTestId('optimizer-hyperframe').querySelector('div');
    expect(box?.getAttribute('style')).toContain('1080 / 1080');
  });

  it('draws every frame in a set, each signed on its own', async () => {
    const two = set({
      frames: [
        set().frames[0],
        { ...set().frames[0], candidate_id: 'audience_overlap:acct', detector: 'audience_overlap', path: 'b1/cards/def.html' },
      ],
    });
    const { container } = render(<JainaOptimizerHyperframes sets={[two]} />);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="optimizer-hyperframe"]').length).toBe(2);
      expect(signed.map((s) => s.path).sort()).toEqual(['b1/cards/abc.html', 'b1/cards/def.html']);
    });
  });

  it('says which day the figures are from, because a figure without a date cannot be checked', () => {
    const { container } = render(<JainaOptimizerHyperframes sets={[set()]} />);
    expect(container.textContent).toContain('read of 2026-09-21');
  });

  it('renders nothing at all outside a brand scope', () => {
    const { container } = render(<JainaOptimizerHyperframes sets={[]} />);
    expect(container.querySelector('[data-testid="optimizer-hyperframe"]')).toBeNull();
  });
});
