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

// 08 and 09 are the canvas's own Read pieces at chat size (design C, option 27).
const chatCard = (root: HTMLElement) =>
  root.querySelector('[data-testid="lectura-chat-card"]') as HTMLElement;

describe('09 · the outline, in Read', () => {
  it('names the campaign and each ad set with its budget and ads', () => {
    const { container } = render(
      <JainaCampaignStructure structure={fixtureStructure('outline')} />,
    );
    const card = chatCard(container);
    expect(card.textContent).toContain('Leads MTY');
    const lines = [...card.querySelectorAll('[data-testid="lectura-chat-adsets"] li')].map(
      (line) => line.textContent,
    );
    expect(lines).toEqual([
      'LAL 1%$300 MXN/day · 2 ads',
      'Broad 25-45$300 MXN/day · 1 ad',
      'Retargeting 30d$200 MXN/day · 1 ad',
    ]);
  });

  it('totals the daily budget the ad sets hold, read back from the printed figures', () => {
    const { container } = render(
      <JainaCampaignStructure structure={fixtureStructure('outline')} />,
    );
    expect(chatCard(container).textContent).toContain('Daily budget$800 MXN/day');
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
    expect(getByTestId('campaign-structure').textContent).toContain(
      '3 ad sets and 4 ads are too many to list here',
    );
  });
});

describe('08 · the difference, in Read', () => {
  it('lists what the copy changes first, each with its before → after', () => {
    const { container } = render(<JainaCampaignStructure structure={fixtureStructure('diff')} />);
    const card = chatCard(container);
    const mark = (path: string) =>
      card.querySelector(`[data-testid="lectura-change-${path}"]`)?.getAttribute('data-mark');
    expect(mark('c0')).toBe('changed');
    expect(mark('c0/a0')).toBe('changed');
    expect(mark('c0/a2')).toBe('added');
    expect(card.querySelector('[data-testid="lectura-change-c0"]')?.textContent).toContain(
      'Name: Promo Oct→Promo Nov',
    );
    expect(card.querySelector('[data-testid="lectura-change-c0/a0"]')?.textContent).toContain(
      'Daily budget: $300 MXN→$450 MXN',
    );
  });

  it('draws the plain campaign when a difference has no diff to show', () => {
    const { container } = render(
      <JainaCampaignStructure structure={fixtureStructure('diff', { diff: null } as never)} />,
    );
    expect(chatCard(container).querySelector('[data-testid="lectura-chat-adsets"]')).toBeTruthy();
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

  it('falls back to Read when the picture cannot be signed', async () => {
    signResult = null;
    const { findByTestId, container } = render(
      <JainaCampaignStructure structure={fixtureStructure('tree')} />,
    );
    expect(await findByTestId('lectura-chat-card')).toBeTruthy();
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
    expect(getByTestId('lectura-open-in-canvas').getAttribute('href')).toBe(
      `/scale/campaign-canvas?scaffold=${FIXTURE_PARENT_ID}&session=sess-1`,
    );
  });

  it('opens the companion canvas instead when one sits beside the chat', () => {
    const focused: string[] = [];
    const { getByTestId } = render(
      <ScaffoldThreadContext.Provider
        value={{ sessionId: 'sess-1', onScaffoldFocus: (id: string) => focused.push(id) }}
      >
        <JainaCampaignStructure structure={fixtureStructure('diff')} />
      </ScaffoldThreadContext.Provider>,
    );
    fireEvent.click(getByTestId('lectura-open-in-canvas'));
    expect(focused).toEqual([FIXTURE_PARENT_ID]);
  });

  it('keeps the canvas link in the caption for a compiled picture', () => {
    const { getByTestId } = render(
      <ScaffoldThreadContext.Provider value={{ sessionId: null }}>
        <JainaCampaignStructure structure={fixtureStructure('tree')} />
      </ScaffoldThreadContext.Provider>,
    );
    expect(getByTestId('campaign-structure-open-canvas').getAttribute('href')).toBe(
      `/scale/campaign-canvas?scaffold=${FIXTURE_PARENT_ID}`,
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
});
