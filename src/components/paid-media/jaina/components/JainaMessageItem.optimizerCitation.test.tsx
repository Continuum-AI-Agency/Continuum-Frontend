/**
 * The chain a cited optimizer figure travels to become a working control.
 *
 * `OptimizerCardBlock` renders the chip as a real, focusable, aria-labelled `<button>` whether or
 * not anyone gave it an `onOpenRead` — and for a while nobody did: `JainaMessageItem` rendered
 * `JainaOptimizerCitations` with citations alone, so the chip announced itself to a screen reader
 * as a button and did nothing at all. A control that looks interactive and is not is worse than
 * one that is absent, and nothing in the suite noticed, because every earlier test handed the
 * block its props by hand.
 *
 * So this asserts the SEAM, not the block: a callback given to the message item must come back
 * out of a click on the rendered chip, and must reach the footer control on the larger sizes.
 * Break any link between the two and these go red.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import { type CitedRead, resolutionFrom } from '@/lib/jaina/optimizerCitedRead';
import type { JainaChatMessage } from '../types';

const realCitedRead = await import('@/lib/jaina/optimizerCitedRead');

/** `ChatMessage` registers itself with the transcript scroller, so a bare render has no host. */
const wrapper = ({ children }: { children: ReactNode }) => (
  <MessageScrollerProvider>
    <MessageScroller>
      <MessageScrollerViewport>
        <MessageScrollerContent>{children}</MessageScrollerContent>
      </MessageScrollerViewport>
    </MessageScroller>
  </MessageScrollerProvider>
);

// Complete replacements, never partial: `mock.module` swaps a module for the whole process, and a
// partial one deletes the module's other exports for every later file in the run.
mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content, className }: { content: string; className?: string }) => (
    <div className={className} data-testid="markdown">
      {content}
    </div>
  ),
}));

const STORED_READ: CitedRead = {
  id: 'read-abc',
  utc_day: '2026-09-20',
  read: {
    candidates: [
      {
        id: 'dead_tail:acct',
        detector: 'dead_tail',
        impact_per_day: 102,
        impact_class: 'recoverable',
        impact_basis: '2 ad sets with 0 results in 7 days',
        result_label: 'purchases',
        chart: null,
        capped_by: null,
      },
    ],
    guards: [],
    currency: 'USD',
  },
} as CitedRead;

mock.module('@/lib/jaina/brandScope', () => ({
  useJainaBrandScope: () => ({ brandId: 'brand-1', adAccountId: 'act_1' }),
  JainaBrandScopeProvider: ({ children }: { children: ReactNode }) => children,
}));

mock.module('@/lib/jaina/optimizerCitedRead', () => ({
  ...realCitedRead,
  useCitedOptimizerRead: () => resolutionFrom(STORED_READ, 'read-abc'),
}));

const { JainaMessageItem } = await import('./JainaMessageItem');

afterEach(cleanup);

const turnCiting = (size: 'card' | 'strip' = 'card'): JainaChatMessage => ({
  id: 'msg-1',
  role: 'assistant',
  status: 'done',
  content: 'The dead tail is the one worth moving today.',
  createdAt: '2026-09-20T10:00:00.000Z',
  optimizerCitations: [{ read_id: 'read-abc', candidate_ids: ['dead_tail:acct'], size }],
});

describe('a cited optimizer figure reaches the account read', () => {
  it('reaches the card footer control too, which is the same callback one size up', () => {
    const opened: string[] = [];
    render(
      <JainaMessageItem message={turnCiting('card')} onOpenAccountRead={(id) => opened.push(id)} />,
      { wrapper },
    );

    fireEvent.click(screen.getByText('open in the account read'));

    expect(opened).toEqual(['read-abc']);
  });

  // The footer is conditional on the callback and always has been. Asserting it here pins the
  // fact that the control's absence is what "no way to open the read" looks like — so a future
  // reader can tell a missing wire from a deliberately inert surface.
  it('renders no footer control when nothing can honour it', () => {
    render(<JainaMessageItem message={turnCiting('card')} />, { wrapper });

    expect(screen.queryByText('open in the account read')).toBeNull();
  });
});
