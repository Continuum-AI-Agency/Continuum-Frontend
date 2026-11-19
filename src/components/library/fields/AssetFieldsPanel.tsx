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
import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast-imperative';
import { useUiErrorMessage } from '@/i18n/errors';
import { listAssetFieldValues, setAssetFieldValue } from '@/lib/library/customFields';
import { validateCustomFieldValue, valuesByFieldId } from '@/lib/library/customFieldValue';
import { useLibraryAccess } from '@/lib/library/useBrandRole';
import { subscribeToRowBroadcasts } from '@/lib/supabase/realtime';
import { useCardFieldDisplay } from '../views/useLibraryFieldOptions';
import { CustomFieldManagerDialog } from './CustomFieldManagerDialog';
import { CustomFieldValueEditor } from './CustomFieldValueEditor';
import { useCustomFields } from './useCustomFields';

export type AssetFieldsPanelProps = {
  brandId: string;
  assetId: string;
};

export function AssetFieldsPanel({ brandId, assetId }: AssetFieldsPanelProps) {
  const translateUi = useUiTranslations('library');
  const uiErrorText = useUiErrorMessage();
  const fieldDisplay = useCardFieldDisplay();

  const { fields, error: fieldsError, refresh } = useCustomFields(brandId);
  const [values, setValues] = useState<Map<string, CustomFieldValue> | null>(null);
  const [valuesFailure, setValuesFailure] = useState<unknown>(null);
  const valuesError = valuesFailure === null ? null : uiErrorText(valuesFailure);
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const { canEdit } = useLibraryAccess(brandId, { assetId });

  // Another member's write to this asset's fields lands here as the row arrives.
  // The topic is the brand's; this asset's values are picked out here.
  useEffect(
    () =>
      subscribeToRowBroadcasts({
        topic: `asset_field_values:${brandId}`,
        bindings: [
          {
            event: '*',
            onRow: (row, meta) => {
              const source = meta.eventType === 'DELETE' ? meta.old : row;
              if (source.asset_id !== assetId) return;
              const fieldId = typeof source.field_id === 'string' ? source.field_id : null;
              if (!fieldId) return;
              setValues((prev) =>
                new Map(prev ?? []).set(
                  fieldId,
                  meta.eventType === 'DELETE' ? null : (row.value as CustomFieldValue),
                ),
              );
            },
          },
        ],
      }),
    [brandId, assetId],
  );

  useEffect(() => {
    let cancelled = false;
    setValues(null);
    setValuesFailure(null);
    listAssetFieldValues({ brandId, assetId })
      .then((rows: AssetFieldValue[]) => {
        if (!cancelled) setValues(valuesByFieldId(rows));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setValues(new Map());
        setValuesFailure(err);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, assetId]);

  const save = useCallback(
    async (field: CustomField, next: CustomFieldValue) => {
      const checked = validateCustomFieldValue(field, next, fieldDisplay);
      if (!checked.ok) {
        console.warn('[Custom field] invalid value', {
          fieldId: field.id,
          reason: checked.diagnosticReason,
        });
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
        toast.error(
          translateUi('saving_value0_failed_value1_8ed644c5', {
            value0: String(field.name),
            value1: uiErrorText(err),
          }),
        );
      } finally {
        setSavingFieldId(null);
      }
    },
    [brandId, assetId, values, translateUi, fieldDisplay, uiErrorText],
  );

  const loading = fields === null || values === null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3 pb-1">
        <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {' '}
          {translateUi('custom_fields_5566db49')}{' '}
        </p>
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-2xs text-muted-foreground"
            onClick={() => setManagerOpen(true)}
          >
            <Settings2 className="size-3.5" /> {translateUi('manage_5a234448')}{' '}
          </Button>
        ) : null}
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
                disabled={!canEdit || savingFieldId === field.id}
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
  const translateUi = useUiTranslations('library');

  return (
    <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
      <p className="text-xs font-medium">{translateUi('no_custom_fields_yet_eb0a32b0')}</p>
      <p className="mt-1 text-2xs text-muted-foreground">
        {' '}
        {translateUi('track_what_your_team_needs_to_know__eb9e3ba9')}{' '}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3 h-7 text-xs"
        onClick={onAdd}
      >
        {' '}
        {translateUi('add_a_field_72d29bb1')}{' '}
      </Button>
    </div>
  );
}
