import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

// The compiled designs carry a durable bucket and path, never a signed url: the surface signs
// on demand, and an unsignable picture is drawn as the outline instead of a blank box.
const signed: Array<{ bucket: string; path: string }> = [];
let signResult: string | null = 'https://signed.example/structure.html';
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

const { JainaCampaignStructure, JainaCampaignStructures } = await import(
  './JainaCampaignStructure'
);
const { ScaffoldThreadContext } = await import('../scaffold/scaffoldThreadContext');
const { FIXTURE_PARENT_ID, LEADS_MTY_NODES, fixtureHtmlPath, fixtureStructure } = await import(
  './campaignStructure.fixtures'
);

afterEach(() => {
  signed.length = 0;
  signResult = 'https://signed.example/structure.html';
  cleanup();
});

const names = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-testid="structure-node-name"]')].map((node) => node.textContent);

describe('09 · the outline', () => {
  it('names every node of the structure and nests them by level', () => {
    const { getByTestId } = render(
      <JainaCampaignStructure structure={fixtureStructure('outline')} />,
    );
    const outline = getByTestId('campaign-structure-outline');
    expect(names(outline)).toEqual(LEADS_MTY_NODES.map((node) => node.name));
    const adSet = outline.querySelector('[data-node="c0/a0"]');
    expect(adSet?.querySelector('[data-node="c0/a0/ad1"]')).toBeTruthy();
  });

  it('opens the campaign and its first ad set, and folds the rest', () => {
    const { container } = render(
      <JainaCampaignStructure structure={fixtureStructure('outline')} />,
    );
    const open = (path: string) =>
      (container.querySelector(`[data-node="${path}"]`) as HTMLDetailsElement).open;
    expect(open('c0')).toBe(true);
    expect(open('c0/a0')).toBe(true);
    expect(open('c0/a1')).toBe(false);
  });

  it('says who supplied each field, and marks what Jaina still asks', () => {
    const { container } = render(
      <JainaCampaignStructure structure={fixtureStructure('outline')} />,
    );
    const ad = container.querySelector('[data-node="c0/a0/ad1"]') as HTMLElement;
    expect(ad.querySelector('summary [data-provenance="jaina_asks"]')).toBeTruthy();
    const budget = [...container.querySelectorAll('[data-node="c0/a0"] > div > dl dd')].find(
      (dd) => dd.textContent?.includes('$300 MXN'),
    );
    expect(budget?.querySelector('[data-provenance="user_gave"]')?.getAttribute('aria-label')).toBe(
      'You gave this',
    );
  });

  it('carries the you-gave / filled / asks counts', () => {
    const structure = fixtureStructure('outline');
    const { getByTestId } = render(<JainaCampaignStructure structure={structure} />);
    const counts = getByTestId('campaign-structure-counts').textContent ?? '';
    expect(counts).toContain(`You gave ${structure.counts.userGave}`);
    expect(counts).toContain(`Jaina filled ${structure.counts.jainaFilled}`);
    expect(counts).toContain('Jaina asks 1');
  });

  it('says the full tree lives on the card and the canvas when the frame was truncated', () => {
    const structure = fixtureStructure('outline', {
      truncated: true,
      nodes: LEADS_MTY_NODES.filter((node) => node.level === 'campaign'),
    });
    const { getByTestId } = render(<JainaCampaignStructure structure={structure} />);
    expect(getByTestId('campaign-structure-outline').textContent).toContain(
      '3 ad sets and 4 ads are too many to list here',
    );
  });
});

