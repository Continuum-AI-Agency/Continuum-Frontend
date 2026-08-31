import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { ColorField } from './color-field';

const renderField = (value: string | null = '#ff0000') => {
  const onChange = mock((_hex: string) => {});
  const utils = render(<ColorField label="Background" onChange={onChange} value={value} />);
  return { ...utils, onChange };
};

const openPicker = (getByLabelText: (text: string) => HTMLElement) => {
  fireEvent.click(getByLabelText('Background colour'));
};

describe('ColorField', () => {
  afterEach(cleanup);

  it('shows the colour on the trigger without opening anything', () => {
    const { container, getByText } = renderField('#ff0000');

    const swatch = container.querySelector('[data-slot="color-field-swatch"]');
    expect((swatch as HTMLElement | null)?.style.background).toContain('#ff0000');
    expect(getByText('#ff0000')).toBeTruthy();
  });

  it('reads an unset colour as Auto and a checkerboard, not as black', () => {
    const { container, getByText } = renderField(null);

    const swatch = container.querySelector('[data-slot="color-field-swatch"]');
    expect((swatch as HTMLElement | null)?.style.background).toContain('repeating-conic-gradient');
    expect(getByText('Auto')).toBeTruthy();
  });

  it('writes nothing until the user changes something', () => {
    // The upstream Kibo picker emits from a mount effect, which dirties a node the moment
    // its popover opens. Opening must be free.
    const { onChange, getByLabelText } = renderField('#ff0000');
    openPicker(getByLabelText);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('round-trips a hex typed into the box', () => {
    const { onChange, getByLabelText } = renderField('#ff0000');
    openPicker(getByLabelText);

    fireEvent.change(getByLabelText('Hex colour'), { target: { value: '#0f1f43' } });

    expect(onChange).toHaveBeenLastCalledWith('#0f1f43');
  });

  it('ignores a half-typed hex rather than committing a colour nobody chose', () => {
    const { onChange, getByLabelText } = renderField('#ff0000');
    openPicker(getByLabelText);

    fireEvent.change(getByLabelText('Hex colour'), { target: { value: '#0f1' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits six-digit hex when the hue moves, never an rgba array', () => {
    const { onChange, getByLabelText, baseElement } = renderField('#ff0000');
    openPicker(getByLabelText);

    // Keyboard is the honest path in a DOM with no layout: a pointer drag makes Base UI's
    // slider read its own geometry, but arrow keys are pure value arithmetic. The thumb's
    // hidden input is where those land.
    const thumb = baseElement.querySelector('[data-slot="color-picker-hue"] input');
    fireEvent.keyDown(thumb as Element, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('points the crosshair at the colour it opened on, not at white', () => {
    // Upstream keeps the crosshair position in its own state, initialised to 0,0 and never
    // synced — so opening on red pointed at white. Red is full saturation, top row.
    const { getByLabelText, baseElement } = renderField('#ff0000');
    openPicker(getByLabelText);

    const marker = baseElement.querySelector(
      '[data-slot="color-picker-selection"] > div',
    ) as HTMLElement | null;
    expect(marker?.style.left).toBe('100%');
    expect(marker?.style.top).toBe('0%');
  });
});
