import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// The real Base UI menus and popover: a stub here is process-wide in bun and would replace
// every other spec's menus too.
mock.module('@/lib/organic/scheduling', () => ({
  normalizeTimeLabel: (value: string) => value,
}));

afterAll(() => mock.restore());

import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { PostMetaChips } from './PostMetaChips';

function setup(overrides: Partial<Parameters<typeof PostMetaChips>[0]> = {}) {
  const props = {
    platforms: ['instagram'] as OrganicPlatformKey[],
    format: 'Post',
    timeLabel: '9:00 AM',
    onFormatChange: mock(),
    onTimeChange: mock(),
    ...overrides,
  };
  render(<PostMetaChips {...props} />);
  return props;
}

describe('PostMetaChips', () => {
  beforeEach(() => {
    cleanup();
  });

  const openFormat = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Change format' }));
    return screen.getByRole('menu');
  };
  const openTime = () => fireEvent.click(screen.getByRole('button', { name: 'Edit posting time' }));

  it('renders the glanceable format · time chips', () => {
    setup();
    expect(screen.getByLabelText('Change format').textContent).toContain('Post');
    expect(screen.getByLabelText('Edit posting time').textContent).toContain('9:00 AM');
  });

  it("renders the caller's platform control first, and no platform chip of its own", () => {
    setup({ platformControl: <button type="button">Platforms here</button> });
    expect(screen.getByText('Platforms here')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Change platforms/ })).toBeNull();
  });

  it('offers only Reel once YouTube is selected, since YouTube publishes nothing else', () => {
    setup({ platforms: ['instagram', 'youtube'], format: 'Reel' });
    const options = within(openFormat())
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(options).toEqual(['Reel']);
  });

  it('changes format from the chip menu', () => {
    const { onFormatChange } = setup();
    fireEvent.click(within(openFormat()).getByRole('menuitem', { name: 'Reel' }));
    expect(onFormatChange).toHaveBeenCalledWith('Reel');
  });

  it('changes time from a quick option', () => {
    const { onTimeChange } = setup();
    openTime();
    fireEvent.click(screen.getByRole('button', { name: '1:00 PM' }));
    expect(onTimeChange).toHaveBeenCalledWith('1:00 PM');
  });

  // L-03: the preset compared `time === draft.timeLabel` as a RAW STRING, so any label the
  // presets do not spell identically marked nothing active — including the persistence
  // layer's own `09:00` and its "12:00 AM" fallback.
  describe('active value marking', () => {
    const preset = (label: string) => {
      if (!screen.queryByRole('button', { name: label })) openTime();
      return screen.getByRole('button', { name: label });
    };

    it('marks the preset that matches the stored label exactly', () => {
      setup({ timeLabel: '9:00 AM' });
      expect(preset('9:00 AM').getAttribute('aria-pressed')).toBe('true');
      expect(preset('1:00 PM').getAttribute('aria-pressed')).toBe('false');
    });

    it('marks the preset for a non-canonical stored label', () => {
      setup({ timeLabel: '09:00 AM' });
      expect(preset('9:00 AM').getAttribute('aria-pressed')).toBe('true');
    });

    it('marks the preset for the canonical 24-hour label the backend persists', () => {
      setup({ timeLabel: '17:00' });
      expect(preset('5:00 PM').getAttribute('aria-pressed')).toBe('true');
      expect(preset('9:00 AM').getAttribute('aria-pressed')).toBe('false');
    });

    it('marks nothing active for a stored label that is not a preset', () => {
      setup({ timeLabel: '12:00 AM' });
      for (const label of ['9:00 AM', '1:00 PM', '5:00 PM']) {
        expect(preset(label).getAttribute('aria-pressed')).toBe('false');
      }
    });

    it('marks exactly the current format, which the menu used not to indicate at all', () => {
      setup({ format: 'Reel' });

      const marks = within(openFormat()).getAllByLabelText('Current format');
      expect(marks).toHaveLength(1);
      expect(marks[0].closest('[role="menuitem"]')?.textContent).toBe('Reel');
    });

    it('marks the current format for a differently-cased stored value', () => {
      setup({ format: 'carousel' });

      const marks = within(openFormat()).getAllByLabelText('Current format');
      expect(marks).toHaveLength(1);
      expect(marks[0].closest('[role="menuitem"]')?.textContent).toBe('Carousel');
    });
  });

  it('renders the trailing actions slot', () => {
    setup({ actions: <button type="button">Menu</button> });
    expect(screen.getByText('Menu')).toBeTruthy();
  });
});
