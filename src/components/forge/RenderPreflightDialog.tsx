'use client';

import type {
  ApiRenderBatchRecord,
  ApiRenderDeliveryTarget,
  ApiRenderTemplateContract,
} from '@continuum/contracts';
import { Loader2, Play } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast-imperative';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

// The last look before a batch is spent: exactly the rows × formats about to render, then
// Confirm → batch preflight → create batch. The render set is already saved by the caller, so
// every record here points at an immutable revision.
//
// `records[i]` belongs to `rows[i]`. A row's `delivery`, when set, is applied to its record at
// confirm, so the Deliver step edits rows (via `onDeliveryChange`) and never rebuilds records.

export type RenderPreflightRow = {
  rowId: string;
  label: string;
  labelPath: string[];
  outputIds: string[];
  delivery?: ApiRenderDeliveryTarget;
};

export type RenderPreflightDialogProps = {
  open: boolean;
  brandId: string;
  bindingId: string | null;
  templateKey: string;
  contractHash: string;
  contract: ApiRenderTemplateContract;
  rows: RenderPreflightRow[];
  records: ApiRenderBatchRecord[];
  onDeliveryChange: (rowId: string, delivery: ApiRenderDeliveryTarget | null) => void;
  onClose: () => void;
  onFired: (jobIds: string[]) => void;
};

export function RenderPreflightDialog({
  open,
  brandId,
  bindingId,
  templateKey,
  contractHash,
  contract,
  rows,
  records,
  onClose,
  onFired,
}: RenderPreflightDialogProps) {
  const [firing, setFiring] = useState(false);
  const formatLabel = (id: string) =>
    contract.outputs.find((output) => output.id === id)?.label ?? id;

  const confirm = async () => {
    setFiring(true);
    try {
      const preflight = await apiRendersApi.batchPreflight({
        brandId,
        ...(bindingId ? { bindingId } : {}),
        templateKey,
        contractHash,
        records: records.map((record, index) => {
          const delivery = rows[index]?.delivery;
          return delivery ? { ...record, delivery } : record;
        }),
      });
      const batch = await apiRendersApi.createBatch({
        confirmationToken: preflight.confirmationToken,
      });
      toast.success(`${batch.jobs.length} render${batch.jobs.length === 1 ? '' : 's'} queued`);
      onFired(batch.jobs.map((job) => job.id));
    } catch (error) {
      toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
    } finally {
      setFiring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next || firing ? undefined : onClose())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Render {rows.length} row{rows.length === 1 ? '' : 's'}
          </DialogTitle>
          <DialogDescription>
            {contract.template.displayName ?? contract.template.name} · saved to the Library
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 divide-y overflow-y-auto rounded-md border text-xs">
          {rows.map((row) => (
            <li key={row.rowId} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span
                className="min-w-0 flex-1 truncate font-medium"
                title={row.labelPath.join(' / ')}
              >
                {row.labelPath.length > 1 ? row.labelPath.join(' / ') : row.label}
              </span>
              <span className="text-muted-foreground">
                {row.outputIds.length ? row.outputIds.map(formatLabel).join(', ') : 'All formats'}
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={firing} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="gap-1.5" disabled={firing} onClick={confirm}>
            {firing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Play className="size-3.5" aria-hidden />
            )}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
