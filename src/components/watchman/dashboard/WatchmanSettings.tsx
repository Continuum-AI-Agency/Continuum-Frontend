'use client';

import {
  WATCHMAN_AUTONOMY_CLASSES,
  WATCHMAN_AUTONOMY_LEVELS,
  type WatchmanManageInput,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUiErrorMessage } from '@/i18n/errors';
import { manageWatchman, watchmanQueryKeys, watchmanReads } from '@/lib/watchman/api';

export function WatchmanSettings({
  brandId,
  watchmanId,
  ready,
}: {
  brandId: string;
  watchmanId: string;
  ready: boolean;
}) {
  const t = useTranslations('automations');
  const explainError = useUiErrorMessage();
  const client = useQueryClient();
  const status = useQuery({
    queryKey: watchmanQueryKeys.part(brandId, 'status'),
    queryFn: () => watchmanReads.status(brandId),
  });
  const tasks = useQuery({
    queryKey: watchmanQueryKeys.part(brandId, 'tasks', watchmanId),
    queryFn: () => watchmanReads.tasks(brandId, watchmanId),
  });
  const reports = useQuery({
    queryKey: watchmanQueryKeys.part(brandId, 'reports', watchmanId),
    queryFn: () => watchmanReads.reports(brandId, watchmanId),
  });
  const act = useMutation({
    mutationFn: (input: WatchmanManageInput) =>
      manageWatchman(brandId, { ...input, watchman_id: watchmanId }, z.unknown()),
    onSuccess: () => client.invalidateQueries({ queryKey: watchmanQueryKeys.all(brandId) }),
  });
  const teammate = status.data?.watchmen.find((row) => row.id === watchmanId);
  if (status.isPending)
    return <p className="p-[var(--card-pad)] text-xs text-muted-foreground">{t('team.loading')}</p>;
  if (status.isError)
    return (
      <p role="alert" className="p-[var(--card-pad)] text-sm text-destructive">
        {explainError(status.error)}
      </p>
    );
  if (!teammate) return null;
  return (
    <div className="space-y-5 border-y border-border p-[var(--card-pad)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t('team.settingsDescription')}</p>
        <Button
          variant="outline"
          disabled={act.isPending || (teammate.status !== 'active' && !ready)}
          onClick={() =>
            act.mutate({
              action: 'configure',
              configure: { status: teammate.status === 'active' ? 'paused' : 'active' },
            })
          }
        >
          {t(teammate.status === 'active' ? 'pause_858e4ba' : 'activate_24433c7')}
        </Button>
      </div>
      <WatchmanBudget
        budget={teammate.budget.budget_usd}
        pending={act.isPending}
        onSave={(budget) =>
          act.mutateAsync({ action: 'configure', configure: { budget_usd_month: budget } })
        }
      />
      {WATCHMAN_AUTONOMY_CLASSES.map((kind) => (
        <div key={kind} className="flex flex-wrap items-center justify-between gap-3">
          <Label htmlFor={`permission-${kind}`}>{t(`team.permission.${kind}`)}</Label>
          <Select
            value={teammate.autonomy[kind] ?? 'off'}
            disabled={act.isPending}
            onValueChange={(value) => {
              if (value === 'off' || value === 'approve' || value === 'auto')
                act.mutate({ action: 'configure', configure: { autonomy: { [kind]: value } } });
            }}
          >
            <SelectTrigger id={`permission-${kind}`} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WATCHMAN_AUTONOMY_LEVELS.filter(
                (level) => kind !== 'optimize' || level !== 'auto',
              ).map((level) => (
                <SelectItem key={level} value={level}>
                  {t(`team.permissionLevel.${level}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t('team.responsibilities')}</h3>
        {tasks.isError ? (
          <p role="alert" className="text-xs text-destructive">
            {explainError(tasks.error)}
          </p>
        ) : null}
        {tasks.data?.tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
          >
            <span className="min-w-0 text-xs">{task.title}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={act.isPending}
              onClick={() =>
                act.mutate({
                  action: 'task_update',
                  task_id: task.id,
                  patch: { active: !task.active },
                })
              }
            >
              {t(
                typeof task.active !== 'boolean'
                  ? 'team.unknown'
                  : task.active
                    ? 'pause_858e4ba'
                    : 'team.resume',
              )}
            </Button>
          </div>
        ))}
        {!tasks.isPending && !tasks.isError && !tasks.data?.tasks.length ? (
          <p className="text-xs text-muted-foreground">{t('team.noResponsibilities')}</p>
        ) : null}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t('reports_held_for_review_d907daf')}</h3>
        {reports.isError ? (
          <p role="alert" className="text-xs text-destructive">
            {explainError(reports.error)}
          </p>
        ) : null}
        {reports.data?.reports
          .filter((report) => report.status === 'held')
          .map((report) => (
            <details key={report.id} className="border-b border-border py-2">
              <summary className="cursor-pointer text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring">
                {report.subject}
              </summary>
              <div className="space-y-3 py-3">
                <SafeMarkdown content={report.body_md} mode="static" />
                <p className="break-words text-xs text-muted-foreground">
                  {report.recipients.map((recipient) => recipient.email).join(', ')}
                </p>
                <Button
                  disabled={act.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        t('send_subject_to_count_plural_one_recipient_ot_a9b317c', {
                          subject: report.subject,
                          count: report.recipients.length,
                        }),
                      )
                    )
                      act.mutate({ action: 'report_release', report_id: report.id });
                  }}
                >
                  {t('release_e020e3c')}
                </Button>
              </div>
            </details>
          ))}
      </section>
      {act.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {explainError(act.error)}
        </p>
      ) : null}
    </div>
  );
}

const budgetSchema = z.object({ budget: z.number().min(1).max(1_000) });

function WatchmanBudget({
  budget,
  pending,
  onSave,
}: {
  budget: number;
  pending: boolean;
  onSave: (budget: number) => Promise<unknown>;
}) {
  const t = useTranslations('automations');
  const explainError = useUiErrorMessage();
  const form = useForm<z.infer<typeof budgetSchema>>({
    resolver: zodResolver(budgetSchema),
    defaultValues: { budget },
  });
  const { reset } = form;
  useEffect(() => reset({ budget }), [budget, reset]);
  return (
    <form
      className="space-y-2"
      onSubmit={form.handleSubmit(async (values) => {
        form.clearErrors('root');
        try {
          await onSave(values.budget);
        } catch (error) {
          form.setError('root', { message: explainError(error) });
        }
      })}
    >
      <Label htmlFor="watchman-model-budget">{t('team.monthlyBudget')}</Label>
      <div className="flex gap-2">
        <Input
          id="watchman-model-budget"
          type="number"
          min={1}
          max={1000}
          step={1}
          {...form.register('budget', { valueAsNumber: true })}
          aria-invalid={!!form.formState.errors.budget}
          disabled={pending || form.formState.isSubmitting}
        />
        <Button type="submit" variant="outline" disabled={pending || form.formState.isSubmitting}>
          {t('team.saveBudget')}
        </Button>
      </div>
      {form.formState.errors.budget ? (
        <p className="text-xs text-destructive">{t('team.checkOptions')}</p>
      ) : null}
      {form.formState.errors.root ? (
        <p role="alert" className="text-xs text-destructive">
          {form.formState.errors.root.message}
        </p>
      ) : null}
    </form>
  );
}
