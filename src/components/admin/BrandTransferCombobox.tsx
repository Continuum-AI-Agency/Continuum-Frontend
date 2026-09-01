'use client';

import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useState } from 'react';
import { formatBrandDisambiguationLines } from '@/components/admin/adminUserListUtils';
import type { AdminBrandOption } from '@/components/admin/adminUserTypes';
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
import { cn } from '@/lib/utils';

type BrandTransferComboboxProps = {
  brands: AdminBrandOption[];
  value: string;
  onChange: (brandId: string) => void;
  placeholder: string;
  emptyLabel?: string;
  id?: string;
};

/**
 * Admin brand picker.
 *
 * Every line here used to be a single `truncate` span, which clipped exactly the two
 * things an admin picks a brand BY: the tail of the brand name and the owner's email
 * (`eviechamps123's Brand — eviechamps123@…`). Both the trigger and the rows now wrap
 * onto as many lines as they need — an email is only useful in full — and the rows put
 * the owner on its own line so a long address never competes with the brand name for
 * the same 360px.
 *
 * The matcher is deliberately absent: `<Command>` carries no `filter` and no
 * `shouldFilter={false}`, so cmdk's own command-score runs over each item's value
 * (`brand ownerEmail id`). It is fuzzy and order-preserving, which is what makes both
 * "vivo47" and "VIVO 47 center" find the same brand — do not replace it with a
 * hand-rolled normaliser.
 */
export function BrandTransferCombobox({
  brands,
  value,
  onChange,
  placeholder,
  emptyLabel = 'No brands found.',
  id,
}: BrandTransferComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedBrand = brands.find((brand) => brand.id === value) ?? null;
  const selectedLines = selectedBrand ? formatBrandDisambiguationLines(selectedBrand) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            // h-auto + whitespace-normal: the base button is a fixed-height nowrap row,
            // which is what clipped the trigger label mid-word.
            className="h-auto min-h-8 w-full justify-between py-1.5 text-left font-normal whitespace-normal"
          >
            <span data-testid="brand-picker-trigger-label" className="min-w-0 flex-1 break-words">
              {selectedLines ? (
                <>
                  <span className="block">{selectedLines.name}</span>
                  <span className="block text-xs break-all text-muted-foreground">
                    {selectedLines.detail}
                  </span>
                </>
              ) : (
                placeholder
              )}
            </span>
            <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search brands, owners, or ids…" />
          {/* scrollbar-thin: the list has always scrolled, but the platform's overlay
              scrollbar gave no hint there were more matches below the fold. */}
          <CommandList data-testid="brand-picker-list" className="scrollbar-thin">
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {brands.map((brand) => {
                const lines = formatBrandDisambiguationLines(brand);
                return (
                  <CommandItem
                    key={brand.id}
                    data-testid="brand-picker-option"
                    className="items-start"
                    value={`${brand.brand_name} ${brand.ownerEmail ?? ''} ${brand.id}`}
                    onSelect={() => {
                      onChange(brand.id);
                      setOpen(false);
                    }}
                  >
                    <CheckIcon
                      className={cn(
                        'mt-0.5 mr-2 size-4 shrink-0',
                        brand.id === value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words">{lines.name}</span>
                      <span className="block text-xs break-all text-muted-foreground">
                        {lines.detail}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
