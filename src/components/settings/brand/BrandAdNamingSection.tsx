'use client';

import type { AdNamingSchemaConfig } from '@continuum/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { updateBrandAdNamingSchemaAction } from '@/app/(post-auth)/settings/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';

type AdNamingPlatform = 'meta' | 'google' | 'all';

type BrandAdNamingSectionProps = {
  brandId: string;
  platform?: AdNamingPlatform;
  initial: AdNamingSchemaConfig | null;
  canEdit: boolean;
};

// Field labels are edited in place, so each needs a stable key independent of
// its (mutable) value — hence the { id, value } wrapper rather than a raw
// string list keyed by index.
type FieldItem = { id: string; value: string };

function makeFieldItem(value: string): FieldItem {
  return { id: Math.random().toString(36).slice(2), value };
}

export function BrandAdNamingSection({
  brandId,
  platform = 'meta',
  initial,
  canEdit,
}: BrandAdNamingSectionProps) {
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [delimiter, setDelimiter] = useState(initial?.delimiter ?? '|');
  const [items, setItems] = useState<FieldItem[]>(() => (initial?.fields ?? []).map(makeFieldItem));

  const cleanedFields = items.map((item) => item.value.trim()).filter((value) => value.length > 0);
  const preview = cleanedFields.join(` ${delimiter} `);

  const updateItem = (id: string, value: string) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, value } : item)));
  const addItem = () => setItems((prev) => [...prev, makeFieldItem('')]);
  const removeItem = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  const handleSave = () => {
    const trimmedDelimiter = delimiter.trim();
    if (!trimmedDelimiter) {
      show({
        title: 'Delimiter required',
        description: 'Enter a delimiter such as | or _.',
        variant: 'error',
      });
      return;
    }
    if (cleanedFields.length === 0) {
      show({
        title: 'Fields required',
        description: 'Add at least one naming field.',
        variant: 'error',
      });
      return;
    }
    if (new Set(cleanedFields).size !== cleanedFields.length) {
      show({
        title: 'Duplicate fields',
        description: 'Each naming field must be unique.',
        variant: 'error',
      });
      return;
    }
    startTransition(async () => {
      try {
        await updateBrandAdNamingSchemaAction({
          brandId,
          platform,
          delimiter: trimmedDelimiter,
          fields: cleanedFields,
        });
        show({
          title: 'Naming convention saved',
          description: 'Your ad naming taxonomy was updated.',
          variant: 'success',
        });
      } catch (error) {
        show({
          title: 'Save failed',
          description: error instanceof Error ? error.message : 'Unable to save naming convention.',
          variant: 'error',
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Declare how you name ads on this platform — a delimiter plus an ordered list of field
        labels. Paid-media rows are parsed against it so insights can read an ad by its named parts.
      </p>

      <div className="flex max-w-[160px] flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Delimiter</span>
        <Input
          value={delimiter}
          onChange={(event) => setDelimiter(event.target.value)}
          placeholder="|"
          disabled={!canEdit}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Fields (in order)</span>
          <Button type="button" size="sm" variant="secondary" onClick={addItem} disabled={!canEdit}>
            <Plus /> Add field
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No fields yet. Add labels like funnel, format, audience.
          </p>
        ) : (
          items.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              <Input
                value={item.value}
                onChange={(event) => updateItem(item.id, event.target.value)}
                placeholder="Field label"
                className="flex-1"
                disabled={!canEdit}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeItem(item.id)}
                disabled={!canEdit}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 /> Remove
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Preview</span>
        <span className="font-mono text-sm text-muted-foreground">{preview || '—'}</span>
      </div>

      <div className="flex">
        <Button type="button" onClick={handleSave} disabled={isPending || !canEdit}>
          Save naming convention
        </Button>
      </div>

      {!canEdit ? (
        <Alert className="border-warning/30 bg-warning/10">
          <AlertDescription className="text-warning">
            Only brand owners or admins can edit the ad naming convention.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
