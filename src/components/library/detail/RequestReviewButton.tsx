'use client';

// "Request review" — pick brand members, write in-app notifications, and send
// email pings via the send-library-ping edge function. An optional due date
// drives the review-due sweep: reminders before it, escalation after.

import type { MediaAsset } from '@continuum/contracts';
import { Loader2Icon, UserRoundPlusIcon } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import { useSession } from '@/hooks/useSession';
import { useUiErrorMessage } from '@/i18n/errors';
import { requestAssetReviewOperation } from '@/lib/library/creativeOperations';
import {
  fetchReviewPingTargets,
  type ReviewPingTarget,
  selectablePingTargets,
  sendReviewPing,
} from '@/lib/notifications/reviewPing';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type RequestReviewButtonProps = {
  brandId: string;
  asset: MediaAsset;
};

export function RequestReviewButton({ brandId, asset }: RequestReviewButtonProps) {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('library');

  const toast = useToast();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<ReviewPingTarget[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadTargets = useCallback(async () => {
    setLoadError(null);
    try {
      setTargets(await fetchReviewPingTargets(brandId));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load teammates');
    }
  }, [brandId]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && targets === null) void loadTargets();
  };

  const toggleRecipient = (userId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0 || submitting) return;
    setSubmitting(true);
    try {
      const trimmedMessage = message.trim();
      await requestAssetReviewOperation(createSupabaseBrowserClient(), {
        brandId,
        assetId: asset.id,
        reviewerUserIds: [...selectedIds],
        ...(trimmedMessage ? { note: trimmedMessage } : {}),
        ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
        idempotencyKey: crypto.randomUUID(),
      });
      const result = await sendReviewPing({
        brandId,
        assetId: asset.id,
        recipientUserIds: [...selectedIds],
        ...(trimmedMessage ? { message: trimmedMessage } : {}),
      });
      toast.show({
        title: translateUi('pinged_value0_teammate_value1_7f6a31b5', {
          count: Number(result.notified),
        }),
        description:
          result.emailed > 0
            ? translateUi('value0_email_value1_sent_350b92a0', { count: Number(result.emailed) })
            : undefined,
        variant: 'success',
      });
      setOpen(false);
      setSelectedIds(new Set());
      setMessage('');
      setDueAt('');
    } catch (error) {
      toast.show({
        title: translateUi('review_ping_failed_a7c9592a'),
        description: uiErrorText(error),
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const visibleTargets = targets ? selectablePingTargets(targets, user?.id ?? null) : null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <UserRoundPlusIcon className="size-3.5" /> {translateUi('request_review_8f47b4cd')}{' '}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {' '}
          {translateUi('ping_teammates_213f856e')}{' '}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {asset.title ?? asset.fileName}
        </p>
        {loadError ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-red-500">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void loadTargets()}>
              {' '}
              {translateUi('retry_942087cc')}{' '}
            </Button>
          </div>
        ) : visibleTargets === null ? (
          <div className="flex items-center justify-center py-6">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : visibleTargets.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {' '}
            {translateUi('no_other_members_in_this_brand_yet_9bb91e6b')}{' '}
          </p>
        ) : (
          <>
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
              {visibleTargets.map((target) => (
                <label
                  key={target.id}
                  htmlFor={`review-ping-${target.id}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    id={`review-ping-${target.id}`}
                    checked={selectedIds.has(target.id)}
                    onCheckedChange={(checked) => toggleRecipient(target.id, checked === true)}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {target.email ?? translateUi('teammate_ab52c213')}
                  </span>
                  <span className="shrink-0 text-2xs uppercase text-muted-foreground">
                    {target.role}
                  </span>
                </label>
              ))}
            </div>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={translateUi('optional_note_what_should_they_look_6692c004')}
              maxLength={2000}
              className="mt-3 min-h-16 text-xs"
            />
            <label
              htmlFor="review-due-at"
              className="mt-3 flex flex-col gap-1 text-2xs text-muted-foreground"
            >
              {' '}
              {translateUi('due_optional_reminders_before_escal_1ba1180d')}{' '}
              <Input
                id="review-due-at"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="h-8 text-xs"
              />
            </label>
            <Button
              size="sm"
              className="mt-3 w-full gap-1.5"
              disabled={selectedIds.size === 0 || submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting && <Loader2Icon className="size-3.5 animate-spin" />}
              {submitting ? translateUi('sending_b8ed5279') : translateUi('send_ping_d9e6bc8b')}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
