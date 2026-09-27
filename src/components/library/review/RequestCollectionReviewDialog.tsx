'use client';

// Assign reviewers to every asset in a (manual) collection in one go, with an
// optional due date that drives the reminder/escalation sweep, plus the
// collection's approval report. Mounted from the collection's menu.

import { Loader2, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast-imperative';
import { approvalReportHref, requestCollectionReview } from '@/lib/library/review';
import { fetchReviewPingTargets, type ReviewPingTarget } from '@/lib/notifications/reviewPing';

type Props = {
  brandId: string;
  collectionId: string;
  collectionName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RequestCollectionReviewDialog({
  brandId,
  collectionId,
  collectionName,
  open,
  onOpenChange,
}: Props) {
  const [targets, setTargets] = useState<ReviewPingTarget[] | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dueAt, setDueAt] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || targets) return;
    fetchReviewPingTargets(brandId)
      .then(setTargets)
      .catch((error: unknown) => {
        setTargets([]);
        toast.error(`Loading teammates failed · ${(error as Error).message}`);
      });
  }, [open, targets, brandId]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await requestCollectionReview({
        brandId,
        collectionId,
        reviewerUserIds: [...selected],
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
      });
      toast.success(
        `Review requested on ${result.assetIds.length} asset${result.assetIds.length === 1 ? '' : 's'}` +
          (result.skippedAssetIds.length > 0
            ? ` · ${result.skippedAssetIds.length} already in review`
            : ''),
      );
      onOpenChange(false);
      setSelected(new Set());
      setNote('');
      setDueAt('');
    } catch (error) {
      toast.error(`Requesting review failed · ${(error as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <UsersRound className="size-4" />
            Request review
          </DialogTitle>
          <DialogDescription className="truncate text-xs">
            Every asset in {collectionName} goes to review with these reviewers.
          </DialogDescription>
        </DialogHeader>
        {targets === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {targets.map((target) => (
              <label
                key={target.id}
                htmlFor={`collection-review-${target.id}`}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
              >
                <Checkbox
                  id={`collection-review-${target.id}`}
                  checked={selected.has(target.id)}
                  onCheckedChange={(checked) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (checked === true) next.add(target.id);
                      else next.delete(target.id);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {target.email ?? 'Teammate'}
                </span>
                <span className="text-2xs uppercase text-muted-foreground">{target.role}</span>
              </label>
            ))}
          </div>
        )}
        <label
          htmlFor="collection-review-due-at"
          className="flex flex-col gap-1 text-xs text-muted-foreground"
        >
          Due (reminders before, escalation after)
          <Input
            id="collection-review-due-at"
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="h-8 text-xs"
          />
        </label>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note for the reviewers"
          maxLength={2000}
          className="min-h-16 text-xs"
        />
        <DialogFooter className="items-center sm:justify-between">
          <a
            href={approvalReportHref({ brandId, collectionId })}
            download
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Approval report
          </a>
          <Button
            type="button"
            size="sm"
            disabled={selected.size === 0 || submitting}
            onClick={() => void submit()}
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            Request review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
