'use client';

// Which AI Studio workspace a headless generation is attributed to.
//
// This is attribution, not a target: `roomId` is nullable and `null` means the
// output belongs to no workspace. It is NOT a "saved workflow" — a Studio
// workflow is replayed by the canvas in a browser, and there is no headless
// runner for one, so nothing here names one.

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type CanvasRoomOption, useAiStudioRoomSource } from './defaultPickerSources';
import { isUnsetId, type PickerSource, RawIdFallbackField } from './pickerSource';

/** Radix Select forbids an empty option value, so "no workspace" needs a token. */
const NO_ROOM_VALUE = '__no_room__';

export function AiStudioRoomPicker({
  brandId,
  value,
  disabled,
  onChange,
  useSource = useAiStudioRoomSource,
}: {
  brandId?: string;
  value: string | null;
  disabled: boolean;
  onChange: (roomId: string | null) => void;
  useSource?: PickerSource<CanvasRoomOption>;
}) {
  const id = useId();
  const { items, isLoading, isError } = useSource(brandId);
  const selected = isUnsetId(value) ? null : (value as string);

  if (isError || !brandId) {
    return (
      <RawIdFallbackField
        label="AI Studio workspace ID"
        value={selected}
        disabled={disabled}
        placeholder="Leave empty for no workspace"
        reason={
          brandId
            ? 'Workspaces could not be loaded. The stored workspace stays editable here — leave it empty to attribute the output to none.'
            : 'No brand is in scope, so workspaces cannot be listed.'
        }
        onChange={(raw) => onChange(raw.trim() || null)}
      />
    );
  }

  const options = items.map((room) => ({ value: room.id, label: room.name }));
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({ value: selected, label: `Unavailable workspace (${selected})` });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>AI Studio workspace</Label>
      <Select
        value={selected ?? NO_ROOM_VALUE}
        disabled={disabled || isLoading}
        onValueChange={(next) => onChange(next === NO_ROOM_VALUE ? null : next)}
      >
        <SelectTrigger id={id} aria-label="AI Studio workspace">
          <SelectValue placeholder={isLoading ? 'Loading workspaces…' : 'No workspace'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_ROOM_VALUE}>No workspace</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
