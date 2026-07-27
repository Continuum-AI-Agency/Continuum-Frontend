'use client';

// Email the on-demand Continuum Report (comprehensive dashboard distillation) OR
// set up a recurring weekly/monthly send. One-off uses the send_now edge action;
// recurring persists a per-brand schedule (send-first-value-report schedule action)
// that the queue + worker cron then deliver. Different name from the scheduled
// Continuum Pulse digest — same edge builder with presentation: continuum_report.

import { useEffect, useMemo, useState } from 'react';
import { ExternalEmailChipsInput } from '@/components/automations/AutomationBuilder/ExternalEmailChipsInput';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/ToastProvider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useRecipientCandidates } from '@/lib/automations/automations';
import {
  cancelReportSchedule,
  getReportScheduleAccess,
  sendContinuumReport,
  summarizeReportRecipients,
  upsertReportSchedule,
} from '@/lib/brands/sendPulseReport';

type SendContinuumReportDialogProps = {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Mode = 'one_off' | 'weekly' | 'monthly';

const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const resolveDefaultTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const clampDayOfMonth = (raw: number): number => {
  if (!Number.isFinite(raw)) return 1;
  return Math.min(28, Math.max(1, Math.round(raw)));
};

export function SendContinuumReportDialog({
  brandId,
  open,
  onOpenChange,
}: SendContinuumReportDialogProps) {
  const { show } = useToast();
  const { data: candidates, isLoading } = useRecipientCandidates(open ? brandId : undefined);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('one_off');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hour, setHour] = useState(9);
  const [timezone, setTimezone] = useState(resolveDefaultTimezone);
  const [externalEmails, setExternalEmails] = useState<string[]>([]);
  const [hasEnabledSchedule, setHasEnabledSchedule] = useState(false);
  const [canManageSchedule, setCanManageSchedule] = useState(false);
  const [prefilledFromSchedule, setPrefilledFromSchedule] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [retryReceiptId, setRetryReceiptId] = useState<string | null>(null);

  // Load the brand's existing schedule on open — prefills the recurring fields and
  // flips the primary control to its cadence. Missing schedule is not an error.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPrefilledFromSchedule(false);
    setHasEnabledSchedule(false);
    setCanManageSchedule(false);
    setExternalEmails([]);
    setMode('one_off');
    setRetryReceiptId(null);

    getReportScheduleAccess(brandId)
      .then(({ schedule, canManageSchedule: canManage }) => {
        if (cancelled) return;
        setCanManageSchedule(canManage);
        if (!schedule) return;
        setMode(schedule.cadence);
        setDayOfWeek(schedule.dayOfWeek ?? 1);
        setDayOfMonth(schedule.dayOfMonth ?? 1);
        setHour(schedule.hour);
        setTimezone(schedule.timezone);
        setExternalEmails(schedule.recipients.externalEmails);
        setSelectedUserIds(schedule.recipients.memberUserIds);
        setHasEnabledSchedule(schedule.enabled);
        setPrefilledFromSchedule(true);
      })
      .catch((error) => {
        if (cancelled) return;
        show({
          title: 'Could not load report schedule',
          description: error instanceof Error ? error.message : 'Unknown error.',
          variant: 'error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [open, brandId, show]);

  // Fresh open with no schedule: pre-select every member with an email so the user
  // only deselects. A schedule prefill owns the selection, so skip then.
  useEffect(() => {
    if (!open || !candidates || prefilledFromSchedule) return;
    setSelectedUserIds(candidates.map((candidate) => candidate.userId));
  }, [open, candidates, prefilledFromSchedule]);

  const selectedCount = selectedUserIds.length;
  const isRecurring = mode !== 'one_off';
  const hasAnyRecipient = selectedCount > 0 || externalEmails.length > 0;
  const canSend = mode === 'one_off' && selectedCount > 0 && !isBusy && !isLoading;
  const canSave = isRecurring && canManageSchedule && hasAnyRecipient && !isBusy && !isLoading;

  const selectedEmails = useMemo(() => {
    if (!candidates) return [];
    const selected = new Set(selectedUserIds);
    return candidates.filter((c) => selected.has(c.userId)).map((c) => c.email);
  }, [candidates, selectedUserIds]);

  const toggle = (userId: string, next: boolean) => {
    setRetryReceiptId(null);
    setSelectedUserIds((current) =>
      next ? [...current, userId] : current.filter((id) => id !== userId),
    );
  };

  const handleSend = async () => {
    if (selectedUserIds.length === 0) return;
    setIsBusy(true);
    try {
      const { recipients, status, receiptId } = await sendContinuumReport({
        brandId,
        recipientUserIds: selectedUserIds,
        ...(retryReceiptId ? { retryReceiptId } : {}),
      });
      if (status === 'partial') {
        setRetryReceiptId(receiptId);
        show({
          title: 'Some recipients still need delivery',
          description: 'Retry to send only to recipients whose delivery failed.',
          variant: 'error',
        });
        return;
      }
      if (status === 'suppressed') {
        setRetryReceiptId(null);
        show({
          title: 'No report email was sent',
          description: 'The selected recipients have opted out of this report email.',
          variant: 'error',
        });
        return;
      }
      setRetryReceiptId(null);
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
      setIsBusy(false);
    }
  };

  const handleSave = async () => {
    if (!hasAnyRecipient) return;
    setIsBusy(true);
    try {
      const schedule = await upsertReportSchedule({
        brandId,
        cadence: mode === 'monthly' ? 'monthly' : 'weekly',
        dayOfWeek: mode === 'weekly' ? dayOfWeek : null,
        dayOfMonth: mode === 'monthly' ? clampDayOfMonth(dayOfMonth) : null,
        hour,
        timezone: timezone.trim() || 'UTC',
        memberUserIds: selectedUserIds,
        externalEmails,
      });
      show({
        title: 'Recurring report scheduled',
        description: `Next send ${new Date(schedule.nextRunAt).toLocaleString()}.`,
        variant: 'success',
      });
      onOpenChange(false);
    } catch (error) {
      show({
        title: 'Could not save the schedule',
        description: error instanceof Error ? error.message : 'Unknown error.',
        variant: 'error',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleTurnOff = async () => {
    setIsBusy(true);
    try {
      await cancelReportSchedule(brandId);
      show({ title: 'Recurring report turned off', variant: 'success' });
      onOpenChange(false);
    } catch (error) {
      show({
        title: 'Could not turn off the schedule',
        description: error instanceof Error ? error.message : 'Unknown error.',
        variant: 'error',
      });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Email Continuum Report</DialogTitle>
          <DialogDescription>
            Send now, or schedule a recurring dashboard readout — KPIs with period changes,
            audience, organic and paid performance, and insights.
          </DialogDescription>
        </DialogHeader>

        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(next) => {
            if (next) setMode(next as Mode);
          }}
          className={`grid gap-1 ${canManageSchedule ? 'grid-cols-3' : 'grid-cols-1'}`}
        >
          <ToggleGroupItem value="one_off">One-off</ToggleGroupItem>
          {canManageSchedule ? (
            <>
              <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
              <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
            </>
          ) : null}
        </ToggleGroup>

        {isRecurring && (
          <div className="grid grid-cols-2 gap-3">
            {mode === 'weekly' ? (
              <div className="space-y-1.5">
                <Label htmlFor="report-day-of-week">Day of week</Label>
                <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
                  <SelectTrigger id="report-day-of-week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_LABELS.map((label, index) => (
                      <SelectItem key={label} value={String(index)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="report-day-of-month">Day of month</Label>
                <Input
                  id="report-day-of-month"
                  type="number"
                  min={1}
                  max={28}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(clampDayOfMonth(Number(e.target.value)))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="report-hour">Hour</Label>
              <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
                <SelectTrigger id="report-hour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, '0')}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="report-timezone">Timezone</Label>
              <Input
                id="report-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="UTC"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Brand members</p>
          <div className="max-h-56 space-y-1 overflow-y-auto py-1">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full bg-muted/70" />
                <Skeleton className="h-12 w-full bg-muted/70" />
              </div>
            ) : !candidates || candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No members with an email on this brand.
              </p>
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
        </div>

        {isRecurring && (
          <div className="space-y-1.5">
            <Label>External recipients</Label>
            <ExternalEmailChipsInput value={externalEmails} onChange={setExternalEmails} />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {isRecurring && hasEnabledSchedule && (
            <Button variant="outline" onClick={() => void handleTurnOff()} disabled={isBusy}>
              Turn off
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
            Cancel
          </Button>
          {isRecurring ? (
            <Button onClick={() => void handleSave()} disabled={!canSave}>
              {isBusy ? 'Saving…' : !hasAnyRecipient ? 'Add a recipient' : 'Save schedule'}
            </Button>
          ) : (
            <Button onClick={() => void handleSend()} disabled={!canSend}>
              {isBusy
                ? 'Sending…'
                : selectedCount === 0
                  ? 'Select recipients'
                  : retryReceiptId
                    ? 'Retry failed recipients'
                    : `Send to ${selectedCount}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
