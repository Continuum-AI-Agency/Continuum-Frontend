import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { SliderField } from './slider-field';

const renderField = (props: Partial<Parameters<typeof SliderField>[0]> = {}) => {
  const onChange = mock(() => {});
  const utils = render(
    <SliderField
      label="Opacity"
      max={1}
      min={0}
      step={0.05}
      value={0.85}
      onChange={onChange}
      {...props}
    />,
  );
  return { ...utils, onChange };
};

describe('SliderField', () => {
  afterEach(cleanup);

  it('pairs the label with a readout of the current value', () => {
    const { getByText, container } = renderField();

    expect(getByText('Opacity')).toBeTruthy();
    expect(container.querySelector('[data-slot="number-flow-value"]')?.textContent).toBe('0.85');
  });

  it('formats the readout the way the caller asked, not the raw number', () => {
    const { container } = renderField({
      format: { style: 'percent', maximumFractionDigits: 0 },
    });

    expect(container.querySelector('[data-slot="number-flow-value"]')?.textContent).toBe('85%');
  });

  it('derives the readout decimals from the step when no format is given', () => {
    const { container } = renderField({ max: 360, min: -360, step: 1, value: 90 });

    expect(container.querySelector('[data-slot="number-flow-value"]')?.textContent).toBe('90');
  });

  it('carries the bounds onto the range input so the control is aimable', () => {
    const { container } = renderField();
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;

    expect(range.getAttribute('min')).toBe('0');
    expect(range.getAttribute('max')).toBe('1');
    expect(range.value).toBe('0.85');
  });

  it('reports a keyboard step back to the caller', () => {
    const { container, onChange } = renderField();
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;

    fireEvent.keyDown(range, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBeCloseTo(0.9, 5);
  });

  it('keeps a visible keyboard focus ring on the thumb', () => {
    // The fader this styling came from ships `focus-visible:ring-0` on the thumb, which
    // leaves the control unusable by keyboard. Geometry is overridden here; focus is not.
    const { container } = renderField();
    const thumb = container.querySelector('[data-slot="slider-thumb"]') as HTMLElement;

    expect(thumb.className).not.toContain('focus-visible:ring-0');
    expect(thumb.className).toContain('focus-visible:ring-3');
  });

  it('names the control for assistive tech', () => {
    const { getByLabelText } = renderField();

    expect(getByLabelText('Opacity')).toBeTruthy();
  });
});
