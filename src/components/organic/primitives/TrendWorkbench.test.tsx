import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { Trend } from '@/lib/organic/trends';
import { TrendWorkbench } from './TrendWorkbench';

mock.module('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandInput: ({
    placeholder,
    value,
    onValueChange,
  }: {
    placeholder?: string;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    />
  ),
  CommandItem: ({
    children,
    onSelect,
    value,
  }: {
    children: ReactNode;
    onSelect?: (value: string) => void;
    value?: string;
  }) => (
    <button type="button" onClick={() => onSelect?.(value ?? '')}>
      {children}
    </button>
  ),
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandSeparator: () => <hr />,
}));

const trends: Trend[] = [
  {
    id: 'trend-generic',
    title: 'AI Video Breakthroughs',
    summary: 'Video tooling is accelerating content production cycles.',
    momentum: 'rising',
    platforms: ['instagram', 'linkedin'],
    tags: ['ai', 'video'],
  },
  {
    id: 'trend-question',
    title: 'What should marketers automate first?',
    summary: 'Audience Q&A around automation priorities.',
    momentum: 'stable',
    platforms: ['linkedin'],
    tags: ['question'],
  },
  {
    id: 'trend-event',
    title: 'Annual Product Summit Event',
    summary: 'Major industry event creating campaign opportunities.',
    momentum: 'stable',
    platforms: ['instagram'],
    tags: ['event'],
  },
  {
    id: 'trend-stable',
    title: 'Product-Led Sales Strategies',
    summary: 'Teams are doubling down on educational product marketing.',
    momentum: 'stable',
    platforms: ['linkedin'],
    tags: ['saas'],
  },
];

