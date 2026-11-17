import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MessageRowBoundary } from './MessageRowBoundary';

let shouldThrow = true;
function FlakyRow({ label }: { label: string }) {
  if (shouldThrow) throw new Error('row could not render');
  return createElement('p', null, label);
}
const SteadyRow = ({ label }: { label: string }) => createElement('p', null, label);

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const realConsoleError = console.error;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  // React logs the caught error; the boundary logging it is the behaviour under test, not noise.
  console.error = () => {};
  shouldThrow = true;
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  console.error = realConsoleError;
});

const renderTranscript = () =>
  act(() => {
    root.render(
      createElement(
        'div',
        null,
        createElement(
          MessageRowBoundary,
          { key: 'u1', messageId: 'u1' },
          createElement(SteadyRow, { label: 'Plan my week' }),
        ),
        createElement(
          MessageRowBoundary,
          { key: 'a1', messageId: 'a1' },
          createElement(FlakyRow, { label: 'Mon: reel.' }),
        ),
      ),
    );
  });

describe('MessageRowBoundary', () => {
  it('costs the failing message only — the question and the rest of the chat stay', () => {
    renderTranscript();

    expect(container.textContent).toContain('Plan my week');
    const fallback = container.querySelector('[data-message-row-state="error"]');
    expect(fallback?.textContent).toContain('This message could not be displayed.');
    expect(fallback?.getAttribute('translate')).toBe('no');
  });

  it('shows the message again from the same state once it can render', () => {
    renderTranscript();
    shouldThrow = false;

    const retry = container.querySelector('[data-message-row-state="error"] button');
    act(() => {
      (retry as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain('Mon: reel.');
    expect(container.querySelector('[data-message-row-state="error"]')).toBeNull();
  });
});
