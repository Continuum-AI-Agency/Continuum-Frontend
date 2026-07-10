'use client';

// Pick brand members, then email the on-demand Continuum Report (comprehensive
// dashboard distillation). Not the scheduled Continuum Pulse digest — different
// name, same edge builder with presentation: continuum_report.

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/ToastProvider';
import { useRecipientCandidates } from '@/lib/automations/automations';
import { sendContinuumReport, summarizeReportRecipients } from '@/lib/brands/sendPulseReport';

type SendContinuumReportDialogProps = {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SendContinuumReportDialog({
  brandId,
  open,
  onOpenChange,
}: SendContinuumReportDialogProps) {
  const { show } = useToast();
  const { data: candidates, isLoading } = useRecipientCandidates(open ? brandId : undefined);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Fresh open: pre-select every member with an email so the user only deselects.
  useEffect(() => {
    if (!open || !candidates) return;
    setSelectedUserIds(candidates.map((candidate) => candidate.userId));
  }, [open, candidates]);

  const selectedCount = selectedUserIds.length;
  const canSend = selectedCount > 0 && !isSending && !isLoading;

  const selectedEmails = useMemo(() => {
    if (!candidates) return [];
    const selected = new Set(selectedUserIds);
    return candidates.filter((c) => selected.has(c.userId)).map((c) => c.email);
  }, [candidates, selectedUserIds]);

  const toggle = (userId: string, next: boolean) => {
    setSelectedUserIds((current) =>
      next ? [...current, userId] : current.filter((id) => id !== userId),
    );
  };

  const handleSend = async () => {
    if (selectedUserIds.length === 0) return;
    setIsSending(true);
    try {
      const { recipients } = await sendContinuumReport({
        brandId,
        recipientUserIds: selectedUserIds,
      });
      show({
        title: 'Continuum Report sent',
        description: summarizeReportRecipients(recipients.length > 0 ? recipients : selectedEmails),
        variant: 'success',
      });
      onOpenChange(false);
    } catch (error) {
      show({
        title: 'Could not send the Continuum Report',
        description: error instanceof Error ? error.message : 'Unknown error.',
        variant: 'error',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Email Continuum Report</DialogTitle>
          <DialogDescription>
            Choose brand members who should receive a comprehensive dashboard readout — KPIs with
            period changes, audience, organic and paid performance, and insights.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1 overflow-y-auto py-1">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full bg-muted/70" />
              <Skeleton className="h-12 w-full bg-muted/70" />
            </div>
          ) : !candidates || candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members with an email on this brand.</p>
          ) : (
            candidates.map((candidate) => {
              const checked = selectedUserIds.includes(candidate.userId);
              return (
                <div
                  key={candidate.userId}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{candidate.email}</p>
                    <p className="text-xs capitalize text-muted-foreground">{candidate.role}</p>
                  </div>
                  <Switch
                    checked={checked}
                    aria-label={`Email Continuum Report to ${candidate.email}`}
                    onCheckedChange={(next) => toggle(candidate.userId, next)}
                  />
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSend()} disabled={!canSend}>
            {isSending
              ? 'Sending…'
              : selectedCount === 0
                ? 'Select recipients'
                : `Send to ${selectedCount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
