import { describe, expect, it, mock } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

Object.assign(globalThis, {
  getComputedStyle: global.window.getComputedStyle.bind(global.window),
  requestAnimationFrame: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
  cancelAnimationFrame: (id: number) => window.clearTimeout(id),
});

mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content, mode }: { content: string; mode?: 'streaming' | 'static' }) => (
    <div data-markdown-mode={mode ?? 'streaming'} data-testid="safe-markdown">
      {content}
    </div>
  ),
}));

const { LatestJainaThought, ThinkingWindow } = await import(
  '@/components/paid-media/jaina/components/ThinkingWindow'
);

describe('Jaina thinking UI', () => {
  it('renders tool names without tool input or output data', () => {
    render(
      <ThinkingWindow
        reasoning={[
          {
            stage: 'tool_start',
            at: '2026-04-29T10:00:00.000Z',
            detail: 'Running get_campaigns',
            data: {
              stage: 'tool_start',
              tool_name: 'get_campaigns',
              tool_call_id: 'call_1',
            },
          },
        ]}
        toolCalls={[
          {
            id: 'call_1',
            name: 'get_campaigns',
            args: { force_refresh: true },
            metadata: {},
          },
        ]}
        toolResults={[
          {
            id: 'call_1',
            name: 'get_campaigns',
            ok: true,
            cached: false,
            output: { campaigns: ['hidden'] },
          },
        ]}
        isStreaming={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /reasoning trace/i }));

    expect(screen.getByText('get campaigns')).toBeTruthy();
    expect(screen.queryByText(/force_refresh/i)).toBeNull();
    expect(screen.queryByText(/hidden/i)).toBeNull();
  });

  it('streams only the newest thought and hides it after completion', () => {
    const { rerender } = render(
      <LatestJainaThought
        isStreaming
        reasoning={[
          {
            stage: 'thinking',
            at: '2026-04-29T10:00:00.000Z',
            detail: 'First thought',
            data: { stage: 'thinking' },
          },
          {
            stage: 'thinking',
            at: '2026-04-29T10:00:01.000Z',
            detail: 'Second thought',
            data: { stage: 'thinking' },
          },
        ]}
      />,
    );

    expect(screen.getByTestId('safe-markdown').getAttribute('data-markdown-mode')).toBe(
      'streaming',
    );
    expect(screen.queryByText('First thought')).toBeNull();
    expect(screen.getByText('Second thought')).toBeTruthy();

    rerender(
      <LatestJainaThought
        isStreaming
        reasoning={[
          {
            stage: 'thinking',
            at: '2026-04-29T10:00:02.000Z',
            detail: 'Replacement thought',
            data: { stage: 'thinking' },
          },
        ]}
      />,
    );

    expect(screen.queryByText('Second thought')).toBeNull();
    expect(screen.getByText('Replacement thought')).toBeTruthy();

    rerender(
      <LatestJainaThought
        isStreaming={false}
        reasoning={[
          {
            stage: 'thinking',
            at: '2026-04-29T10:00:02.000Z',
            detail: 'Replacement thought',
            data: { stage: 'thinking' },
          },
        ]}
      />,
    );

    expect(screen.queryByTestId('safe-markdown')).toBeNull();
  });

  it('renders sub-agent lifecycle with its tool names underneath', () => {
    render(
      <ThinkingWindow
        reasoning={[
          {
            stage: 'agent_spawn',
            at: '2026-04-29T10:00:00.000Z',
            detail: 'Analyze budget pacing',
            data: {
              agent_id: 'agent_budget',
              display_name: 'Budget Analyst',
              task_description: 'Analyze budget pacing',
            },
          },
          {
            stage: 'tool_start',
            at: '2026-04-29T10:00:01.000Z',
            detail: 'Running fetch_budget_pacing',
            data: {
              stage: 'tool_start',
              tool_name: 'fetch_budget_pacing',
              tool_call_id: 'call_budget',
              agent_id: 'agent_budget',
            },
          },
        ]}
        toolCalls={[
          {
            id: 'call_budget',
            name: 'fetch_budget_pacing',
            args: { hidden: true },
            metadata: {},
            agent_id: 'agent_budget',
          },
        ]}
        toolResults={[]}
        isStreaming
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /thinking/i }));

    expect(screen.getByText('Budget Analyst')).toBeTruthy();
    expect(screen.getByText('fetch budget pacing')).toBeTruthy();
    expect(screen.queryByText(/hidden/i)).toBeNull();
  });
});
