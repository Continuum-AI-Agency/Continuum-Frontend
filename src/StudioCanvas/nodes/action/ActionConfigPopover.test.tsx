import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';

// The real popover and select are Base UI popups. Stubbing them mounts the controls
// eagerly, which is what these assertions are about — the field descriptors turning
// into the right controls, and a change reaching the config patcher.
mock.module('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
mock.module('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select
      data-testid="config-select"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

const patch = mock();
mock.module('../../hooks/useNodeConfigPatch', () => ({
  useNodeConfigPatch: () => patch,
}));

import type { ActionId } from '@continuum/contracts';
import { parseActionConfig } from '../../utils/actions/actionConfig';
import { ActionConfigPopover } from './ActionConfigPopover';

const renderPopover = (actionId: ActionId, config: Record<string, unknown> = {}) =>
  render(<ActionConfigPopover nodeId="node-1" actionId={actionId} config={config} />);

describe('ActionConfigPopover', () => {
  beforeEach(() => {
    patch.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders image.rotate as one bounded number control', () => {
    const { container } = renderPopover('image.rotate');

    const numbers = container.querySelectorAll('input[type="number"]');
    expect(numbers.length).toBe(1);
    expect(numbers[0].getAttribute('min')).toBe('-360');
    expect(numbers[0].getAttribute('max')).toBe('360');
    expect((numbers[0] as HTMLInputElement).value).toBe('90');
  });

  it('renders text.findReplace as two text inputs and one boolean', () => {
    const { container } = renderPopover('text.findReplace');

    expect(container.querySelectorAll('input[type="text"]').length).toBe(2);
    expect(container.querySelectorAll('[role="switch"]').length).toBe(1);
  });

  it('renders an enum field as a select over the schema options', () => {
    const { getByTestId } = renderPopover('image.filter');

    const options = Array.from(getByTestId('config-select').querySelectorAll('option')).map(
      (option) => option.getAttribute('value'),
    );
    expect(options).toEqual(['none', 'noir', 'vivid', 'faded', 'warm', 'cool', 'mono']);
  });

  it('patches the whole merged config when a value changes', () => {
    const { container } = renderPopover('image.rotate');

    fireEvent.change(container.querySelector('input[type="number"]') as HTMLInputElement, {
      target: { value: '180' },
    });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith('node-1', 'action', {
      config: { ...parseActionConfig('image.rotate', {}), degrees: 180 },
    });
  });

  it('flips a boolean through the switch', () => {
    const { container } = renderPopover('text.findReplace');

    fireEvent.click(container.querySelector('[role="switch"]') as HTMLElement);

    expect(patch).toHaveBeenCalledWith('node-1', 'action', {
      config: { ...parseActionConfig('text.findReplace', {}), caseSensitive: true },
    });
  });

  it('sets a nullable field back to null rather than to zero', () => {
    // `startSec: null` on video.overlay means "no window", which 0 ("start at zero")
    // would silently change into a real value.
    const { getByLabelText } = renderPopover('video.overlay', { startSec: 2 });

    fireEvent.click(getByLabelText('Clear Start Seconds'));

    expect(patch).toHaveBeenCalledWith('node-1', 'action', {
      config: { ...parseActionConfig('video.overlay', { startSec: 2 }), startSec: null },
    });
  });

  it('clears a nullable number when its input is emptied', () => {
    const { container } = renderPopover('video.overlay', { startSec: 2 });
    const startSec = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="number"]'),
    ).find((input) => input.value === '2');

    fireEvent.change(startSec as HTMLInputElement, { target: { value: '' } });

    expect(patch).toHaveBeenCalledWith('node-1', 'action', {
      config: { ...parseActionConfig('video.overlay', { startSec: 2 }), startSec: null },
    });
  });
});
