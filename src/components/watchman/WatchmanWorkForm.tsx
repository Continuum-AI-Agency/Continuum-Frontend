'use client';

import type { WatchmanManageInput, WatchmanTaskInput } from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useUiErrorMessage } from '@/i18n/errors';

const workSchema = z.object({
  instruction: z.string().trim().min(1).max(2_000),
  timing: z.enum(['now', 'weekly', 'daily']),
  email: z.union([z.literal(''), z.string().email()]),
});
type WorkInput = z.infer<typeof workSchema>;

export function WatchmanWorkForm({
  active,
  pending,
  submit,
  onClose,
}: {
  active: boolean;
  pending: boolean;
  submit: (input: WatchmanManageInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const t = useTranslations('automations');
  const explainError = useUiErrorMessage();
  const form = useForm<WorkInput>({
    resolver: zodResolver(workSchema),
    defaultValues: { instruction: '', timing: 'now', email: '' },
  });
  const timing = form.watch('timing');
  const busy = pending || form.formState.isSubmitting;
  const save = async (values: WorkInput) => {
    form.clearErrors('root');
    const task: WatchmanTaskInput = {
      title: values.instruction.slice(0, 120),
      instruction: values.instruction,
      condition: { type: 'schedule', cron: values.timing === 'weekly' ? '0 9 * * 1' : '0 9 * * *' },
      deliver: { emails: values.email ? [values.email] : [], member_user_ids: [] },
      review: true,
    };
    try {
      await submit(
        values.timing === 'now'
          ? { action: 'wake', reason: values.instruction }
          : { action: 'task_add', task },
      );
      onClose();
    } catch (error) {
      form.setError('root', { message: explainError(error) });
    }
  };
  return (
    <form
      className="space-y-3 border-y border-border p-[var(--card-pad)]"
      onSubmit={form.handleSubmit(save)}
    >
      <div className="space-y-1.5">
        <Label htmlFor="teammate-work">{t('team.whatToDo')}</Label>
        <Textarea
          id="teammate-work"
          rows={3}
          maxLength={2_000}
          {...form.register('instruction')}
          aria-invalid={!!form.formState.errors.instruction}
          aria-describedby="teammate-work-error"
          placeholder={t('team.workExample')}
        />
        {form.formState.errors.instruction ? (
          <p id="teammate-work-error" className="text-xs text-destructive">
            {t('team.briefRequired')}
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="teammate-timing">{t('team.when')}</Label>
          <Select
            value={timing}
            onValueChange={(value) => {
              if (value === 'now' || value === 'daily' || value === 'weekly')
                form.setValue('timing', value, { shouldValidate: true });
            }}
          >
            <SelectTrigger id="teammate-timing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="now">{t('team.now')}</SelectItem>
              <SelectItem value="weekly">{t('team.everyMonday')}</SelectItem>
              <SelectItem value="daily">{t('team.everyDay')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {timing !== 'now' ? (
          <div className="space-y-1.5">
            <Label htmlFor="teammate-email">{t('team.reportRecipient')}</Label>
            <Input
              id="teammate-email"
              type="email"
              {...form.register('email')}
              aria-invalid={!!form.formState.errors.email}
            />
            <p className="text-xs text-muted-foreground">{t('team.optionalEmail')}</p>
            {form.formState.errors.email ? (
              <p className="text-xs text-destructive">{t('team.emailRequired')}</p>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          timing === 'now'
            ? active
              ? 'team.queuedNotice'
              : 'team.waitingNotice'
            : 'team.recurringNotice',
        )}
      </p>
      {form.formState.errors.root ? (
        <p role="alert" className="text-sm text-destructive">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {t('cancel_19766ed')}
        </Button>
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {t(timing === 'now' ? 'team.sendWork' : 'team.saveResponsibility')}
        </Button>
      </div>
    </form>
  );
}
