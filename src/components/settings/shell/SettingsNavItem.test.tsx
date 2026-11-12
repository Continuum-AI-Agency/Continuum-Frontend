import { afterEach, describe, expect, it } from 'bun:test';
import { Tabs } from '@base-ui/react/tabs';
import { cleanup } from '@testing-library/react';
import { IdCard } from 'lucide-react';
import { render } from '@/i18n/__tests__/render';
import { SettingsNavItem } from './SettingsNavItem';

// APP-SWEEP-settings-selected-tab-invisible: every Settings page drew its selected section
// ("General", aria-selected) exactly like its siblings. The item styled itself on Radix's
// `data-state="active"`, which Base UI's Tab never sets — it marks the selected tab with
// `data-active`. A state variant keyed on an attribute the element never carries is dead CSS.
afterEach(cleanup);

/** The `data-…` attribute each Tailwind state variant in `className` waits for. */
function stateVariantAttributes(className: string): { name: string; value: string | null }[] {
  const found: { name: string; value: string | null }[] = [];
  for (const match of className.matchAll(/data-\[([a-z-]+)(?:=([a-z-]+))?\]:/g)) {
    found.push({ name: `data-${match[1]}`, value: match[2] ?? null });
  }
  for (const match of className.matchAll(/(?:^|[\s:])data-([a-z-]+):/g)) {
    if (match[1] && !match[1].startsWith('['))
      found.push({ name: `data-${match[1]}`, value: null });
  }
  return found;
}

describe('SettingsNavItem', () => {
  it('styles the selected section on an attribute its Base UI tab actually carries', () => {
    const { getByRole } = render(
      <Tabs.Root value="general">
        <Tabs.List>
          <SettingsNavItem icon={IdCard} label="General" value="general" />
          <SettingsNavItem icon={IdCard} label="Brand Book" value="brand-book" />
        </Tabs.List>
      </Tabs.Root>,
    );

    const selected = getByRole('tab', { name: 'General' });
    const variants = stateVariantAttributes(selected.className);
    expect(variants.length).toBeGreaterThan(0);
    for (const { name, value } of variants) {
      const actual = selected.getAttribute(name);
      expect(actual === null ? `${name} missing` : value === null || actual === value).toBe(true);
    }
  });
});
