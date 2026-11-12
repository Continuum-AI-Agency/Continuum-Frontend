'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

// The picker's browsing controls.
//
// The old picker rendered its search box only when there were more than 6 ad sets
// (`{snapshots.length > 6 ? <Input/> : null}`) — a control that appears at a threshold is a
// control the user never learns exists. It is always here now.
//
// Search is one way in; the Command palette is the other. On an account with 300 ad sets, an
// operator who knows the name should type three characters and hit Enter, not scroll. That is
// the whole answer to "cleaner browsing", and the pattern is already in this feature —
// AdAccountSelector is a Popover + Command combobox two directories away.
//
// Filter chips narrow the fleet, and the counts line ALWAYS reports the real totals, so
// nothing is ever hidden without a signpost.

import { ListFilterIcon, SearchIcon, ZapIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { CampaignSection, PickerChip } from './campaignGroups';

export function PickerToolbar({
  sections,
  counts,
  query,
  chips,
  selectedCount,
  disabled,
  onQueryChange,
  onChipsChange,
  onJumpTo,
  onSelectTop,
}: {
  sections: CampaignSection[];
  counts: {
    total: number;
    eligible: number;
    held: number;
    mismatch: number;
    inactive: number;
    terminal: number;
  };
  query: string;
  chips: PickerChip[];
  selectedCount: number;
  disabled?: boolean;
  onQueryChange: (value: string) => void;
  onChipsChange: (chips: PickerChip[]) => void;
  /** Toggle the ad set AND scroll it into view. */
  onJumpTo: (adsetId: string) => void;
  onSelectTop: (count: number) => void;
}) {
  const uiText = useTranslations('scale');
  const CHIPS: { value: PickerChip; label: string; hint: string }[] = useMemo(
    () => [
      {
        value: 'eligible',
        label: uiText('eligible_1889cf7'),
        hint: uiText('ad_sets_whose_budget_the_optimizer_can_move_b7ee6f7'),
      },
      {
        value: 'spending',
        label: uiText('spending_c2c7ae2'),
        hint: uiText('spent_something_in_the_last_14_days_276c34f'),
      },
      {
        value: 'held',
        label: uiText('held_85cd61f'),
        hint: uiText('budget_lives_at_the_campaign_level_or_ingest__08a8eb9'),
      },
      {
        value: 'mismatch',
        label: uiText('wrong_kpi_a089c11'),
        hint: uiText('buys_a_different_event_than_this_objective_4a509de'),
      },
      {
        value: 'inactive',
        label: uiText('inactive_ac7c949'),
        hint: uiText('recoverable_meta_ad_sets_held_until_active_4a4a03d'),
      },
      {
        value: 'terminal',
        label: uiText('archived_deleted_aa7b77a'),
        hint: uiText('terminal_or_unavailable_meta_ad_sets_41206a2'),
      },
    ],
    [uiText],
  );

  const [jumpOpen, setJumpOpen] = useState(false);
  const hasMismatch = counts.mismatch > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <SearchIcon
            className="-translate-y-1/2 absolute top-1/2 left-2 size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            disabled={disabled}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={uiText('search_ad_sets_or_campaigns_289c8d1')}
            aria-label={uiText('search_ad_sets_or_campaigns_a0f6e39')}
            className="h-8 pl-7 text-xs"
          />
        </div>

        <Popover open={jumpOpen} onOpenChange={setJumpOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || counts.total === 0}
                className="h-8 gap-1.5 px-2 text-xs"
              >
                <ListFilterIcon className="size-3.5" aria-hidden="true" />
                {uiText('jump_to_bf48883')}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-[22rem] p-0">
            <Command>
              <CommandInput
                placeholder={uiText('type_an_ad_set_name_e119891')}
                className="text-xs"
              />
              <CommandList>
                <CommandEmpty>{uiText('no_ad_set_matches_0f0ab24')}</CommandEmpty>
                {sections.map((section) => (
                  <CommandGroup key={section.campaignId} heading={section.campaignName}>
                    {section.adsets.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.name} ${item.id}`}
                        keywords={[item.id, section.campaignName]}
                        disabled={!item.canAdd}
                        onSelect={() => {
                          onJumpTo(item.id);
                          setJumpOpen(false);
                        }}
                        className="text-xs"
                      >
                        <span className="truncate">{item.name}</span>
                        {!item.eligible ? (
                          <span className="ml-auto shrink-0 text-xs text-warning">
                            {item.providerStatus?.replaceAll('_', ' ').toLowerCase() ??
                              uiText('held_c20dea4')}
                          </span>
                        ) : item.mismatch ? (
                          <span className="ml-auto shrink-0 text-xs text-warning">
                            {uiText('wrong_kpi_6feb703')}
                          </span>
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || counts.eligible === 0}
          onClick={() => onSelectTop(10)}
          className="h-8 gap-1.5 px-2 text-xs"
        >
          <ZapIcon className="size-3.5" aria-hidden="true" />
          {uiText('top_10_by_spend_1dceef5')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          type="multiple"
          size="sm"
          value={chips}
          disabled={disabled}
          onValueChange={(value) => onChipsChange(value as PickerChip[])}
          className="gap-1"
        >
          {CHIPS.map((chip) =>
            (chip.value === 'mismatch' && !hasMismatch) ||
            (chip.value === 'inactive' && counts.inactive === 0) ||
            (chip.value === 'terminal' && counts.terminal === 0) ? null : (
              <ToggleGroupItem
                key={chip.value}
                value={chip.value}
                title={chip.hint}
                aria-label={chip.hint}
                className="h-6 rounded-full border px-2 text-xs data-[state=on]:bg-muted"
              >
                {chip.label}
              </ToggleGroupItem>
            ),
          )}
        </ToggleGroup>

        {/* The real fleet totals, always. A filter that hides rows without saying how many is
            how an operator concludes an account is empty. */}
        <p className="text-xs text-muted-foreground tabular-nums">
          {uiText.rich('sentence_ac412c01fd39', {
            v0: counts.total,
            v1: counts.eligible,
            v2: counts.held,
            v3: () =>
              hasMismatch ? (
                <span className={cn('text-warning')}>
                  {uiText.rich('sentence_12cce7ff48c7', {
                    v0: counts.mismatch,
                  })}
                </span>
              ) : null,
            v4: () =>
              counts.inactive > 0 ? (
                <span>
                  {uiText.rich('sentence_c396b2e79271', {
                    v0: counts.inactive,
                  })}
                </span>
              ) : null,
            v5: () =>
              counts.terminal > 0 ? (
                <span>
                  {uiText.rich('sentence_d3f030444922', {
                    v0: counts.terminal,
                  })}
                </span>
              ) : null,
            v6: () =>
              selectedCount > 0 ? (
                <span className="text-foreground">
                  {uiText.rich('sentence_f7dcea1e32b7', { v0: selectedCount })}
                </span>
              ) : null,
          })}
        </p>
      </div>
    </div>
  );
}
