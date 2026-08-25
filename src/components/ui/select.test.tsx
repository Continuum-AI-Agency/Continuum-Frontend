import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

import { Select, SelectTrigger, SelectValue } from './select';

afterEach(cleanup);

// D-06: Base UI's Value falls back to String(value) when it has no formatter, so a bare
// trigger painted the raw stored value ("color" instead of "Color/Theme"). The wrapper's
// `items` prop maps value→label; everything else must behave exactly as before.
describe('SelectValue', () => {
  const trigger = (container: HTMLElement): HTMLElement => {
    const value = container.querySelector('[data-slot="select-value"]');
    if (!(value instanceof HTMLElement)) throw new Error('select-value did not render');
    return value;
  };

  it('maps the stored value to its label via items', () => {
    const { container } = render(
      <Select value="color">
        <SelectTrigger>
          <SelectValue items={{ color: 'Color/Theme', product: 'Product' }} />
        </SelectTrigger>
      </Select>,
    );
    expect(trigger(container).textContent).toBe('Color/Theme');
  });

  it('falls back to the raw value for a value the items map does not know', () => {
    const { container } = render(
      <Select value="person">
        <SelectTrigger>
          <SelectValue items={{ color: 'Color/Theme' }} />
        </SelectTrigger>
      </Select>,
    );
    expect(trigger(container).textContent).toBe('person');
  });

  it('keeps the placeholder when items are given but nothing is selected', () => {
    const { container } = render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Type" items={{ color: 'Color/Theme' }} />
        </SelectTrigger>
      </Select>,
    );
    expect(trigger(container).textContent).toBe('Type');
  });

  it('changes nothing for call sites that pass no items', () => {
    const { container } = render(
      <Select value="color">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    expect(trigger(container).textContent).toBe('color');
  });

  it('lets explicit children win over items', () => {
    const { container } = render(
      <Select value="color">
        <SelectTrigger>
          <SelectValue items={{ color: 'Color/Theme' }}>
            {(value: unknown) => `custom:${String(value)}`}
          </SelectValue>
        </SelectTrigger>
      </Select>,
    );
    expect(trigger(container).textContent).toBe('custom:color');
  });
});
