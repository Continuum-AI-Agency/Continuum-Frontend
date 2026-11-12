'use client';
import { useTranslations } from 'next-intl';

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
  const uiText = useTranslations('automations');
  const id = useId();
  const { items, isLoading, isError } = useSource(brandId);
  const selected = isUnsetId(value) ? null : (value as string);

  if (isError || !brandId) {
    return (
      <RawIdFallbackField
        label={uiText('library_collection_id_b28bd8c')}
        value={selected}
        disabled={disabled}
        placeholder={uiText('leave_empty_to_save_to_the_library_root_998c965')}
        reason={brandId ? uiText('m_a959b8a301') : uiText('m_a120653219')}
        onChange={(raw) => onChange(raw.trim().length > 0 ? raw.trim() : null)}
      />
    );
  }

  // A collection deleted after the step was configured must still be visible,
  // otherwise selecting anything else would silently discard the stored target.
  const options = items.map((collection) => ({
    value: collection.id,
    label: collection.name,
  }));
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({
      value: selected,
      label: uiText('m_b6b77d6615', { id: selected }),
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{uiText('library_collection_634a357')}</Label>
      <Select
        value={selected ?? LIBRARY_ROOT_VALUE}
        disabled={disabled || isLoading}
        onValueChange={(next) => onChange(next === LIBRARY_ROOT_VALUE ? null : next)}
      >
        <SelectTrigger id={id} aria-label={uiText('library_collection_634a357')}>
          {/* Base UI's Value paints the raw stored value without this map, so the
              closed trigger would read "__library_root__". */}
          <SelectValue
            placeholder={
              isLoading ? uiText('loading_collections_bfabc4a') : uiText('library_root_70de847')
            }
            items={{
              [LIBRARY_ROOT_VALUE]: uiText('library_root_70de847'),
              ...Object.fromEntries(options.map((option) => [option.value, option.label])),
            }}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LIBRARY_ROOT_VALUE}>{uiText('library_root_70de847')}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs leading-4 text-muted-foreground">
        {uiText('collections_are_flat_library_root_files_the_o_70dafd5')}
      </p>
    </div>
  );
}
