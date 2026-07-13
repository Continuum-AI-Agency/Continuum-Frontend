'use client';

// The asset's answers to the brand's custom fields, in the detail modal's
// sidebar. One PUT per value — the API sets a single field at a time, which is
// also what an editor emits, so a failed save rolls back exactly the one control
// that failed and leaves the others alone.
//
// review_status is deliberately NOT here: it is an audited approval with its own
// control in the header, not a value anyone can overwrite from a select.

import type { AssetFieldValue, CustomField, CustomFieldValue } from '@continuum/contracts';
import { Loader2, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listAssetFieldValues, setAssetFieldValue } from '@/lib/library/customFields';
import { validateCustomFieldValue, valuesByFieldId } from '@/lib/library/customFieldValue';
import { CustomFieldManagerDialog } from './CustomFieldManagerDialog';
import { CustomFieldValueEditor } from './CustomFieldValueEditor';
import { useCustomFields } from './useCustomFields';

export type AssetFieldsPanelProps = {
  brandId: string;
  assetId: string;
};

export function AssetFieldsPanel({ brandId, assetId }: AssetFieldsPanelProps) {
  const { fields, error: fieldsError, refresh } = useCustomFields(brandId);
  const [values, setValues] = useState<Map<string, CustomFieldValue> | null>(null);
  const [valuesError, setValuesError] = useState<string | null>(null);
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setValues(null);
    setValuesError(null);
    listAssetFieldValues({ brandId, assetId })
      .then((rows: AssetFieldValue[]) => {
        if (!cancelled) setValues(valuesByFieldId(rows));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setValues(new Map());
        setValuesError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, assetId]);

  const save = useCallback(
    async (field: CustomField, next: CustomFieldValue) => {
      const checked = validateCustomFieldValue(field, next);
      if (!checked.ok) {
        toast.error(checked.error);
        return;
      }
      const previous = values?.get(field.id) ?? null;
      // Optimistic: the control shows the new answer immediately and reverts to
      // the stored one if the write is refused.
      setValues((prev) => new Map(prev ?? []).set(field.id, checked.value));
      setSavingFieldId(field.id);
      try {
        const saved = await setAssetFieldValue({
          brandId,
          assetId,
          fieldId: field.id,
          value: checked.value,
        });
        setValues((prev) => new Map(prev ?? []).set(field.id, saved.value));
      } catch (err) {
        setValues((prev) => new Map(prev ?? []).set(field.id, previous));
        toast.error(`Saving ${field.name} failed · ${(err as Error).message}`);
      } finally {
        setSavingFieldId(null);
      }
    },
    [brandId, assetId, values],
  );

  const loading = fields === null || values === null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3 pb-1">
        <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          Custom fields
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-2xs text-muted-foreground"
          onClick={() => setManagerOpen(true)}
        >
          <Settings2 className="size-3.5" />
          Manage
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pt-1 pb-3">
        {fieldsError ? <p className="text-xs text-destructive">{fieldsError}</p> : null}
        {valuesError ? <p className="text-xs text-destructive">{valuesError}</p> : null}

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        ) : fields.length === 0 ? (
          <EmptyFields onAdd={() => setManagerOpen(true)} />
        ) : (
          fields.map((field) => (
            <div key={field.id} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{field.name}</span>
                {savingFieldId === field.id ? (
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <CustomFieldValueEditor
                field={field}
                value={values.get(field.id) ?? null}
                disabled={savingFieldId === field.id}
                onChange={(next) => void save(field, next)}
              />
            </div>
          ))
        )}
      </div>

      {fields ? (
        <CustomFieldManagerDialog
          brandId={brandId}
          open={managerOpen}
          onOpenChange={setManagerOpen}
          fields={fields}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}

function EmptyFields({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
      <p className="text-xs font-medium">No custom fields yet</p>
      <p className="mt-1 text-2xs text-muted-foreground">
        Track what your team needs to know about an asset — usage rights, a rating, the campaign it
        belongs to.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3 h-7 text-xs"
        onClick={onAdd}
      >
        Add a field
      </Button>
    </div>
  );
}
