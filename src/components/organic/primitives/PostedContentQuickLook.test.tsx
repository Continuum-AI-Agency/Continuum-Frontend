import { afterEach, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PostedContentPreview } from './PostedContentQuickLook';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

afterEach(cleanup);

it('shows the posted preview and optional metrics action together', () => {
  const onViewMetrics = mock(() => undefined);
  render(
    <PostedContentPreview
      post={{
        id: 'post-1',
        source: 'published_posts',
        platform: 'instagram',
        timestamp: '2026-08-03T15:00:00Z',
        dayId: '2026-08-03',
        timeLabel: '9:00 AM',
        title: 'Published launch',
        caption: 'The finished post',
      }}
      onViewMetrics={onViewMetrics}
    />,
  );

  expect(screen.getByText('Published launch')).toBeTruthy();
  expect(screen.getByText('The finished post')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'View post metrics' }));
  expect(onViewMetrics).toHaveBeenCalledTimes(1);
});
