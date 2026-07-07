'use client';

import { PlusIcon, TrashIcon } from '@radix-ui/react-icons';
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
  const { fields, append, remove } = useFieldArray({ control, name });
  const count = fields.length;

  return (
    <div className="rounded-lg border border-[var(--glass-border)] p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{title} tags</span>
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
            <PlusIcon /> Add tag
          </Button>
        </div>
        {helper ? <span className="text-xs text-muted-foreground">{helper}</span> : null}
        {count === 0 ? (
          <span className="text-sm text-muted-foreground">
            No tags yet. Add 3-5 curated tags for this section.
          </span>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-[var(--glass-border)] p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Tag {index + 1}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => remove(index)}
                    >
                      <TrashIcon /> Remove
                    </Button>
                  </div>
                  <Controller
                    control={control}
                    name={`${name}.${index}.label` as const}
                    render={({ field: input }) => (
                      <Input {...input} placeholder="Tag label" value={input.value ?? ''} />
                    )}
                  />
                  <Controller
                    control={control}
                    name={`${name}.${index}.description` as const}
                    render={({ field: input }) => (
                      <Textarea
                        {...input}
                        placeholder="Longer description for semantic retrieval"
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
