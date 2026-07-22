import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { MessageActions } from './MessageActions';

// happy-dom's Window does not carry these constructors; Testing Library's
// role queries reach for window.SyntaxError inside querySelectorAll.
Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

function stubClipboard() {
  const writeText = mock(async () => {});
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

describe('MessageActions', () => {
  afterEach(() => cleanup());

  it('copies the exact message content to the clipboard', () => {
    const writeText = stubClipboard();
    render(<MessageActions content="Here is your plan" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));

    expect(writeText).toHaveBeenCalledWith('Here is your plan');
  });

  it('invokes the regenerate handler when the regenerate action is clicked', () => {
    stubClipboard();
    const onRegenerate = mock(() => {});
    render(<MessageActions content="x" onRegenerate={onRegenerate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate response' }));

    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('omits the regenerate button when no handler is provided', () => {
    stubClipboard();
    render(<MessageActions content="x" />);

    expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();
  });
});
