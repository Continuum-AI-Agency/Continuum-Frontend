'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { navigationMessageKeys } from './messageKeys';
import {
  APP_NAVIGATION,
  APP_NAVIGATION_FOOTER,
  APP_NAVIGATION_GROUPS,
  type AppNavigationItem,
  getContextualSuggestions,
} from './routes';

export function useNavigation() {
  const t = useTranslations('navigation');
  const label = useCallback(
    (source: string): string => {
      const key = Object.hasOwn(navigationMessageKeys, source)
        ? navigationMessageKeys[source as keyof typeof navigationMessageKeys]
        : undefined;
      return key ? t(key) : source;
    },
    [t],
  );
  return useMemo(() => {
    function item(value: AppNavigationItem): AppNavigationItem {
      return {
        ...value,
        label: label(value.label),
        description: value.description ? label(value.description) : undefined,
        disabledReason: value.disabledReason ? label(value.disabledReason) : undefined,
        items: value.items?.map((child) => ({ ...child, label: label(child.label) })),
        badge: value.badge ? { ...value.badge, label: label(value.badge.label) } : undefined,
      };
    }
    const items = APP_NAVIGATION.map(item);
    const footer = APP_NAVIGATION_FOOTER.map(item);
    const all = [...items, ...footer, ...items.flatMap((entry) => entry.items ?? [])];
    return {
      items,
      footer,
      groups: APP_NAVIGATION_GROUPS.map((group) => ({
        ...group,
        label: group.label ? label(group.label) : null,
        items: group.items.map(item),
      })),
      getSuggestions: (pathname: string) =>
        getContextualSuggestions(pathname).map((entry) => ({
          ...entry,
          label: label(entry.label),
        })),
      labelForHref: (href: string, fallback: string) =>
        all.find((entry) => entry.href === href)?.label ?? fallback,
    };
  }, [label]);
}
