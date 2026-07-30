'use client';

// Shared plumbing for the automation action pickers.
//
// Every picker resolves an id the backend adapter VALIDATES at preflight, so the
// picker exists to make a typo impossible. Two rules follow from that and are
// enforced here rather than restated per picker:
//
//  1. A picker must never make an existing config uneditable. When its data
//     source errors — or no brand is in scope — it degrades to a plain text
//     field showing the stored raw id, so an outage costs the user convenience,
//     never their configuration.
//  2. A placeholder id that was never a real id (the node catalog's
//     `select-connected-account`) renders as UNSET, not as text the user has to
//     notice and overwrite.

import { isAutomationUnsetConfigSentinel } from '@continuum/contracts';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** What a picker's injected data source returns. Shaped as a hook so the real
 *  source can be React Query and a test can pass a pure stub. */
export type PickerSourceState<TItem> = {
  items: TItem[];
  isLoading: boolean;
  isError: boolean;
};

export type PickerSource<TItem> = (brandId: string | undefined) => PickerSourceState<TItem>;

export function isUnsetId(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return trimmed.length === 0 || isAutomationUnsetConfigSentinel(trimmed);
}

/** The stored id as something safe to show in a text input: a placeholder reads
 *  as empty so the field looks unset instead of pre-filled with a fake value. */
export function rawIdFieldValue(value: string | null | undefined): string {
  return isUnsetId(value) ? '' : (value ?? '');
}

export function RawIdFallbackField({
  label,
  value,
  disabled,
  reason,
  placeholder,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  disabled: boolean;
  reason: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={rawIdFieldValue(value)}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-[11px] leading-4 text-muted-foreground">{reason}</p>
    </div>
  );
}
