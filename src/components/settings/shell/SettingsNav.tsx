'use client';

import { Tabs } from '@base-ui/react/tabs';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { SettingsNavItem } from './SettingsNavItem';
import { ACCOUNT_SECTIONS, BRAND_SECTIONS, sectionMessageKeys } from './sections';

type SettingsNavProps = {
  brandPill: ReactNode;
  accountPill: ReactNode;
};

export function SettingsNav({ brandPill, accountPill }: SettingsNavProps) {
  const tUi = useTranslations('settings');

  return (
    <Tabs.List aria-label={tUi('m_2e7109bda2')} className="flex flex-col gap-6">
      <NavGroup label={tUi('m_62b4aa574f')} pill={brandPill}>
        {BRAND_SECTIONS.map((section) => (
          <SettingsNavItem
            key={section.key}
            value={section.key}
            label={tUi(sectionMessageKeys[section.key])}
            icon={section.icon}
          />
        ))}
      </NavGroup>
      <NavGroup label={tUi('m_85dfa32c97')} pill={accountPill}>
        {ACCOUNT_SECTIONS.map((section) => (
          <SettingsNavItem
            key={section.key}
            value={section.key}
            label={tUi(sectionMessageKeys[section.key])}
            icon={section.icon}
          />
        ))}
      </NavGroup>
    </Tabs.List>
  );
}

type NavGroupProps = {
  label: string;
  pill: ReactNode;
  children: ReactNode;
};

function NavGroup({ label, pill, children }: NavGroupProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          {label}
        </span>
        {pill}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