describe('TrendWorkbench', () => {
  beforeEach(() => {
    (window as unknown as { SyntaxError?: typeof SyntaxError }).SyntaxError = SyntaxError;
  });

  afterEach(() => {
    cleanup();
  });

  it('toggles a trend and supports filtering', () => {
    const onToggleTrend = mock();

    render(
      <TrendWorkbench
        trends={trends}
        selectedTrendIds={['trend-generic']}
        activePlatforms={['instagram', 'linkedin']}
        maxSelections={5}
        onToggleTrend={onToggleTrend}
      />,
    );

    fireEvent.click(screen.getByText('AI Video Breakthroughs'));
    expect(onToggleTrend).toHaveBeenCalledWith('trend-generic');

    fireEvent.change(screen.getByPlaceholderText('Search trends • type / for presets'), {
      target: { value: 'missing topic' },
    });

    expect(screen.getByText('No trends match this search.')).toBeTruthy();
  });

  it('sorts rows by type: event, question, trend', () => {
    render(
      <TrendWorkbench
        trends={trends}
        selectedTrendIds={[]}
        activePlatforms={['instagram', 'linkedin']}
        maxSelections={5}
        onToggleTrend={mock()}
      />,
    );

    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent ?? '').toContain('Annual Product Summit Event');
    expect(rows[2].textContent ?? '').toContain('What should marketers automate first?');
    expect(rows[3].textContent ?? '').toContain('AI Video Breakthroughs');
  });

  it("does not toggle selection when the row's expand chevron is clicked", () => {
    const onToggleTrend = mock();
    render(
      <TrendWorkbench
        trends={trends}
        selectedTrendIds={[]}
        activePlatforms={['instagram', 'linkedin']}
        maxSelections={5}
        onToggleTrend={onToggleTrend}
      />,
    );

    const expand = screen.getAllByLabelText('Expand trend detail')[0];
    fireEvent.click(expand);
    expect(onToggleTrend).not.toHaveBeenCalled();
  });

  it('renders inline confidence and signal count from meta', () => {
    const trendWithMeta: Trend = {
      id: 'trend-meta',
      title: 'Omni-Assistant Pivot',
      summary: 'Real-time AI partners are replacing chatbots.',
      momentum: 'rising',
      platforms: ['instagram'],
      tags: ['ai'],
      meta: {
        kind: 'trend',
        confidence: 0.93,
        relevanceToBrand: 'Aligns with assistant-led marketing motions.',
        sourceSignalCount: 12,
        recommendedPlatforms: ['linkedin', 'youtube'],
        platformRecommendations: [
          { platform: 'linkedin', reason: 'Reaches LatAm business leaders.' },
        ],
      },
    };
    render(
      <TrendWorkbench
        trends={[trendWithMeta]}
        selectedTrendIds={[]}
        activePlatforms={['instagram']}
        maxSelections={5}
        onToggleTrend={mock()}
      />,
    );

    expect(screen.getByText('93%')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('shows the generate action only for uuid trends and fires it without toggling selection', () => {
    const uuidTrend: Trend = {
      id: '0b6fbf2e-8f6f-4a5f-9d5e-2f4f6f8a1c3d',
      title: 'Durable Trend With Real Id',
      summary: 'A backend-persisted trend that can anchor a one-shot job.',
      momentum: 'rising',
      platforms: ['instagram'],
      tags: ['ai'],
    };
    const onToggleTrend = mock();
    const onGenerateFromTrend = mock();
    render(
      <TrendWorkbench
        trends={[...trends, uuidTrend]}
        selectedTrendIds={[]}
        activePlatforms={['instagram', 'linkedin']}
        maxSelections={5}
        onToggleTrend={onToggleTrend}
        onGenerateFromTrend={onGenerateFromTrend}
      />,
    );

    // Only the uuid trend gets the affordance; slug-seeded trends get none.
    const generateButtons = screen.getAllByLabelText('Generate content from this trend');
    expect(generateButtons.length).toBe(1);

    fireEvent.click(generateButtons[0]);
    expect(onGenerateFromTrend).toHaveBeenCalledTimes(1);
    expect(onGenerateFromTrend.mock.calls[0][0]).toMatchObject({ id: uuidTrend.id });
    expect(onToggleTrend).not.toHaveBeenCalled();
  });

  it('renders no generate action when the callback is absent', () => {
    const uuidTrend: Trend = {
      id: '0b6fbf2e-8f6f-4a5f-9d5e-2f4f6f8a1c3d',
      title: 'Durable Trend With Real Id',
      summary: 'A backend-persisted trend that can anchor a one-shot job.',
      momentum: 'rising',
      platforms: ['instagram'],
      tags: ['ai'],
    };
    render(
      <TrendWorkbench
        trends={[uuidTrend]}
        selectedTrendIds={[]}
        activePlatforms={['instagram']}
        maxSelections={5}
        onToggleTrend={mock()}
      />,
    );

    expect(screen.queryByLabelText('Generate content from this trend')).toBeNull();
  });

  // A fetch failure, a brand with nothing analysed yet, and a search that matched nothing
  // are three different facts. All three used to render "No trends match this search."
  describe('empty states', () => {
    it('reports a fetch failure and offers a retry', () => {
      const onFetch = mock();
      render(
        <TrendWorkbench
          trends={[]}
          selectedTrendIds={[]}
          activePlatforms={['instagram']}
          onToggleTrend={mock()}
          onFetch={onFetch}
          insightsError="Upstream insights service returned 503"
        />,
      );

      expect(screen.getByTestId('trend-workbench-error')).toBeTruthy();
      expect(screen.getByText('Upstream insights service returned 503')).toBeTruthy();
      expect(screen.queryByText('No trends match this search.')).toBeNull();

      fireEvent.click(screen.getByText('Retry'));
      expect(onFetch).toHaveBeenCalledTimes(1);
    });

    it('says the sector has not been analysed when there is nothing to show', () => {
      render(
        <TrendWorkbench
          trends={[]}
          selectedTrendIds={[]}
          activePlatforms={['instagram']}
          onToggleTrend={mock()}
          onFetch={mock()}
        />,
      );

      expect(screen.getByTestId('trend-workbench-empty')).toBeTruthy();
      expect(screen.queryByText('No trends match this search.')).toBeNull();
      expect(screen.queryByTestId('trend-workbench-error')).toBeNull();
    });

    it('says no match only when a non-empty set was filtered to nothing', () => {
      render(
        <TrendWorkbench
          trends={trends}
          selectedTrendIds={[]}
          activePlatforms={['instagram']}
          onToggleTrend={mock()}
        />,
      );

      fireEvent.change(screen.getByPlaceholderText('Search trends • type / for presets'), {
        target: { value: 'nothing here matches' },
      });

      expect(screen.getByTestId('trend-workbench-no-match')).toBeTruthy();
      expect(screen.queryByTestId('trend-workbench-empty')).toBeNull();
    });
  });

  it('applies premade filters via slash command presets', () => {
    render(
      <TrendWorkbench
        trends={trends}
        selectedTrendIds={['trend-question']}
        activePlatforms={['linkedin']}
        maxSelections={5}
        onToggleTrend={mock()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search trends • type / for presets'), {
      target: { value: '/questions' },
    });
    fireEvent.click(screen.getByText('Preset: questions'));

    expect(screen.getByText('What should marketers automate first?')).toBeTruthy();
    expect(screen.queryByText('Annual Product Summit Event')).toBeNull();
    expect(screen.queryByText('AI Video Breakthroughs')).toBeNull();
  });
});
