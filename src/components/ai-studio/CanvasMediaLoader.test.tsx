import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { CanvasMediaLoader } from './CanvasMediaLoader';

describe('CanvasMediaLoader', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders an accessible canvas loading state', () => {
    const { getByRole, getByText } = render(<CanvasMediaLoader />);

    expect(getByRole('status', { name: 'Loading AI Studio canvas' })).toBeTruthy();
    expect(getByText('Preparing media canvas')).toBeTruthy();
    expect(getByText('Session')).toBeTruthy();
    expect(getByText('Media Engine')).toBeTruthy();
  });

  it('accepts custom class names', () => {
    const { container } = render(<CanvasMediaLoader className="loader-hook" />);
    expect(container.querySelector('.loader-hook')).toBeTruthy();
  });

  it('surfaces an error state with a retry when realtime fails', () => {
    const onRetry = mock(() => {});
    const { getByRole, getByText, queryByRole } = render(
      <CanvasMediaLoader
        status="error"
        errorMessage="Realtime connection lost."
        onRetry={onRetry}
      />,
    );

    expect(getByRole('alert')).toBeTruthy();
    expect(getByText("AI Studio canvas didn't load")).toBeTruthy();
    expect(getByText('Realtime connection lost.')).toBeTruthy();
    expect(queryByRole('status', { name: 'Loading AI Studio canvas' })).toBeNull();

    fireEvent.click(getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
