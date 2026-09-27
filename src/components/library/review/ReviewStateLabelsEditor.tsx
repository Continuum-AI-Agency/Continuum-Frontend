'use client';

// Brand admins rename and recolour the five review states. The states and their
// workflow meaning are fixed; only how they read is the brand's call, and every
// surface that shows a status picks the change up through useReviewStateLabels.

import type { MediaReviewStatus, ReviewStateLabel } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast-imperative';
import { saveReviewStateLabels } from '@/lib/library/review';
import { REVIEW_STATUS_ORDER } from '@/lib/library/reviewStatus';
import { setBrandReviewLabels, useReviewStateLabels } from './useReviewStateLabels';

type Props = {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReviewStateLabelsEditor({ brandId, open, onOpenChange }: Props) {
  const current = useReviewStateLabels(brandId);
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(current);
  }, [open, current]);

  const edit = (state: MediaReviewStatus, patch: Partial<ReviewStateLabel>) =>
    setDraft((prev) => ({ ...prev, [state]: { ...prev[state], ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const labels = REVIEW_STATUS_ORDER.map((state, position) => ({
        ...draft[state],
        label: draft[state].label.trim(),
        position,
      }));
      setBrandReviewLabels(brandId, await saveReviewStateLabels(brandId, labels));
      onOpenChange(false);
    } catch (error) {
      toast.error(`Saving status labels failed · ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const invalid = REVIEW_STATUS_ORDER.some((state) => {
    const length = draft[state].label.trim().length;
    return length < 1 || length > 40;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Status labels</DialogTitle>
          <DialogDescription className="text-xs">
            How each review state reads for this brand, everywhere a status shows.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {REVIEW_STATUS_ORDER.map((state) => (
            <div key={state} className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`Colour for ${state}`}
                data-review-state={state}
                value={draft[state].color}
                onChange={(event) => edit(state, { color: event.target.value })}
                className="size-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
              />
              <Input
                aria-label={`Label for ${state}`}
                data-review-state={state}
                value={draft[state].label}
                maxLength={40}
                onChange={(event) => edit(state, { label: event.target.value })}
                className="h-8 text-xs"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={saving || invalid} onClick={() => void save()}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Save labels
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
