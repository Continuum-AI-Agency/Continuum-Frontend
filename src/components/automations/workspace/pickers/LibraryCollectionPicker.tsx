'use client';

// Where a "Save to Library" step files its output. The Library's domain object
// is a COLLECTION and collections are FLAT, so this is a single list plus an
// explicit "Library root" entry for the null target — never a tree.

import type { MediaCollection } from '@continuum/contracts';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLibraryCollectionSource } from './defaultPickerSources';
import { isUnsetId, type PickerSource, RawIdFallbackField } from './pickerSource';

/** Radix Select forbids an empty option value, so the root target needs a token. */
const LIBRARY_ROOT_VALUE = '__library_root__';

export function LibraryCollectionPicker({
  brandId,
  value,
  disabled,
  onChange,
  useSource = useLibraryCollectionSource,
}: {
  brandId?: string;
  value: string | null;
  disabled: boolean;
  onChange: (collectionId: string | null) => void;
  useSource?: PickerSource<MediaCollection>;
}) {
  const id = useId();
  const { items, isLoading, isError } = useSource(brandId);
  const selected = isUnsetId(value) ? null : (value as string);

  if (isError || !brandId) {
    return (
      <RawIdFallbackField
        label="Library collection ID"
        value={selected}
        disabled={disabled}
        placeholder="Leave empty to save to the Library root"
        reason={
          brandId
            ? 'Collections could not be loaded. The stored collection stays editable here — leave it empty to save to the Library root.'
            : 'No brand is in scope, so collections cannot be listed. Leave empty to save to the Library root.'
        }
        onChange={(raw) => onChange(raw.trim().length > 0 ? raw.trim() : null)}
      />
    );
  }

  // A collection deleted after the step was configured must still be visible,
  // otherwise selecting anything else would silently discard the stored target.
  const options = items.map((collection) => ({ value: collection.id, label: collection.name }));
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({ value: selected, label: `Unavailable collection (${selected})` });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Library collection</Label>
      <Select
        value={selected ?? LIBRARY_ROOT_VALUE}
        disabled={disabled || isLoading}
        onValueChange={(next) => onChange(next === LIBRARY_ROOT_VALUE ? null : next)}
      >
        <SelectTrigger id={id} aria-label="Library collection">
          {/* Base UI's Value paints the raw stored value without this map, so the
              closed trigger would read "__library_root__". */}
          <SelectValue
            placeholder={isLoading ? 'Loading collections…' : 'Library root'}
            items={{
              [LIBRARY_ROOT_VALUE]: 'Library root',
              ...Object.fromEntries(options.map((option) => [option.value, option.label])),
            }}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LIBRARY_ROOT_VALUE}>Library root</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Collections are flat. Library root files the output with no collection.
      </p>
    </div>
  );
}
