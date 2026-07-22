import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Wand2 } from 'lucide-react';

// happy-dom does not expose SyntaxError on its window object, which causes
// @testing-library/dom's querySelectorAll internals to crash. Polyfill it.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

mock.module('@dnd-kit/core', () => ({
  useDroppable: mock(() => ({ setNodeRef: mock(), isOver: false })),
}));

mock.module('motion/react', () => ({
  useReducedMotion: () => false,
}));

afterAll(() => mock.restore());

import { PreviewMediaDropZone } from './PreviewMediaDropZone';

describe('PreviewMediaDropZone — fallback actions', () => {
  beforeEach(() => cleanup());

  it('renders a fallback action alongside the library/upload split and routes clicks to it', () => {
    const onSelect = mock();
    const onActivate = mock();
    render(
      <PreviewMediaDropZone
        isActive={false}
        state="fallback"
        slotId="slot-1"
        onActivate={onActivate}
        onSelectLibrary={mock()}
        fallbackActions={[
          {
            key: 'generate',
            label: 'Generate media',
            icon: <Wand2 className="h-4 w-4" />,
            onSelect,
          },
        ]}
      />,
    );

    expect(screen.getByText('Select from library')).toBeTruthy();
    expect(screen.getByText('Upload from your computer')).toBeTruthy();

    const action = screen.getByRole('button', { name: 'Generate media' });
    fireEvent.click(action);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('disables a busy action and swaps in its busy label', () => {
    const onSelect = mock();
    render(
      <PreviewMediaDropZone
        isActive={false}
        state="fallback"
        slotId="slot-1"
        fallbackActions={[
          {
            key: 'generate',
            label: 'Generate media',
            busyLabel: 'Generating media…',
            busy: true,
            icon: <Wand2 className="h-4 w-4" />,
            onSelect,
          },
        ]}
      />,
    );

    const action = screen.getByRole('button', { name: 'Generating media…' });
    expect((action as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(action);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders the plain library/upload split when no actions are provided', () => {
    render(<PreviewMediaDropZone isActive={false} state="fallback" slotId="slot-1" />);

    expect(screen.getByText('Select from library')).toBeTruthy();
    expect(screen.queryByText('Generate media')).toBeNull();
  });
});
