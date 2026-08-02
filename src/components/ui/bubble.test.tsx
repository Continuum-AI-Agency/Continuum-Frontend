import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

import { Bubble, BubbleContent } from './bubble';

// A bubble that CLIPS its overflow silently truncates any child wider than the column — a
// markdown table, a code block, a long unbroken URL — and the reader has no way to see the
// rest. Containment still matters (a wide child must not push the transcript sideways), so
// the fix is to scroll, not to clip and not to let it spill.
describe('BubbleContent overflow', () => {
  afterEach(() => cleanup());

  it('scrolls a wide child horizontally instead of clipping it', () => {
    const { container } = render(
      <Bubble>
        <BubbleContent>content</BubbleContent>
      </Bubble>,
    );

    const content = container.querySelector('[data-slot="bubble-content"]');
    expect(content).not.toBeNull();
    expect(content!.className).toContain('overflow-x-auto');
    expect(content!.className).not.toContain('overflow-hidden');
  });

  it('still constrains itself to the column and allows prose to wrap', () => {
    const { container } = render(
      <Bubble>
        <BubbleContent>content</BubbleContent>
      </Bubble>,
    );

    const content = container.querySelector('[data-slot="bubble-content"]');
    expect(content!.className).toContain('max-w-full');
    expect(content!.className).toContain('min-w-0');
    expect(content!.className).toContain('wrap-break-word');
  });
});
