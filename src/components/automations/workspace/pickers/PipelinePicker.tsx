'use client';

// Which PUBLISHED pipeline a headless generation runs, or none.
//
// `null` means the old shape: one prompt straight to the image or video
// generator. Choosing a pipeline replaces that with a canvas somebody published
// — the pipeline declares its own generators and media, so the Generator and
// Outputs fields stop applying and the editor hides them.
//
// Only published rows are offered. A saved Technique has ports too, and offering
// one here would let a schedule run a canvas nobody promised a machine could run.

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PipelineItem } from '@/lib/ai-studio/pipelines';
import { usePipelineSource } from './defaultPickerSources';
import { isUnsetId, type PickerSource, RawIdFallbackField } from './pickerSource';

/** Radix Select forbids an empty option value, so "no pipeline" needs a token. */
const NO_PIPELINE_VALUE = '__no_pipeline__';

const portSummary = (pipeline: PipelineItem): string => {
  const text = pipeline.inputPorts.filter((port) => (port.dataType ?? 'text') === 'text').length;
  return `${text} text input${text === 1 ? '' : 's'} · ${pipeline.outputPorts.length} output${
    pipeline.outputPorts.length === 1 ? '' : 's'
  }`;
};

export function PipelinePicker({
  brandId,
  value,
  disabled,
  onChange,
  useSource = usePipelineSource,
}: {
  brandId?: string;
  value: string | null;
  disabled: boolean;
  onChange: (pipelineId: string | null) => void;
  useSource?: PickerSource<PipelineItem>;
}) {
  const id = useId();
  const { items, isLoading, isError } = useSource(brandId);
  const selected = isUnsetId(value) ? null : (value as string);

  if (isError || !brandId) {
    return (
      <RawIdFallbackField
        label="Published pipeline ID"
        value={selected}
        disabled={disabled}
        placeholder="Leave empty to use the plain generator"
        reason={
          brandId
            ? 'Pipelines could not be loaded. The stored pipeline stays editable here — leave it empty to run the plain generator instead.'
            : 'No brand is in scope, so pipelines cannot be listed.'
        }
        onChange={(raw) => onChange(raw.trim() || null)}
      />
    );
  }

  const options = items.map((pipeline) => ({
    value: pipeline.id,
    label: `${pipeline.name} — ${portSummary(pipeline)}`,
  }));
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({ value: selected, label: `Unavailable pipeline (${selected})` });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Published pipeline</Label>
      <Select
        value={selected ?? NO_PIPELINE_VALUE}
        disabled={disabled || isLoading}
        onValueChange={(next) => onChange(next === NO_PIPELINE_VALUE ? null : next)}
      >
        <SelectTrigger id={id} aria-label="Published pipeline">
          {/* Base UI's Value paints the raw stored value without this map, so the
              closed trigger would read "__no_pipeline__". */}
          <SelectValue
            placeholder={isLoading ? 'Loading pipelines…' : 'No pipeline'}
            items={{
              [NO_PIPELINE_VALUE]: 'No pipeline — plain generator',
              ...Object.fromEntries(options.map((option) => [option.value, option.label])),
            }}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PIPELINE_VALUE}>No pipeline — plain generator</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {items.length === 0 && !isLoading ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          This brand has no published pipelines. Publish a canvas from AI Studio to run it on a
          schedule.
        </p>
      ) : null}
    </div>
  );
}
