import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

import { Select, SelectTrigger, SelectValue } from './select';

afterEach(cleanup);

// PP-DT-E-canvas-small-copy (deep test 2026-10-31, lane E): the Campaign Canvas picker cut "EASY
// FIT // TEST AUDIENCIAS // MENSAJES" at its 260 px width with no ellipsis (scrollWidth 259 >
// 222). The shared trigger gave its value `line-clamp-1` AND `flex`: the clamp needs
// display:-webkit-box, `flex` replaces it, so overflow hid the text and nothing ellipsized it. A
// value that does not fit ends in an ellipsis: a block that truncates, and may shrink (min-w-0).
describe('SelectTrigger — a value that does not fit', () => {
  const NAME = 'EASY FIT // TEST AUDIENCIAS // MENSAJES';

  const parts = (container: HTMLElement) => {
    const value = container.querySelector('[data-slot="select-value"]');
    const trigger = container.querySelector('[data-slot="select-trigger"]');
    if (!(value instanceof HTMLElement) || !(trigger instanceof HTMLElement)) {
      throw new Error('the select did not render its trigger and value');
    }
    return { value, trigger };
  };

  it('ends the value in an ellipsis: it truncates, and is never a flex box', () => {
    const { container } = render(
      <Select value="p-1">
        <SelectTrigger className="w-[260px]">
          <SelectValue items={{ 'p-1': NAME }} />
        </SelectTrigger>
      </Select>,
    );
    const { value } = parts(container);
    expect(value.textContent).toBe(NAME);
    const classes = value.className.split(/\s+/);
    expect(classes).toContain('truncate');
    expect(classes).toContain('min-w-0');
    expect(classes).not.toContain('flex');
  });

  it('never lets the trigger put a flex box or a line clamp back on its value', () => {
    const { container } = render(
      <Select value="p-1">
        <SelectTrigger>
          <SelectValue items={{ 'p-1': NAME }} />
        </SelectTrigger>
      </Select>,
    );
    const { trigger } = parts(container);
    expect(trigger.className).not.toContain('*:data-[slot=select-value]:flex');
    expect(trigger.className).not.toContain('*:data-[slot=select-value]:line-clamp-1');
  });
});
