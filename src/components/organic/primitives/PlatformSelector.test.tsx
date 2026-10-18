import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  PUBLISH_PLATFORM_LABELS,
  PUBLISH_PLATFORM_ORDER,
  type PublishPlatform,
} from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { PlatformVerdict } from '@/lib/organic/platformSelection';
import { PlatformSelector } from './PlatformSelector';

afterEach(cleanup);

// Base UI mounts a portalled positioner; the first render in a busy run can be slow.
const TIMEOUT_MS = 30_000;

function verdictsWith(
  overrides: Partial<Record<PublishPlatform, PlatformVerdict>> = {},
): Record<PublishPlatform, PlatformVerdict> {
  const all = Object.fromEntries(
    PUBLISH_PLATFORM_ORDER.map((platform) => [platform, { available: true, reason: null }]),
  ) as Record<PublishPlatform, PlatformVerdict>;
  return { ...all, ...overrides };
}

function open(selected: PublishPlatform[], verdicts = verdictsWith()) {
  const onToggle = mock((_platform: PublishPlatform, _next: boolean) => {});
  render(<PlatformSelector selected={selected} verdicts={verdicts} onToggle={onToggle} />);
  fireEvent.click(screen.getByRole('button', { name: /^Change platforms/ }));
  return { onToggle, menu: screen.getByRole('menu') };
}

describe('PlatformSelector', () => {
  it(
    'names every selected platform in the trigger, in contracts order',
    () => {
      render(
        <PlatformSelector
          selected={['tiktok', 'instagram']}
          verdicts={verdictsWith()}
          onToggle={() => {}}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'Change platforms — Instagram, TikTok selected' }),
      ).toBeDefined();
    },
    TIMEOUT_MS,
  );

  it(
    'lists every platform once, named exactly by its contracts label, in contracts order',
    () => {
      const { menu } = open(['instagram']);
      const items = within(menu).getAllByRole('menuitemcheckbox');
      expect(items.map((item) => item.getAttribute('aria-label'))).toEqual(
        PUBLISH_PLATFORM_ORDER.map((platform) => PUBLISH_PLATFORM_LABELS[platform]),
      );
      expect(within(menu).getByRole('menuitemcheckbox', { name: 'TikTok' })).toBeDefined();
      expect(
        within(menu)
          .getByRole('menuitemcheckbox', { name: 'Instagram' })
          .getAttribute('aria-checked'),
      ).toBe('true');
    },
    TIMEOUT_MS,
  );

  it(
    'disables an unavailable platform and shows why',
    () => {
      const { menu, onToggle } = open(
        ['instagram', 'facebook'],
        verdictsWith({ x: { available: false, reason: 'Connect X to post here' } }),
      );
      const x = within(menu).getByRole('menuitemcheckbox', { name: 'X' });
      expect(x.getAttribute('aria-disabled')).toBe('true');
      const reason = x.querySelector('[data-platform-reason]');
      expect(reason?.textContent).toBe('Connect X to post here');
      expect(x.getAttribute('aria-describedby')).toBe(reason?.id ?? null);
      fireEvent.click(x);
      expect(onToggle).not.toHaveBeenCalled();
    },
    TIMEOUT_MS,
  );

  it(
    'calls onToggle with the platform and its next state',
    () => {
      const { menu, onToggle } = open(['instagram', 'facebook']);
      fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'TikTok' }));
      expect(onToggle).toHaveBeenLastCalledWith('tiktok', true);
      fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Facebook' }));
      expect(onToggle).toHaveBeenLastCalledWith('facebook', false);
    },
    TIMEOUT_MS,
  );

  it(
    'refuses to untick the last platform',
    () => {
      const { menu, onToggle } = open(['linkedin']);
      const linkedin = within(menu).getByRole('menuitemcheckbox', { name: 'LinkedIn' });
      expect(linkedin.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(linkedin);
      expect(onToggle).not.toHaveBeenCalled();
    },
    TIMEOUT_MS,
  );

  it(
    'disables the whole selector with a visible reason',
    () => {
      render(
        <PlatformSelector
          selected={['instagram']}
          verdicts={verdictsWith()}
          onToggle={() => {}}
          disabledReason="Saving…"
        />,
      );
      const trigger = screen.getByRole('button', { name: /^Change platforms/ });
      expect(
        trigger.hasAttribute('disabled') || trigger.getAttribute('aria-disabled') === 'true',
      ).toBe(true);
      expect(screen.getByText('Saving…')).toBeDefined();
    },
    TIMEOUT_MS,
  );
});
