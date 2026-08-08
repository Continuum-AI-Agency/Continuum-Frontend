import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

import { InsightDataTable } from '@/components/dashboard/datatable/InsightDataTable';
import { InsightsList } from '@/components/dashboard/datatable/InsightsList';
import { Panel } from './Panel';

// Structural guard for the flattened panes.
//
// The dashboard was rebuilt from nested cards into edge-to-edge panes. Two
// things regress silently, cost real screen space, and break no other test:
//
//   1. A pane regains card chrome (border / rounded / bg-card) while sitting
//      inside another bordered surface — docs/styleguide.md bans card-in-card.
//   2. A pass-through wrapper creeps back in, re-deepening the tree.
//
// e2e/dashboard-density.spec.ts covers the same invariants against real
// computed styles; this one needs no auth, so it is the gate that always runs.

const CARD_CHROME =
  /(^|:)(rounded-(sm|md|lg|xl|2xl|3xl)|bg-card|border-border\/70|border-subtle)\b/;

function chromeOffenders(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[class]'))
    .map((el) => el.className)
    .filter((className) => typeof className === 'string')
    .filter((className) => className.split(/\s+/).some((token) => CARD_CHROME.test(token)));
}

/**
 * Element-node depth from the rendered <section> down to the first match.
 * Measured from the panel itself, not RTL's own container div.
 */
function depthTo(container: HTMLElement, selector: string): number {
  const root = container.querySelector('section');
  const node = container.querySelector(selector);
  if (!root || !node) return -1;
  let depth = 0;
  let cursor: Element | null = node;
  while (cursor && cursor !== root) {
    depth += 1;
    cursor = cursor.parentElement;
  }
  return cursor === root ? depth : -1;
}

afterEach(cleanup);

describe('Panel', () => {
  it('renders a header and body with no card chrome of its own', () => {
    const { container } = render(
      <Panel title="Insights">
        <p>body</p>
      </Panel>,
    );

    const panel = container.querySelector('section');
    expect(panel).not.toBeNull();
    expect(panel?.className).not.toMatch(CARD_CHROME);
    expect(panel?.className).not.toContain('border');
    expect(container.textContent).toContain('Insights');
    expect(container.textContent).toContain('body');
  });

  it('lets the body drop its padding so rows can own their gutter', () => {
    const { container } = render(
      <Panel title="Rows" bodyClassName="p-0">
        <p>row</p>
      </Panel>,
    );

    const body = container.querySelector('section > div:last-child');
    expect(body?.className).toContain('p-0');
    expect(body?.className).not.toContain('p-[var(--card-pad)]');
  });

  it('omits the left cluster wrapper when only a title is given', () => {
    const { container } = render(
      <Panel title="Bare">
        <p>body</p>
      </Panel>,
    );

    // header > title, with no grouping div in between.
    expect(depthTo(container, 'p.truncate')).toBe(2);
  });

  it('keeps the left cluster wrapper when an eyebrow joins the title', () => {
    const { container } = render(
      <Panel eyebrow="REACH" title="Paired">
        <p>body</p>
      </Panel>,
    );

    expect(depthTo(container, 'p.truncate')).toBe(3);
    expect(container.textContent).toContain('REACH');
  });
});

describe('dashboard panes carry no card chrome', () => {
  it('InsightsList renders rows without a nested bordered box', () => {
    const { container } = render(
      <InsightsList
        title="Insights"
        items={[
          { id: '1', text: 'All 1 posts are FEED', severity: 'neutral', label: 'CONTENT' },
          { id: '2', text: 'Engagement up 0.0%', severity: 'positive', label: 'ENGAGEMENT' },
        ]}
      />,
    );

    expect(chromeOffenders(container)).toEqual([]);
    // body > ul > li — anything deeper means a wrapper crept back in.
    expect(depthTo(container, 'li')).toBeLessThanOrEqual(3);
  });

  it('InsightDataTable renders rows without a nested bordered box', () => {
    const { container } = render(
      <InsightDataTable
        title="Top creatives"
        rows={[{ id: 'a', name: 'Post A' }]}
        getRowId={(row) => row.id}
        columns={[{ id: 'name', header: 'Creative', cell: (row) => row.name }]}
      />,
    );

    expect(chromeOffenders(container)).toEqual([]);
    expect(container.textContent).toContain('Post A');
  });
});
