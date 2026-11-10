import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';

import { NumberScrubField } from './number-field';

const input = (container: HTMLElement) =>
  container.querySelector('[data-slot="number-scrub-field"] input') as HTMLInputElement;

describe('NumberScrubField', () => {
  afterEach(cleanup);

  it('reports a typed value to the caller', () => {
    const onChange = mock(() => {});
    const { container } = render(
      <NumberScrubField label="Start" min={0} step={0.1} value={0} onChange={onChange} />,
    );

    fireEvent.change(input(container), { target: { value: '1.5' } });

    expect(onChange).toHaveBeenCalledWith(1.5);
  });

  it('clears a nullable field to null, never to zero', () => {
    // `startSec: null` means "no window", which 0 would silently turn into a real value.
    const onChange = mock(() => {});
    const { container } = render(
      <NumberScrubField label="Start" nullable step={0.1} value={2} onChange={onChange} />,
    );

    fireEvent.change(input(container), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('says nothing at all when a field that cannot be unset is emptied', () => {
    const onChange = mock(() => {});
    const { container } = render(
      <NumberScrubField label="Copies" min={1} step={1} value={2} onChange={onChange} />,
    );

    fireEvent.change(input(container), { target: { value: '' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows Auto as the placeholder for a field that can be unset', () => {
    const { container } = render(
      <NumberScrubField label="Start" nullable step={0.1} value={null} onChange={() => {}} />,
    );

    expect(input(container).getAttribute('placeholder')).toBe('Auto');
    expect(input(container).value).toBe('');
  });

  it('lets a terse visible label carry a fuller accessible name', () => {
    const { getByLabelText, getByText } = render(
      <NumberScrubField
        ariaLabel="Burn-in start seconds"
        label="Start"
        step={0.1}
        value={1}
        onChange={() => {}}
      />,
    );

    expect(getByText('Start')).toBeTruthy();
    expect(getByLabelText('Burn-in start seconds')).toBeTruthy();
  });

  it('makes the label a scrub handle', () => {
    const { getByText } = render(
      <NumberScrubField label="Width" step={1} value={100} onChange={() => {}} />,
    );

    expect(getByText('Width').className).toContain('cursor-ew-resize');
  });

  it('drops the steppers inline, where they would crowd out the digits', () => {
    const { container: stacked } = render(
      <NumberScrubField label="Gain" step={0.1} value={1} onChange={() => {}} />,
    );
    expect(stacked.querySelectorAll('button').length).toBe(2);

    cleanup();

    const { container: inline } = render(
      <NumberScrubField
        label="Gain"
        orientation="inline"
        step={0.1}
        value={1}
        onChange={() => {}}
      />,
    );
    expect(inline.querySelectorAll('button').length).toBe(0);
  });

  it('holds a commit back until the value settles', () => {
    // Trim fields re-cut the timeline on every write, so they listen for the commit,
    // not for each keystroke.
    const onCommit = mock(() => {});
    const { container } = render(
      <NumberScrubField defaultValue={2} label="Trim in" step={0.1} onCommit={onCommit} />,
    );

    fireEvent.change(input(container), { target: { value: '3' } });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(input(container));
    expect(onCommit).toHaveBeenCalledWith(3);
  });

  it('preserves untouched source precision when a pointer leaves Y to undo an X edit', () => {
    const original = { x: 544.494198358019, y: 1013.7701297156863 };
    const changedY = mock(() => {});
    function Editor() {
      const [history, setHistory] = useState({
        present: original,
        past: [] as (typeof original)[],
      });
      const edit = (change: Partial<typeof original>) =>
        setHistory((current) => ({
          present: { ...current.present, ...change },
          past: [...current.past, current.present],
        }));
      return (
        <>
          <NumberScrubField label="X" value={history.present.x} onChange={(x) => edit({ x })} />
          <NumberScrubField
            label="Y"
            value={history.present.y}
            onChange={(y) => {
              changedY();
              edit({ y });
            }}
          />
          <button
            type="button"
            onClick={() =>
              setHistory((current) => ({
                present: current.past.at(-1)!,
                past: current.past.slice(0, -1),
              }))
            }
          >
            Undo
          </button>
          <output>{JSON.stringify(history.present)}</output>
        </>
      );
    }
    const { getByLabelText, getByRole } = render(<Editor />);
    const x = getByLabelText('X');
    const y = getByLabelText('Y');
    const undo = getByRole('button', { name: 'Undo' });
    fireEvent.focus(x);
    fireEvent.change(x, { target: { value: '561.74' } });
    fireEvent.blur(x, { relatedTarget: y });
    fireEvent.focus(y);
    fireEvent.pointerDown(undo, { pointerType: 'mouse', button: 0 });
    fireEvent.blur(y, { relatedTarget: undo });
    fireEvent.focus(undo);
    fireEvent.pointerUp(undo, { pointerType: 'mouse', button: 0 });
    fireEvent.click(undo);
    expect(changedY).not.toHaveBeenCalled();
    expect(getByRole('status').textContent).toBe(JSON.stringify(original));
    expect((x as HTMLInputElement).value).toBe('544.49');
  });

  it('keeps uncontrolled source precision on passive blur without a change or commit', () => {
    const onChange = mock(() => {});
    const onCommit = mock(() => {});
    const { container } = render(
      <NumberScrubField
        label="Y"
        defaultValue={1013.7701297156863}
        onChange={onChange}
        onCommit={onCommit}
      />,
    );
    fireEvent.focus(input(container));
    fireEvent.blur(input(container));
    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('still commits an actual typed value clamped to the configured bound', () => {
    const onCommit = mock(() => {});
    const { container } = render(
      <NumberScrubField label="Copies" defaultValue={2} min={1} max={10} onCommit={onCommit} />,
    );
    fireEvent.focus(input(container));
    fireEvent.change(input(container), { target: { value: '30' } });
    fireEvent.blur(input(container));
    expect(input(container).value).toBe('10');
    expect(onCommit).toHaveBeenCalledWith(10);
  });

  it('still reports and commits keyboard stepping before passive blur', () => {
    const onChange = mock(() => {});
    const onCommit = mock(() => {});
    const { container } = render(
      <NumberScrubField label="Copies" defaultValue={2} onChange={onChange} onCommit={onCommit} />,
    );
    fireEvent.focus(input(container));
    fireEvent.keyDown(input(container), { key: 'ArrowUp' });
    fireEvent.keyUp(input(container), { key: 'ArrowUp' });
    fireEvent.blur(input(container));
    expect(onChange).toHaveBeenCalledWith(3);
    expect(onCommit).toHaveBeenCalledWith(3);
    expect(input(container).value).toBe('3');
  });
});
