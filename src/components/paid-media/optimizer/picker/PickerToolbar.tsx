'use client';

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

const CHIPS: { value: PickerChip; label: string; hint: string }[] = [
  { value: 'eligible', label: 'Eligible', hint: 'Ad sets whose budget the optimizer can move' },
  { value: 'spending', label: 'Spending', hint: 'Spent something in the last 14 days' },
  { value: 'held', label: 'Held', hint: 'Budget lives at the campaign level, or ingest froze it' },
  { value: 'mismatch', label: 'Wrong KPI', hint: 'Buys a different event than this objective' },
];

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
  counts: { total: number; eligible: number; held: number; mismatch: number };
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
            placeholder="Search ad sets or campaigns…"
            aria-label="Search ad sets or campaigns"
            className="h-8 pl-7 text-xs"
          />
        </div>

        <Popover open={jumpOpen} onOpenChange={setJumpOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || counts.total === 0}
              className="h-8 gap-1.5 px-2 text-xs"
            >
              <ListFilterIcon className="size-3.5" aria-hidden="true" />
              Jump to…
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[22rem] p-0">
            <Command>
              <CommandInput placeholder="Type an ad set name…" className="text-xs" />
              <CommandList>
                <CommandEmpty>No ad set matches.</CommandEmpty>
                {sections.map((section) => (
                  <CommandGroup key={section.campaignId} heading={section.campaignName}>
                    {section.adsets.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.name} ${item.id}`}
                        keywords={[item.id, section.campaignName]}
                        disabled={!item.eligible}
                        onSelect={() => {
                          onJumpTo(item.id);
                          setJumpOpen(false);
                        }}
                        className="text-xs"
                      >
                        <span className="truncate">{item.name}</span>
                        {!item.eligible ? (
                          <span className="ml-auto shrink-0 text-2xs text-warning">held</span>
                        ) : item.mismatch ? (
                          <span className="ml-auto shrink-0 text-2xs text-warning">wrong KPI</span>
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
          Top 10 by spend
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
            chip.value === 'mismatch' && !hasMismatch ? null : (
              <ToggleGroupItem
                key={chip.value}
                value={chip.value}
                title={chip.hint}
                aria-label={chip.hint}
                className="h-6 rounded-full border px-2 text-2xs data-[state=on]:bg-muted"
              >
                {chip.label}
              </ToggleGroupItem>
            ),
          )}
        </ToggleGroup>

        {/* The real fleet totals, always. A filter that hides rows without saying how many is
            how an operator concludes an account is empty. */}
        <p className="text-2xs text-muted-foreground tabular-nums">
          {counts.total} ad sets · {counts.eligible} eligible · {counts.held} held
          {hasMismatch ? (
            <span className={cn('text-warning')}> · {counts.mismatch} wrong KPI</span>
          ) : null}
          {selectedCount > 0 ? (
            <span className="text-foreground"> · {selectedCount} selected</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
