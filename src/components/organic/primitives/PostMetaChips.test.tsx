import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { InputHTMLAttributes, ReactNode } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Radix's real menu needs a portal + pointer capture happy-dom cannot provide. The stub
// keeps the two behaviours the multi-select depends on: `onSelect` runs first and can
// preventDefault (which is what stops Radix closing after the first toggle), and a
// disabled item fires nothing at all.
let lastSelectWasPrevented: boolean | null = null;

mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    disabled,
    onSelect,
    onCheckedChange,
  }: {
    children: ReactNode;
    checked?: boolean;
    disabled?: boolean;
    onSelect?: (event: { preventDefault: () => void }) => void;
    onCheckedChange?: (next: boolean) => void;
  }) => (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        let prevented = false;
        onSelect?.({
          preventDefault: () => {
            prevented = true;
          },
        });
        lastSelectWasPrevented = prevented;
        onCheckedChange?.(!checked);
      }}
    >
      {children}
    </button>
  ),
}));

mock.module('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

mock.module('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

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
    onPlatformsChange: mock(),
    onFormatChange: mock(),
    onTimeChange: mock(),
    ...overrides,
  };
  render(<PostMetaChips {...props} />);
  return props;
}

const platformChip = () => screen.getByRole('button', { name: /Change platforms/ });
const platformOption = (label: string) => screen.getByRole('menuitemcheckbox', { name: label });

describe('PostMetaChips', () => {
  beforeEach(() => {
    cleanup();
    lastSelectWasPrevented = null;
  });

  it('renders the glanceable platform · format · time chips', () => {
    setup();
    expect(platformChip().textContent).toContain('Instagram');
    expect(screen.getByLabelText('Change format').textContent).toContain('Post');
    expect(screen.getByLabelText('Edit posting time').textContent).toContain('9:00 AM');
  });

  it('labels the chip with the platform name at one selection', () => {
    setup();
    // Byte-identical to the single-platform chip this replaced.
    expect(platformChip().textContent).toBe('Instagram');
  });

  it('labels the chip with both names at two selections', () => {
    setup({ platforms: ['instagram', 'linkedin'] });
    expect(platformChip().textContent).toBe('Instagram + LinkedIn');
  });

  it('labels the chip with a count at three selections', () => {
    setup({ platforms: ['instagram', 'facebook', 'linkedin'] });
    expect(platformChip().textContent).toBe('3 platforms');
  });

  it('names every selected platform in the aria-label, including at the count label', () => {
    setup({ platforms: ['instagram', 'facebook', 'linkedin'] });
    expect(platformChip().getAttribute('aria-label')).toBe(
      'Change platforms — Instagram, Facebook, LinkedIn selected',
    );
  });

  it('adds a platform without closing the menu', () => {
    const { onPlatformsChange } = setup();
    fireEvent.click(platformOption('LinkedIn'));

    expect(onPlatformsChange).toHaveBeenCalledWith(['instagram', 'linkedin']);
    // Radix closes the menu on select by default; preventDefault is what keeps a
    // multi-select multi.
    expect(lastSelectWasPrevented).toBe(true);
  });

  it('removes an already-selected platform', () => {
    const { onPlatformsChange } = setup({ platforms: ['instagram', 'linkedin'] });
    fireEvent.click(platformOption('Instagram'));
    expect(onPlatformsChange).toHaveBeenCalledWith(['linkedin']);
  });

  it('always reports the selection in the menu order, whatever order it arrives in', () => {
    const { onPlatformsChange } = setup({ platforms: ['linkedin'] });
    fireEvent.click(platformOption('Instagram'));
    expect(onPlatformsChange).toHaveBeenCalledWith(['instagram', 'linkedin']);
  });

  it('disables the last remaining platform — zero platforms is not representable', () => {
    const { onPlatformsChange } = setup({ platforms: ['linkedin'] });

    const sole = platformOption('LinkedIn');
    expect(sole.hasAttribute('disabled')).toBe(true);

    fireEvent.click(sole);
    expect(onPlatformsChange).not.toHaveBeenCalled();
  });

  it('leaves the other platforms enabled while one is selected', () => {
    setup({ platforms: ['linkedin'] });
    expect(platformOption('Instagram').hasAttribute('disabled')).toBe(false);
    expect(platformOption('Facebook').hasAttribute('disabled')).toBe(false);
  });

  it('changes format from the chip menu', () => {
    const { onFormatChange } = setup();
    fireEvent.click(screen.getByText('Reel'));
    expect(onFormatChange).toHaveBeenCalledWith('Reel');
  });

  it('changes time from a quick option', () => {
    const { onTimeChange } = setup();
    fireEvent.click(screen.getByText('1:00 PM'));
    expect(onTimeChange).toHaveBeenCalledWith('1:00 PM');
  });

  // L-03: the preset compared `time === draft.timeLabel` as a RAW STRING, so any label the
  // presets do not spell identically marked nothing active — including the persistence
  // layer's own `09:00` and its "12:00 AM" fallback.
  describe('active value marking', () => {
    const preset = (label: string) => screen.getByRole('button', { name: label });

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

      const marks = screen.getAllByLabelText('Current format');
      expect(marks).toHaveLength(1);
      expect(marks[0].closest('button')?.textContent).toBe('Reel');
    });

    it('marks the current format for a differently-cased stored value', () => {
      setup({ format: 'carousel' });

      const marks = screen.getAllByLabelText('Current format');
      expect(marks).toHaveLength(1);
      expect(marks[0].closest('button')?.textContent).toBe('Carousel');
    });
  });

  it('renders the trailing actions slot', () => {
    setup({ actions: <button type="button">Menu</button> });
    expect(screen.getByText('Menu')).toBeTruthy();
  });
});
