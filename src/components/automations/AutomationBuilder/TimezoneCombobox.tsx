'use client';

import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
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
import { timezoneLabel } from '@/lib/time/timezoneLabel';
import { cn } from '@/lib/utils';

type TimezoneComboboxProps = {
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
};

export function TimezoneCombobox({ value, onChange, disabled = false }: TimezoneComboboxProps) {
  const uiText = useTranslations('automations');
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const timezones = useMemo(
    () => listTimezones().map((id) => ({ id, label: timezoneLabel(id, locale) })),
    [locale],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={uiText('timezone_4ceca1d')}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {value ? timezoneLabel(value, locale) : uiText('pick_a_timezone_4c5e74c')}
            </span>
            <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command>
          <CommandInput placeholder={uiText('search_timezones_034969c')} />
          <CommandList>
            <CommandEmpty>{uiText('no_timezone_found_ec04105')}</CommandEmpty>
            <CommandGroup>
              {timezones.map((timezone) => (
                <CommandItem
                  key={timezone.id}
                  value={timezone.id}
                  keywords={[timezone.label]}
                  onSelect={(selected) => {
                    onChange(selected);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      'mr-2 size-4',
                      timezone.id === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{timezone.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{timezone.id}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
