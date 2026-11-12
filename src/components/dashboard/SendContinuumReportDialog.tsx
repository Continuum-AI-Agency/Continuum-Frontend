'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';

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
  const uiLocale = useLocale();

  const getUiErrorMessage = useUiErrorMessage();

  const uiText = useTranslations('dashboard');
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
          title: uiText('could_not_load_report_schedule_6c63202'),
          description: getUiErrorMessage(error),
          variant: 'error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [open, brandId, show, uiText, getUiErrorMessage]);

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
          title: uiText('some_recipients_still_need_delivery_e1851e7'),
          description: uiText('retry_to_send_only_to_recipients_whose_delive_05fbb83'),
          variant: 'error',
        });
        return;
      }
      if (status === 'suppressed') {
        setRetryReceiptId(null);
        show({
          title: uiText('no_report_email_was_sent_32997f6'),
          description: uiText('the_selected_recipients_have_opted_out_of_thi_55709a7'),
          variant: 'error',
        });
        return;
      }
      setRetryReceiptId(null);
      show({
        title: uiText('continuum_report_sent_115183c'),
        description: summarizeReportRecipients(recipients.length > 0 ? recipients : selectedEmails),
        variant: 'success',
      });
      onOpenChange(false);
    } catch (error) {
      show({
        title: uiText('could_not_send_the_continuum_report_de03065'),
        description: getUiErrorMessage(error),
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
        title: uiText('recurring_report_scheduled_9bc35fc'),
        description: uiText('m_0cf19f37bf', {
          v0: String(new Date(schedule.nextRunAt).toLocaleString(uiLocale)),
        }),
        variant: 'success',
      });
      onOpenChange(false);
    } catch (error) {
      show({
        title: uiText('could_not_save_the_schedule_c4ea60d'),
        description: getUiErrorMessage(error),
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
      show({
        title: uiText('recurring_report_turned_off_7bee2da'),
        variant: 'success',
      });
      onOpenChange(false);
    } catch (error) {
      show({
        title: uiText('could_not_turn_off_the_schedule_ec0cf85'),
        description: getUiErrorMessage(error),
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
          <DialogTitle>{uiText('email_continuum_report_fed107b')}</DialogTitle>
          <DialogDescription>
            {uiText('send_now_or_schedule_a_recurring_dashboard_re_fd0c53c')}
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
          <ToggleGroupItem value="one_off">{uiText('one_off_6fbbd35')}</ToggleGroupItem>
          {canManageSchedule ? (
            <>
              <ToggleGroupItem value="weekly">{uiText('weekly_2975132')}</ToggleGroupItem>
              <ToggleGroupItem value="monthly">{uiText('monthly_9b11f6b')}</ToggleGroupItem>
            </>
          ) : null}
        </ToggleGroup>

        {isRecurring && (
          <div className="grid grid-cols-2 gap-3">
            {mode === 'weekly' ? (
              <div className="space-y-1.5">
                <Label htmlFor="report-day-of-week">{uiText('day_of_week_a757b22')}</Label>
                <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
                  <SelectTrigger id="report-day-of-week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_LABELS.map((label, index) => (
                      <SelectItem key={label} value={String(index)}>
                        {new Intl.DateTimeFormat(uiLocale, {
                          weekday: 'long',
                          timeZone: 'UTC',
                        }).format(new Date(Date.UTC(2023, 0, 1 + index)))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="report-day-of-month">{uiText('day_of_month_d15f472')}</Label>
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
              <Label htmlFor="report-hour">{uiText('hour_f0063b8')}</Label>
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
              <Label htmlFor="report-timezone">{uiText('timezone_4ceca1d')}</Label>
              <Input
                id="report-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder={uiText('m_bdfd4d8d69')}
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {uiText('brand_members_ab30f14')}
          </p>
          <div className="max-h-56 space-y-1 overflow-y-auto py-1">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full bg-muted/70" />
                <Skeleton className="h-12 w-full bg-muted/70" />
              </div>
            ) : !candidates || candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {uiText('no_members_with_an_email_on_this_brand_c3eb0b6')}
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
                      aria-label={uiText('m_58672d66db', {
                        v0: String(candidate.email),
                      })}
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
            <Label>{uiText('external_recipients_195426f')}</Label>
            <ExternalEmailChipsInput value={externalEmails} onChange={setExternalEmails} />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {isRecurring && hasEnabledSchedule && (
            <Button variant="outline" onClick={() => void handleTurnOff()} disabled={isBusy}>
              {uiText('turn_off_06f0e21')}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
            {uiText('cancel_19766ed')}
          </Button>
          {isRecurring ? (
            <Button onClick={() => void handleSave()} disabled={!canSave}>
              {isBusy
                ? uiText('saving_23e3929')
                : !hasAnyRecipient
                  ? uiText('add_a_recipient_e9462ab')
                  : uiText('save_schedule_387f355')}
            </Button>
          ) : (
            <Button onClick={() => void handleSend()} disabled={!canSend}>
              {isBusy
                ? uiText('sending_b8ed527')
                : selectedCount === 0
                  ? uiText('select_recipients_d713866')
                  : retryReceiptId
                    ? uiText('retry_failed_recipients_e860175')
                    : uiText('m_672c2403e9', { v0: String(selectedCount) })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
