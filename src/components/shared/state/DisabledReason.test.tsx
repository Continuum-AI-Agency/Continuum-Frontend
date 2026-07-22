import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { DisabledReason } from './DisabledReason';

afterEach(cleanup);

describe('DisabledReason', () => {
  it('keeps the wrapped disabled control rendered and disabled', () => {
    const { getByRole } = render(
      <DisabledReason reason="Connect a Meta account first">
        <button type="button" disabled>
          Generate
        </button>
      </DisabledReason>,
    );
    const button = getByRole('button', { name: 'Generate' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('exposes the reason to assistive tech without requiring hover', () => {
    const { getByText, container } = render(
      <DisabledReason reason="Connect a Meta account first">
        <button type="button" disabled>
          Generate
        </button>
      </DisabledReason>,
    );
    const description = getByText('Connect a Meta account first');
    const trigger = container.querySelector('[aria-describedby]');
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-describedby')).toBe(description.id);
    expect(description.id).not.toBe('');
  });

  it('includes what unlocks the control in the accessible description', () => {
    const { getByText } = render(
      <DisabledReason reason="Connect a Meta account first" unlocks="campaign pacing and heatmaps">
        <button type="button" disabled>
          Generate
        </button>
      </DisabledReason>,
    );
    expect(
      getByText(/Connect a Meta account first Unlocks campaign pacing and heatmaps/),
    ).toBeTruthy();
  });
});
