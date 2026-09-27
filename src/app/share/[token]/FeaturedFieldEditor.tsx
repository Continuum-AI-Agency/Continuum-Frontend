'use client';

// The one field the owner lets a guest set on each asset (e.g. its status).
// Native controls keep it a plain form post through the editFeaturedField action.

import {
  type CustomFieldValue,
  customFieldChoiceOptions,
  DEFAULT_RATING_MAX,
  type ShareFeaturedField,
} from '@continuum/contracts';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { editFeaturedField, type FeaturedFieldActionState } from './actions';

const INITIAL_STATE: FeaturedFieldActionState = { error: null, saved: false };
const CONTROL =
  'h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground';

function FieldControl({ field, value }: { field: ShareFeaturedField; value: CustomFieldValue | undefined }) {
  const current = value == null ? '' : String(value);
  switch (field.type) {
    case 'single_select':
    case 'status':
      return (
        <select name="value" defaultValue={current} className={CONTROL} aria-label={field.name}>
          <option value="">—</option>
          {customFieldChoiceOptions(field).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case 'rating': {
      const max =
        !Array.isArray(field.options) && field.options.max ? field.options.max : DEFAULT_RATING_MAX;
      return (
        <select name="value" defaultValue={current} className={CONTROL} aria-label={field.name}>
          <option value="">—</option>
          {Array.from({ length: max }, (_, index) => (
            <option key={index + 1} value={index + 1}>
              {'★'.repeat(index + 1)}
            </option>
          ))}
        </select>
      );
    }
    case 'checkbox':
      return (
        <select name="value" defaultValue={value === true ? 'true' : 'false'} className={CONTROL} aria-label={field.name}>
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      );
    case 'number':
      return <Input name="value" type="number" step="any" defaultValue={current} aria-label={field.name} />;
    case 'date':
      return <Input name="value" type="date" defaultValue={current} aria-label={field.name} />;
    case 'url':
      return <Input name="value" type="url" defaultValue={current} aria-label={field.name} />;
    default:
      return <Input name="value" defaultValue={current} maxLength={2000} aria-label={field.name} />;
  }
}

export function FeaturedFieldEditor({
  token,
  assetId,
  versionId,
  field,
  value,
  hasIdentity,
}: {
  token: string;
  assetId: string;
  versionId: string;
  field: ShareFeaturedField;
  value: CustomFieldValue | undefined;
  hasIdentity: boolean;
}) {
  const [state, action, pending] = useActionState(
    editFeaturedField.bind(null, token, assetId, versionId),
    INITIAL_STATE,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" data-featured-field={field.id}>
      {!hasIdentity ? (
        <div className="grid w-full gap-2 sm:grid-cols-2">
          <Input name="displayName" placeholder="Your name" autoComplete="name" required />
          <Input name="email" type="email" placeholder="Email" autoComplete="email" required />
        </div>
      ) : null}
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{field.name}</span>
      <FieldControl field={field} value={value} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
      <span className="text-xs" role="status">
        {state.error ? <span className="text-destructive">{state.error}</span> : null}
        {state.saved ? <span className="text-muted-foreground">Saved</span> : null}
      </span>
    </form>
  );
}
