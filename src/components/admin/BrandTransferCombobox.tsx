'use client';

import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useState } from 'react';
import { formatBrandDisambiguationLabel } from '@/components/admin/adminUserListUtils';
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selectedBrand ? formatBrandDisambiguationLabel(selectedBrand) : placeholder}
          </span>
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search brands, owners, or ids…" />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {brands.map((brand) => {
                const label = formatBrandDisambiguationLabel(brand);
                return (
                  <CommandItem
                    key={brand.id}
                    value={`${brand.brand_name} ${brand.ownerEmail ?? ''} ${brand.id}`}
                    onSelect={() => {
                      onChange(brand.id);
                      setOpen(false);
                    }}
                  >
                    <CheckIcon
                      className={cn(
                        'mr-2 size-4 shrink-0',
                        brand.id === value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{label}</span>
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
