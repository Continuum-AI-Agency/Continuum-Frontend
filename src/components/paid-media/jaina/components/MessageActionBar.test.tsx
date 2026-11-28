import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const capture = mock((_event: string, _props?: Record<string, unknown>) => undefined);
mock.module('posthog-js', () => ({ default: { capture } }));

const { MessageActionBar } = await import('./MessageActionBar');

const writeText = mock((_text: string) => Promise.resolve());

beforeEach(() => {
  capture.mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(cleanup);

describe('MessageActionBar', () => {
  it('copies the answer to the clipboard', () => {
    render(<MessageActionBar content="CPA rose 17%." />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy response' }));
    expect(writeText).toHaveBeenCalledWith('CPA rose 17%.');
  });

  it('regenerates through the caller', () => {
    const onRegenerate = mock(() => undefined);
    render(<MessageActionBar content="x" onRegenerate={onRegenerate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate response' }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('sends a thumbs up to PostHog', async () => {
    render(<MessageActionBar content="x" messageId="msg-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith('jaina_response_rated', {
        message_id: 'msg-1',
        rating: 'up',
      }),
    );
  });

  it('sends a thumbs down with its reasons and note to PostHog', async () => {
    render(<MessageActionBar content="x" messageId="msg-2" />);
    fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inaccurate' }));
    fireEvent.change(screen.getByLabelText('Add a note'), {
      target: { value: 'Spend is wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith('jaina_response_feedback_sent', {
        message_id: 'msg-2',
        rating: 'down',
        reasons: 'Inaccurate',
        note: 'Spend is wrong',
      }),
    );
  });
});