describe('08 · the difference', () => {
  it('draws the original beside the copy, with every change named', () => {
    const { getByTestId } = render(<JainaCampaignStructure structure={fixtureStructure('diff')} />);
    const diff = getByTestId('campaign-structure-diff');
    const change = (path: string) =>
      diff.querySelector(`[data-node="${path}"]`)?.getAttribute('data-change');
    expect(change('c0')).toBe('changed');
    expect(change('c0/a1')).toBe('removed');
    expect(change('c0/a2')).toBe('added');
    expect(diff.textContent).toContain('Original · Promo Oct');
    expect(diff.textContent).toContain('Daily budget: $300 MXN → $450 MXN');
    // The original column names the original, not the renamed copy.
    expect(diff.querySelector('[data-node="c0"] > div')?.textContent).toContain('Promo Oct');
    expect(diff.querySelector('[data-node="c0/a2"]')?.textContent).toContain('Daily budget: $250 MXN');
    expect(diff.querySelector('[data-node="c0/a1"]')?.textContent).toContain('— removed');
    expect(diff.querySelector('[data-node="c0/a2"]')?.textContent).toContain('Not in the original');
  });

  it('draws the outline when a difference has no diff to show', () => {
    const { getByTestId } = render(
      <JainaCampaignStructure structure={fixtureStructure('diff', { diff: null } as never)} />,
    );
    expect(getByTestId('campaign-structure-outline')).toBeTruthy();
  });
});

describe('01 · 04 · 05 · the compiled designs', () => {
  for (const layout of ['tree', 'matrix', 'funnel'] as const) {
    it(`${layout}: signs its durable pair and shows it in a frame with no scripts`, async () => {
      const { container, getByTestId } = render(
        <JainaCampaignStructure structure={fixtureStructure(layout)} />,
      );
      await waitFor(() => {
        const frame = container.querySelector('iframe');
        expect(frame?.getAttribute('src')).toBe('https://signed.example/structure.html');
        expect(frame?.getAttribute('sandbox')).toBe('');
      });
      expect(signed).toEqual([
        { bucket: 'hyperframes-compositions', path: fixtureHtmlPath(layout) },
      ]);
      // Sized from the compiler's height alone: a scriptless frame cannot report its own.
      expect(getByTestId('campaign-structure-frame').style.height).toBe('420px');
    });
  }

  it('falls back to the outline when the picture cannot be signed', async () => {
    signResult = null;
    const { findByTestId, container } = render(
      <JainaCampaignStructure structure={fixtureStructure('tree')} />,
    );
    expect(await findByTestId('campaign-structure-outline')).toBeTruthy();
    expect(container.querySelector('iframe')).toBeNull();
  });
});

describe('the drawing around every design', () => {
  it('opens the scaffold on the canvas, remembering the thread it came from', () => {
    const { getByTestId } = render(
      <ScaffoldThreadContext.Provider value={{ sessionId: 'sess-1' }}>
        <JainaCampaignStructure structure={fixtureStructure('outline')} />
      </ScaffoldThreadContext.Provider>,
    );
    expect(getByTestId('campaign-structure-open-canvas').getAttribute('href')).toBe(
      `/scale/campaign-canvas?scaffold=${FIXTURE_PARENT_ID}&session=sess-1`,
    );
  });

  it('names the design and the version it draws', () => {
    const { getByTestId } = render(
      <JainaCampaignStructure structure={fixtureStructure('outline', { version: 3 })} />,
    );
    expect(getByTestId('campaign-structure').textContent).toContain('Outline · version 3');
  });

  it('draws two designs together as two figures, in order', () => {
    const { getAllByTestId } = render(
      <JainaCampaignStructures
        structures={[fixtureStructure('tree'), fixtureStructure('matrix')]}
      />,
    );
    expect(
      getAllByTestId('campaign-structure').map((el) => el.getAttribute('data-layout')),
    ).toEqual(['tree', 'matrix']);
  });

  it('folds and unfolds an ad set when its line is pressed', () => {
    const { container } = render(
      <JainaCampaignStructure structure={fixtureStructure('outline')} />,
    );
    const details = container.querySelector('[data-node="c0/a1"]') as HTMLDetailsElement;
    fireEvent.click(details.querySelector('summary') as HTMLElement);
    expect(details.open).toBe(true);
  });
});
