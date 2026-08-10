'use client';
import { ChevronDown } from 'lucide-react';

// Which of the brand's accounts this planner publishes to, per platform.
//
// The planner used to have no such control: the workspace took the brand's alphabetically-first
// account on each platform and every draft — generated or published — went there. A brand with
// two Instagram profiles could not reach the second one at all. The selection made here is the
// one generation stamps onto a draft AND the one the publish request carries, so the two can
// never disagree.

import type { PublishPlatform } from '@continuum/contracts';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { saveAccountSelection } from '@/lib/organic/account-selection';
import { ORGANIC_PLATFORMS } from '@/lib/organic/platforms';
import { useCalendarStore } from '@/lib/organic/store';

const PLATFORM_LABEL = new Map(ORGANIC_PLATFORMS.map(({ key, label }) => [key, label]));

export function PlannerAccountSwitcher() {
  const accountContext = useCalendarStore((state) => state.accountContext);
  const selectAccount = useCalendarStore((state) => state.selectAccount);

  // Only platforms where there is an actual choice to make.
  const switchable = (
    Object.entries(accountContext.accountOptions) as Array<
      [PublishPlatform, Array<{ id: string; label: string }>]
    >
  ).filter(([, options]) => options.length > 1);

  if (switchable.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {switchable.map(([platform, options]) => {
        const selectedId = accountContext.accountIds[platform];
        const selected = options.find((option) => option.id === selectedId);

        return (
          <DropdownMenu key={platform}>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  aria-label={`${PLATFORM_LABEL.get(platform) ?? platform} account`}
                >
                  <span className="text-muted-foreground">
                    {PLATFORM_LABEL.get(platform) ?? platform}:
                  </span>
                  <span className="max-w-32 truncate font-medium">
                    {selected?.label ?? 'Select account'}
                  </span>
                  <ChevronDown className="size-3 opacity-60" />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="min-w-48">
              <DropdownMenuLabel className="text-xs">
                Publish {PLATFORM_LABEL.get(platform) ?? platform} posts to
              </DropdownMenuLabel>
              {options.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onSelect={() => {
                    selectAccount(platform, option.id);
                    saveAccountSelection(accountContext.brandId, platform, option.id);
                  }}
                  className="text-xs"
                >
                  <span className="truncate">{option.label}</span>
                  {option.id === selectedId ? (
                    <span className="ml-auto text-muted-foreground">Current</span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}
