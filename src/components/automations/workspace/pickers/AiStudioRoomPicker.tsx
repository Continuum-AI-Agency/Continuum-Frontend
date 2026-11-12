'use client';
import { useTranslations } from 'next-intl';

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
  const uiText = useTranslations('automations');
  const id = useId();
  const { items, isLoading, isError } = useSource(brandId);
  const selected = isUnsetId(value) ? null : (value as string);

  if (isError || !brandId) {
    return (
      <RawIdFallbackField
        label={uiText('ai_studio_workspace_id_e76b1fc')}
        value={selected}
        disabled={disabled}
        placeholder={uiText('leave_empty_for_no_workspace_ecad53c')}
        reason={brandId ? uiText('m_5d26684143') : uiText('m_b84dbd9eea')}
        onChange={(raw) => onChange(raw.trim() || null)}
      />
    );
  }

  const options = items.map((room) => ({ value: room.id, label: room.name }));
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({ value: selected, label: uiText('m_a1fe8d331f', { id: selected }) });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{uiText('ai_studio_workspace_9138e3d')}</Label>
      <Select
        value={selected ?? NO_ROOM_VALUE}
        disabled={disabled || isLoading}
        onValueChange={(next) => onChange(next === NO_ROOM_VALUE ? null : next)}
      >
        <SelectTrigger id={id} aria-label={uiText('ai_studio_workspace_9138e3d')}>
          {/* Base UI's Value paints the raw stored value without this map, so the
              closed trigger would read "__no_room__". */}
          <SelectValue
            placeholder={
              isLoading ? uiText('loading_workspaces_a0a02a1') : uiText('no_workspace_fce263d')
            }
            items={{
              [NO_ROOM_VALUE]: uiText('no_workspace_fce263d'),
              ...Object.fromEntries(options.map((option) => [option.value, option.label])),
            }}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_ROOM_VALUE}>{uiText('no_workspace_fce263d')}</SelectItem>
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
