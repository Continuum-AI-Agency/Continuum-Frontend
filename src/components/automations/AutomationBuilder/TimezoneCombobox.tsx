'use client';

import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { listTimezones } from '@/lib/automations/schedule';
import { cn } from '@/lib/utils';

type TimezoneComboboxProps = {
  value: string;
  onChange: (timezone: string) => void;
};

export function TimezoneCombobox({ value, onChange }: TimezoneComboboxProps) {
  const [open, setOpen] = useState(false);
  const timezones = useMemo(() => listTimezones(), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Timezone"
            className="w-full justify-between font-normal"
          >
            <span className="truncate">{value || 'Pick a timezone'}</span>
            <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search timezones…" />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {timezones.map((timezone) => (
                <CommandItem
                  key={timezone}
                  value={timezone}
                  onSelect={(selected) => {
                    onChange(selected);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn('mr-2 size-4', timezone === value ? 'opacity-100' : 'opacity-0')}
                  />
                  {timezone}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
