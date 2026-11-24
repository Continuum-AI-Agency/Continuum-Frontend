'use client';

import { Tabs } from '@base-ui/react/tabs';
import type { LucideIcon } from 'lucide-react';
import { warmSection } from '@/components/settings/lazySections';
import { intentProps } from '@/lib/intent';
import { cn } from '@/lib/utils';
import type { SectionKey } from './sections';

type SettingsNavItemProps = {
  value: SectionKey;
  label: string;
  icon: LucideIcon;
};

export function SettingsNavItem({ value, label, icon: Icon }: SettingsNavItemProps) {
  return (
    <Tabs.Tab
      value={value}
      {...intentProps(() => warmSection(value))}
      className={cn(
        'group relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium',
        'text-muted-foreground transition-colors duration-150',
        'hover:bg-muted/40 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        // Base UI marks the selected tab with `data-active` (Radix's `data-state` is gone).
        'data-active:bg-muted/50 data-active:text-foreground',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-primary',
          'opacity-0 transition-opacity duration-150',
          'group-data-active:opacity-100',
        )}
      />
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </Tabs.Tab>
  );
}
