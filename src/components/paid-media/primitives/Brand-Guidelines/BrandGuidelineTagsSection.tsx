'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { type Control, Controller, type FieldArrayPath, useFieldArray } from 'react-hook-form';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { BrandGuidelineDraft } from '@/lib/schemas/brandGuidelines';

const TAG_LIMIT = 5;

type BrandGuidelineTagsSectionProps = {
  title: string;
  helper?: string;
  name: FieldArrayPath<BrandGuidelineDraft>;
  control: Control<BrandGuidelineDraft>;
};

export function BrandGuidelineTagsSection({
  title,
  helper,
  name,
  control,
}: BrandGuidelineTagsSectionProps) {
  const uiText = useTranslations('scale');
  const { fields, append, remove } = useFieldArray({ control, name });
  const count = fields.length;

  return (
    <div className="rounded-lg border border-[var(--glass-border)] p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {uiText.rich('sentence_028335fd833e', { v0: title })}
            </span>
            <Pill variant="muted">
              {count}/{TAG_LIMIT}
            </Pill>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => append({ label: '', description: '' })}
            disabled={count >= TAG_LIMIT}
          >
            <Plus />
            {uiText('add_tag_3e10b08')}
          </Button>
        </div>
        {helper ? <span className="text-xs text-muted-foreground">{helper}</span> : null}
        {count === 0 ? (
          <span className="text-sm text-muted-foreground">
            {uiText('no_tags_yet_add_3_5_curated_tags_for_this_sec_69d480a')}
          </span>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {uiText.rich('sentence_da6c70c3270e', { v0: index + 1 })}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => remove(index)}
                    >
                      <Trash2 />
                      {uiText('remove_c3812fc')}
                    </Button>
                  </div>
                  <Controller
                    control={control}
                    name={`${name}.${index}.label` as const}
                    render={({ field: input }) => (
                      <Input
                        {...input}
                        placeholder={uiText('tag_label_d54e572')}
                        value={input.value ?? ''}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name={`${name}.${index}.description` as const}
                    render={({ field: input }) => (
                      <Textarea
                        {...input}
                        placeholder={uiText('longer_description_for_semantic_retrieval_670c593')}
                        value={input.value ?? ''}
                        rows={3}
                      />
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
