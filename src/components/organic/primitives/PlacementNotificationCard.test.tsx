import { describe, expect, it, mock } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CalendarPlacement } from '@/lib/organic/calendar-generation';
import { PlacementNotificationCard } from './PlacementNotificationCard';

const mockPlacement: CalendarPlacement = {
  placementId: 'test-placement-123',
  schedule: {
    dayId: 'day-1',
    scheduledAt: '2026-01-27T00:00:00.000Z',
    timeOfDay: 'morning',
    adjusted: false,
  },
  platform: {
    name: 'instagram',
  },
  seed: {
    trendId: 'test-trend',
    source: 'trend',
  },
  content: {
    type: 'reel',
    format: 'Reel',
    titleTopic: 'Test Title Topic',
    objective: 'engagement',
  },
  creative: {
    creativeIdea: 'Test creative idea',
  },
  copy: {
    caption: 'Test caption',
  },
};

describe('PlacementNotificationCard', () => {
  it('renders placement data correctly', () => {
    render(
      <PlacementNotificationCard placement={mockPlacement} timestamp={new Date().toISOString()} />,
    );

    expect(screen.getByTestId('placement-card')).toBeTruthy();
    expect(screen.getByText('IG')).toBeTruthy();
    expect(screen.getByText('Reel')).toBeTruthy();
    expect(screen.getByText('Test Title Topic')).toBeTruthy();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = mock();
    render(
      <PlacementNotificationCard
        placement={mockPlacement}
        timestamp={new Date().toISOString()}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId('placement-card'));
    expect(onSelect).toHaveBeenCalledWith('test-placement-123');
  });

  it('displays relative timestamp', () => {
    const now = new Date();
    // formatRelativeTime says 'just now' under a minute, so a 5s delta never renders "ago".
    const justNow = new Date(now.getTime() - 5_000).toISOString();
    const { unmount } = render(
      <PlacementNotificationCard placement={mockPlacement} timestamp={justNow} />,
    );
    expect(screen.getByText('just now')).toBeTruthy();
    unmount();

    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
    render(<PlacementNotificationCard placement={mockPlacement} timestamp={fiveMinutesAgo} />);
    expect(screen.getByText(/ago/)).toBeTruthy();
  });

  it('shows correct platform badge for linkedin', () => {
    const linkedInPlacement = {
      ...mockPlacement,
      platform: { name: 'linkedin' },
    };

    render(
      <PlacementNotificationCard
        placement={linkedInPlacement}
        timestamp={new Date().toISOString()}
      />,
    );

    expect(screen.getByText('LinkedIn')).toBeTruthy();
  });

  it('truncates long title topics', () => {
    const longTitlePlacement = {
      ...mockPlacement,
      content: {
        ...mockPlacement.content,
        titleTopic:
          'This is a very long title that should be truncated when it exceeds two lines of text content',
      },
    };

    const { container } = render(
      <PlacementNotificationCard
        placement={longTitlePlacement}
        timestamp={new Date().toISOString()}
      />,
    );

    const titleElement = container.querySelector('.line-clamp-2');
    expect(titleElement).toBeTruthy();
  });
});
