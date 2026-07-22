import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';

// Render markdown as its raw string so we can assert on the thought prose, and
// flatten the shimmer wrapper to a plain span so the header label is queryable.
mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content }: { content: string }) => <span>{content}</span>,
}));
mock.module('@/components/ai-elements/shimmer', () => ({
  Shimmer: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

import type { JainaProgressEntry } from '@/lib/jaina/stream';
import { ThinkingWindow } from './ThinkingWindow';

afterEach(cleanup);

function thought(detail: string, at = '2026-06-10T00:00:00.000Z'): JainaProgressEntry {
  return { stage: 'thinking', at, detail, data: {} };
}

function agentSpawn(displayName: string, at = '2026-06-10T00:00:01.000Z'): JainaProgressEntry {
  return { stage: 'agent_spawn', at, data: { agent_id: displayName, display_name: displayName } };
}

describe('ThinkingWindow', () => {
  it('while streaming, stays collapsed and surfaces only the latest thought under a Thinking header', () => {
    const { getByText, queryByText } = render(
      <ThinkingWindow
        reasoning={[thought('First pass on pacing'), thought('CPA on retargeting is drifting')]}
        toolCalls={[]}
        toolResults={[]}
        isStreaming
      />,
    );

    // Header is the live "Thinking…" state; the full trace is not expanded.
    expect(getByText(/Thinking/)).toBeTruthy();
    expect(queryByText('Reasoning')).toBeNull();

    // Ticker shows the single most-recent thought, not the earlier one.
    expect(getByText('CPA on retargeting is drifting')).toBeTruthy();
    expect(queryByText('First pass on pacing')).toBeNull();
  });

  it('reveals the full reasoning trace on demand when the header is clicked', () => {
    const { getByRole, getByText, queryByText } = render(
      <ThinkingWindow
        reasoning={[thought('CPA on retargeting is drifting')]}
        toolCalls={[]}
        toolResults={[]}
        isStreaming
      />,
    );

    expect(queryByText('Reasoning')).toBeNull();

    fireEvent.click(getByRole('button'));

    // Expanded: the trace step is now mounted.
    expect(getByText('Reasoning')).toBeTruthy();
  });

  it('keeps live sub-agent activity behind the collapse, revealing it only on expand', () => {
    const { getByRole, queryAllByText } = render(
      <ThinkingWindow
        reasoning={[thought('Delegating the pull'), agentSpawn('Worker One')]}
        toolCalls={[]}
        toolResults={[]}
        isStreaming
      />,
    );

    // Collapsed while streaming: the sub-agent tree is not exploded onto the screen.
    expect(queryAllByText('Worker One')).toHaveLength(0);

    fireEvent.click(getByRole('button'));

    expect(queryAllByText('Worker One').length).toBeGreaterThan(0);
  });

  it('when finished, collapses to a "Thought for Ns" summary label', () => {
    const { getByText } = render(
      <ThinkingWindow
        reasoning={[
          thought('start', '2026-06-10T00:00:00.000Z'),
          thought('end', '2026-06-10T00:00:03.000Z'),
        ]}
        toolCalls={[]}
        toolResults={[]}
        isStreaming={false}
      />,
    );

    expect(getByText('Thought for 3s')).toBeTruthy();
  });

  it('renders nothing once finished with no reasoning to show', () => {
    const { container } = render(
      <ThinkingWindow reasoning={[]} toolCalls={[]} toolResults={[]} isStreaming={false} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
