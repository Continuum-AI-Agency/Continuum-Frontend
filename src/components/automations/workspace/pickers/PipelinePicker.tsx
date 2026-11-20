'use client';
import { useTranslations } from 'next-intl';

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

const portSummary = (
  pipeline: PipelineItem,
  t: ReturnType<typeof useTranslations<'automations'>>,
): string => {
  const text = pipeline.inputPorts.filter((port) => (port.dataType ?? 'text') === 'text').length;
  return t('m_b9dc704f8b', { inputs: text, outputs: pipeline.outputPorts.length });
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
  const uiText = useTranslations('automations');
  const id = useId();
  const { items, isLoading, isError } = useSource(brandId);
  const selected = isUnsetId(value) ? null : (value as string);

  if (isError || !brandId) {
    return (
      <RawIdFallbackField
        label={uiText('published_pipeline_id_4a6dbf9')}
        value={selected}
        disabled={disabled}
        placeholder={uiText('leave_empty_to_use_the_plain_generator_28615c3')}
        reason={brandId ? uiText('m_d25cefed1e') : uiText('m_79d85b27d6')}
        onChange={(raw) => onChange(raw.trim() || null)}
      />
    );
  }

  const options = items.map((pipeline) => ({
    value: pipeline.id,
    label: `${pipeline.name} — ${portSummary(pipeline, uiText)}`,
  }));
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({ value: selected, label: uiText('m_7a37337c9e', { id: selected }) });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{uiText('published_pipeline_8c71462')}</Label>
      <Select
        value={selected ?? NO_PIPELINE_VALUE}
        disabled={disabled || isLoading}
        onValueChange={(next) => onChange(next === NO_PIPELINE_VALUE ? null : next)}
      >
        <SelectTrigger id={id} aria-label={uiText('published_pipeline_8c71462')}>
          {/* Base UI's Value paints the raw stored value without this map, so the
              closed trigger would read "__no_pipeline__". */}
          <SelectValue
            placeholder={
              isLoading ? uiText('loading_pipelines_7185281') : uiText('no_pipeline_2eb969c')
            }
            items={{
              [NO_PIPELINE_VALUE]: uiText('no_pipeline_plain_generator_a48398c'),
              ...Object.fromEntries(options.map((option) => [option.value, option.label])),
            }}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PIPELINE_VALUE}>
            {uiText('no_pipeline_plain_generator_a48398c')}
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {items.length === 0 && !isLoading ? (
        <p className="text-xs leading-4 text-muted-foreground">
          {uiText('this_brand_has_no_published_pipelines_publish_74c9208')}
        </p>
      ) : null}
    </div>
  );
}
