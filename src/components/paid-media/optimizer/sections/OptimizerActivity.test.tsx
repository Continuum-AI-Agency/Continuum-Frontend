import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

mock.module('./OptimizerActionFeed', () => ({
  OptimizerActionFeed: () => <div>actions-feed</div>,
}));
mock.module('./OptimizerLogs', () => ({
  OptimizerLogs: () => <div>server-log</div>,
}));

const { OptimizerActivity } = await import('./OptimizerActivity');

afterEach(cleanup);

describe('OptimizerActivity window', () => {
  it('defaults to 7 days and lets the operator pick 14 or 30', () => {
    render(<OptimizerActivity brandId="brand-1" currency="USD" />);
    const seven = screen.getByRole('button', { name: '7d' });
    const fourteen = screen.getByRole('button', { name: '14d' });
    const thirty = screen.getByRole('button', { name: '30d' });
    expect(seven.getAttribute('aria-pressed')).toBe('true');
    expect(fourteen.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(thirty);
    expect(thirty.getAttribute('aria-pressed')).toBe('true');
    expect(seven.getAttribute('aria-pressed')).toBe('false');
  });
});
