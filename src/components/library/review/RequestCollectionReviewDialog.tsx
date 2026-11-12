'use client';

// Assign reviewers to every asset in a (manual) collection in one go, with an
// optional due date that drives the reminder/escalation sweep, plus the
// collection's approval report. Mounted from the collection's menu.

import { Loader2, UsersRound } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
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
  const translateUi = useUiTranslations('library');

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
        toast.error(
          translateUi('loading_teammates_failed_value0_a571da5e', {
            value0: String((error as Error).message),
          }),
        );
      });
  }, [open, targets, brandId, translateUi]);

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
        translateUi('review_requested_on_value0_asset_va_540bf3cc', {
          count: Number(result.assetIds.length),
        }) +
          (result.skippedAssetIds.length > 0
            ? translateUi('value0_already_in_review_14dccc9b', {
                value0: String(result.skippedAssetIds.length),
              })
            : ''),
      );
      onOpenChange(false);
      setSelected(new Set());
      setNote('');
      setDueAt('');
    } catch (error) {
      toast.error(
        translateUi('requesting_review_failed_value0_2de664f5', {
          value0: String((error as Error).message),
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <UsersRound className="size-4" /> {translateUi('request_review_8f47b4cd')}{' '}
          </DialogTitle>
          <DialogDescription className="truncate text-xs">
            {' '}
            {translateUi('every_asset_in_0774c290')} {collectionName}{' '}
            {translateUi('goes_to_review_with_these_reviewers_65f3cb58')}{' '}
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
                  {target.email ?? translateUi('teammate_ab52c213')}
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
          {' '}
          {translateUi('due_reminders_before_escalation_aft_ab5525b4')}{' '}
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
          placeholder={translateUi('optional_note_for_the_reviewers_d677d6f6')}
          maxLength={2000}
          className="min-h-16 text-xs"
        />
        <DialogFooter className="items-center sm:justify-between">
          <a
            href={approvalReportHref({ brandId, collectionId })}
            download
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {' '}
            {translateUi('approval_report_bb125019')}{' '}
          </a>
          <Button
            type="button"
            size="sm"
            disabled={selected.size === 0 || submitting}
            onClick={() => void submit()}
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}{' '}
            {translateUi('request_review_8f47b4cd')}{' '}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
