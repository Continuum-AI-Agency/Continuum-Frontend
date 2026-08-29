import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

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
});
