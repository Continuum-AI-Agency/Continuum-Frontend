import { afterEach, describe, expect, it } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarDndContext } from './CalendarDndContext';
import { useDraftDragHandle } from './useDraftDragHandle';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// The real sensors, not a stub: what is under test is how dnd-kit's activation reads the DOM
// the handle puts on the chip, the same wiring the month chip and the week card use.
function Chip({ onOpen }: { onOpen: () => void }) {
  const { setNodeRef, listeners, setActivatorNodeRef, activatorAttributes, style } =
    useDraftDragHandle('draft-1');
  return (
    <div ref={setNodeRef} style={style} data-testid="wrapper" {...listeners}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...activatorAttributes}
        aria-pressed={false}
        onClick={onOpen}
      >
        Chip title
        <span data-testid="nested-action">Retry</span>
      </button>
    </div>
  );
}

function renderChip() {
  const opened: string[] = [];
  render(
    <CalendarDndContext onDragEnd={() => undefined}>
      <Chip onOpen={() => opened.push('open')} />
    </CalendarDndContext>,
  );
  return { opened, button: screen.getByRole('button', { name: /Chip title/ }) };
}

const space = { key: ' ', code: 'Space' };

describe('useDraftDragHandle', () => {
  afterEach(cleanup);

  it('leaves the wrapper out of the tab order so the chip is one tab stop', () => {
    const { button } = renderChip();
    const wrapper = screen.getByTestId('wrapper');

    expect(wrapper.getAttribute('role')).toBeNull();
    expect(wrapper.getAttribute('tabindex')).toBeNull();
    expect(wrapper.getAttribute('aria-roledescription')).toBeNull();
    expect(button.getAttribute('tabindex')).toBeNull();
  });

  it('describes the button itself as draggable and points it at the keyboard instructions', () => {
    const { button } = renderChip();

    expect(button.getAttribute('aria-roledescription')).toBe('draggable');
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toContain('space bar');
  });

  it('starts a keyboard drag on Space, flags it, and Escape cancels it', async () => {
    const { button } = renderChip();

    fireEvent.keyDown(button, space);
    expect(button.getAttribute('data-dragging')).toBe('true');
    // Selection owns aria-pressed; the drag must not overwrite it.
    expect(button.getAttribute('aria-pressed')).toBe('false');

    // The sensor attaches its document keydown listener on the next task.
    await act(() => new Promise((settle) => setTimeout(settle, 0)));
    // The overlay's drop animation settles on the next task too.
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      await new Promise((settle) => setTimeout(settle, 0));
    });
    expect(button.getAttribute('data-dragging')).toBeNull();
  });

  it('does not start a drag on Enter, which stays the open action', () => {
    const { button, opened } = renderChip();

    fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
    fireEvent.click(button);

    expect(button.getAttribute('data-dragging')).toBeNull();
    expect(opened).toEqual(['open']);
  });

  it('ignores a Space that bubbles up from a nested action inside the chip', () => {
    const { button } = renderChip();

    fireEvent.keyDown(screen.getByTestId('nested-action'), space);

    expect(button.getAttribute('data-dragging')).toBeNull();
  });
});
