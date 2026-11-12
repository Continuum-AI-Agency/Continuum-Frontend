'use client';

import { Building2, Loader2, Moon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import React from 'react';
import { z } from 'zod';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { useTheme } from '@/components/theme-provider';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  type AutomationDeploymentEnvironment,
  canAccessAutomations,
} from '@/lib/automations/access';
import { isAdminUser } from '@/lib/brands/brand-switcher-utils';
import { getLocalStorageJSON, setLocalStorageJSON } from '@/lib/storage';
import { brandStorageKeyRecentPages, migrateLegacyRecentPages } from '@/lib/storage-keys';
import { useCommandPalette } from './CommandPaletteProvider';
import { runAfterForgeExit } from './guardedNavigation';
import { useNavigation } from './useNavigation';

const recentPagesSchema = z.array(
  z.object({
    href: z.string().min(1),
    label: z.string().min(1),
  }),
);
type RecentPage = z.infer<typeof recentPagesSchema>[number];

const MAX_RECENT = 5;

function readRecent(brandId: string): RecentPage[] {
  if (!brandId) return [];
  migrateLegacyRecentPages(brandId);
  return getLocalStorageJSON(brandStorageKeyRecentPages(brandId), [], recentPagesSchema);
}

function saveRecent(brandId: string, pages: RecentPage[]) {
  if (!brandId) return;
  setLocalStorageJSON(brandStorageKeyRecentPages(brandId), pages);
}

export function CommandPalette({
  automationEnvironment = 'development',
}: {
  automationEnvironment?: AutomationDeploymentEnvironment;
}) {
  const uiText = useTranslations('navigation');
  const navigation = useNavigation();
  const { items: APP_NAVIGATION, footer: APP_NAVIGATION_FOOTER } = navigation;
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const pathname = usePathname();
  const { appearance, toggle } = useTheme();
  const { user, brandSummaries, activeBrandId, selectBrand, isSwitching, switchingToBrandId } =
    useActiveBrandContext();
  const isAdmin = isAdminUser(user);
  const hasAutomationAccess = canAccessAutomations({
    isAdmin,
    environment: automationEnvironment,
  });

  // Page-specific suggestions, resolved from the current route (static map, no
  // backend). Teaches the user what is worth doing from where they already are.
  const suggestions = navigation.getSuggestions(pathname ?? '');

  const [recentPages, setRecentPages] = React.useState<RecentPage[]>([]);

  // Load recent pages when palette opens (or brand changes)
  React.useEffect(() => {
    if (open) setRecentPages(readRecent(activeBrandId));
  }, [open, activeBrandId]);

  function run(fn: () => void, recent?: RecentPage) {
    setOpen(false);
    if (recent) {
      const updated = [recent, ...recentPages.filter((p) => p.href !== recent.href)].slice(
        0,
        MAX_RECENT,
      );
      setRecentPages(updated);
      saveRecent(activeBrandId, updated);
    }
    fn();
  }

  function leave(fn: () => void, recent?: RecentPage) {
    // Release the palette focus trap before the draft's save/retry decision opens.
    setOpen(false);
    runAfterForgeExit(() => run(fn, recent));
  }

  const footerItems = APP_NAVIGATION_FOOTER.filter((item) => !item.adminOnly || isAdmin);
  const visibleRecentPages = recentPages.filter(
    (page) => hasAutomationAccess || !page.href.startsWith('/automations'),
  );
  const visibleSuggestions = suggestions.filter(
    (suggestion) => hasAutomationAccess || !suggestion.href.startsWith('/automations'),
  );
  const navigationItems = APP_NAVIGATION.filter(
    (item) => hasAutomationAccess || item.href !== '/automations',
  );
  const switchableBrands = brandSummaries.filter((b) => b.id !== activeBrandId && !b.isPending);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} showCloseButton={false}>
      <CommandInput placeholder={uiText('go_to_search_or_run_45d3111')} />
      <CommandList>
        <motion.div
          key={open ? 'open' : 'closed'}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <CommandEmpty>{uiText('no_results_found_7ecdbfe')}</CommandEmpty>

          {visibleRecentPages.length > 0 && (
            <>
              <CommandGroup heading={uiText('recent_690dbe9')}>
                {visibleRecentPages.map((page) => (
                  <CommandItem
                    key={page.href}
                    value={`recent ${navigation.labelForHref(page.href, page.label)} ${page.href}`}
                    onSelect={() => leave(() => router.push(page.href))}
                  >
                    <span className="text-muted-foreground font-mono text-xs">↩</span>
                    {navigation.labelForHref(page.href, page.label)}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {visibleSuggestions.length > 0 && (
            <>
              <CommandGroup heading={uiText('suggested_for_this_page_c75e001')}>
                {visibleSuggestions.map((suggestion) => {
                  const Icon = suggestion.icon;
                  return (
                    <CommandItem
                      key={suggestion.href}
                      value={`suggested ${suggestion.label}`}
                      onSelect={() =>
                        leave(() => router.push(suggestion.href), {
                          href: suggestion.href,
                          label: suggestion.label,
                        })
                      }
                    >
                      <Icon />
                      {suggestion.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          <CommandGroup heading={uiText('navigation_3db65f8')}>
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() =>
                    leave(() => router.push(item.href), {
                      href: item.href,
                      label: item.label,
                    })
                  }
                >
                  <Icon />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>

          {switchableBrands.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={uiText('switch_brand_acf96db')}>
                {switchableBrands.map((brand) => {
                  const isPending = isSwitching && switchingToBrandId === brand.id;
                  return (
                    <CommandItem
                      key={brand.id}
                      value={`switch brand ${brand.name}`}
                      onSelect={() => leave(() => void selectBrand(brand.id))}
                      disabled={isSwitching}
                    >
                      {brand.logoUrl ? (
                        <img
                          src={brand.logoUrl}
                          alt=""
                          className="h-4 w-4 rounded-sm object-cover"
                        />
                      ) : (
                        <Building2 />
                      )}
                      {brand.name}
                      {isPending && (
                        <CommandShortcut>
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </CommandShortcut>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />

          <CommandGroup heading={uiText('settings_74a883a')}>
            {footerItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() =>
                    leave(() => router.push(item.href), {
                      href: item.href,
                      label: item.label,
                    })
                  }
                >
                  <Icon />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={uiText('actions_ff8059d')}>
            <CommandItem
              value={`toggle theme ${appearance === 'dark' ? 'light' : 'dark'} mode appearance`}
              onSelect={() => run(toggle)}
            >
              {appearance === 'dark' ? <Sun /> : <Moon />}
              {appearance === 'dark'
                ? uiText('switch_to_light_mode_c22ea81')
                : uiText('switch_to_dark_mode_82de2f8')}
              <CommandShortcut>{uiText('theme_efb52e7')}</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </motion.div>
      </CommandList>
    </CommandDialog>
  );
}
