'use client';

import type { CustomField } from '@continuum/contracts';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  BUILT_IN_CARD_FIELDS,
  CARD_ASPECTS,
  CARD_SIZES,
  type CardViewOptions,
  type LibraryFieldGroup,
  toggleCardField,
  visibleCardFields,
} from './cardOptions';
import { BUILT_IN_LIST_COLUMNS } from './listSort';

const GROUP_LABEL: Record<LibraryFieldGroup | 'custom', string> = {
  file: 'File',
  document: 'Document',
  video: 'Video',
  audio: 'Audio',
  workflow: 'Workflow',
  custom: 'Custom fields',
};

// The List always shows these; offering them there would only toggle them on cards.
const LIST_COLUMN_KEYS: ReadonlySet<string> = new Set([
  ...BUILT_IN_LIST_COLUMNS.map((column) => column.key),
  'title',
]);

function Segment<T extends string>({
  label,
  options,
  value,
  testIdPrefix,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  testIdPrefix: string;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="flex gap-1 rounded-lg border border-border p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            data-testid={`${testIdPrefix}-${option.value}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 rounded-md px-2 py-1 text-xs font-medium',
              value === option.value
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function CardOptionsMenu({
  card,
  customFields,
  onChange,
  showSizeAndAspect = true,
}: {
  card: CardViewOptions | undefined;
  customFields: CustomField[];
  onChange: (patch: Partial<CardViewOptions>) => void;
  /** List view has no cards to size — it only picks the columns it does not always show. */
  showSizeAndAspect?: boolean;
}) {
  const fields = visibleCardFields(card);
  const builtIns = showSizeAndAspect
    ? BUILT_IN_CARD_FIELDS
    : BUILT_IN_CARD_FIELDS.filter((field) => !LIST_COLUMN_KEYS.has(field.key));
  const groups = (Object.keys(GROUP_LABEL) as (LibraryFieldGroup | 'custom')[])
    .map((group) => ({
      group,
      options:
        group === 'custom'
          ? customFields.map((field) => ({ key: field.id, label: field.name }))
          : builtIns.filter((field) => field.group === group),
    }))
    .filter((entry) => entry.options.length > 0);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="library-card-options"
            aria-label={showSizeAndAspect ? 'Card options' : 'Columns'}
            className="h-8"
          >
            <SlidersHorizontal className="size-3.5" />
            <span className="hidden sm:inline">{showSizeAndAspect ? 'Cards' : 'Columns'}</span>
          </Button>
        }
      />
      <PopoverContent align="end" className="flex w-72 flex-col gap-4">
        {showSizeAndAspect ? (
          <>
            <Segment
              label="Size"
              options={CARD_SIZES}
              value={card?.size ?? 'md'}
              testIdPrefix="card-size"
              onChange={(size) => onChange({ size })}
            />
            <Segment
              label="Aspect ratio"
              options={CARD_ASPECTS}
              value={card?.aspect ?? 'original'}
              testIdPrefix="card-aspect"
              onChange={(aspect) => onChange({ aspect })}
            />
          </>
        ) : null}
        <fieldset className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
            {showSizeAndAspect ? 'Show on cards' : 'Columns'}
          </legend>
          {groups.map(({ group, options }) => (
            <div key={group} className="flex flex-col gap-1.5">
              <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                {GROUP_LABEL[group]}
              </p>
              {options.map((option) => (
                <div key={option.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={`card-field-option-${option.key}`}
                    data-testid={`card-field-${option.key}`}
                    checked={fields.includes(option.key)}
                    onCheckedChange={() =>
                      onChange({ fields: toggleCardField(fields, option.key) })
                    }
                  />
                  <label htmlFor={`card-field-option-${option.key}`} className="truncate">
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
