'use client';

import {
  WATCHMAN_ROLES,
  type WatchmanCreateInput,
  type WatchmanRole,
  watchmanCreateInputSchema,
  watchmanCreateResultSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ChartNoAxesCombined,
  Check,
  Feather,
  Flag,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Panel } from '@/components/shared/Panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUiErrorMessage } from '@/i18n/errors';
import { ApiError } from '@/lib/api/errors';
import { manageWatchman, watchmanQueryKeys, watchmanReads } from '@/lib/watchman/api';

const roleIcons = { content: Feather, performance: ChartNoAxesCombined, gtm: Flag, lead: Users };

export function WatchmanSetup({
  brandId,
  onComplete,
  onCancel,
  onRequestStarted,
}: {
  brandId: string;
  existingKinds?: string[];
  onComplete: (id: string) => void;
  onCancel?: () => void;
  onRequestStarted?: (requestId: string) => void;
}) {
  const t = useTranslations('automations');
  const explainError = useUiErrorMessage();
  const client = useQueryClient();
  const [step, setStep] = useState<'role' | 'brief'>('role');
  const [role, setRole] = useState<WatchmanRole>('content');
  const [resumeId, setResumeId] = useState<string>();
  const form = useForm<WatchmanCreateInput>({
    resolver: zodResolver(watchmanCreateInputSchema),
    defaultValues: {
      request_id: crypto.randomUUID(),
      kind: 'organic',
      role: 'content',
      name: '',
      instructions: '',
      first_assignment: '',
      timezone: 'UTC',
      budget_usd_month: 25,
    },
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prior = z.string().uuid().safeParse(params.get('setupRequest'));
    const requestId = prior.success ? prior.data : form.getValues('request_id');
    form.setValue('request_id', requestId);
    if (prior.success) setResumeId(prior.data);
    form.setValue('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    params.set('setupRequest', requestId);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    onRequestStarted?.(requestId);
  }, [form, onRequestStarted]);
  const resume = useQuery({
    queryKey: watchmanQueryKeys.part(brandId, 'setup', resumeId),
    enabled: !!resumeId,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      try {
        return await watchmanReads.setup(brandId, resumeId ?? '');
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
  useEffect(() => {
    if (!resume.data) return;
    form.reset(resume.data.input);
    setRole(
      resume.data.input.role ?? (resume.data.input.kind === 'paid' ? 'performance' : 'content'),
    );
    setStep('brief');
  }, [resume.data, form]);
  const restoring = !!resumeId && resume.isPending;
  const immutable = !!resume.data;
  const create = useMutation({
    mutationFn: (input: WatchmanCreateInput) =>
      manageWatchman(brandId, { action: 'create', create: input }, watchmanCreateResultSchema),
    onSuccess: async (out) => {
      await client.invalidateQueries({ queryKey: watchmanQueryKeys.all(brandId) });
      if (out.setup.status === 'failed' || !out.setup.watchman_id) {
        form.setError('root', { message: out.setup.error ?? t('team.setupBlocked') });
        return;
      }
      const params = new URLSearchParams(window.location.search);
      params.delete('setupRequest');
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
      onComplete(out.setup.watchman_id);
    },
    onError: (error) => form.setError('root', { message: explainError(error) }),
  });
  const next = () => {
    form.setValue('role', role);
    form.setValue('kind', role === 'performance' ? 'paid' : 'organic');
    form.setValue('name', t(`team.${role}Name`));
    form.setValue('instructions', t(`team.${role}Brief`));
    form.setValue('first_assignment', t(`team.${role}FirstTask`));
    setStep('brief');
  };
  if (restoring || resume.isError)
    return (
      <Panel title={t('team.addTeammate')} bodyClassName="space-y-3">
        <p role={resume.isError ? 'alert' : 'status'} className="text-sm text-muted-foreground">
          {t(resume.isError ? 'team.setupReadFailed' : 'team.loadingSetup')}
        </p>
        {resume.isError ? (
          <Button variant="outline" onClick={() => void resume.refetch()}>
            {t('team.retry')}
          </Button>
        ) : null}
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            {t('cancel_19766ed')}
          </Button>
        ) : null}
      </Panel>
    );
  return (
    <Panel
      title={t('team.addTeammate')}
      className="mx-auto w-full max-w-3xl"
      bodyClassName="space-y-5"
    >
      <div>
        <p className="text-sm font-medium">
          {t(step === 'role' ? 'team.chooseRole' : 'team.giveBrief')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(step === 'role' ? 'team.chooseRoleDescription' : 'team.giveBriefDescription')}
        </p>
      </div>
      {step === 'role' ? (
        <>
          <div className="divide-y divide-border">
            {WATCHMAN_ROLES.map((item) => {
              const Icon = roleIcons[item];
              return (
                <Button
                  key={item}
                  variant="ghost"
                  aria-pressed={role === item}
                  className="h-auto w-full justify-start gap-3 rounded-none py-4 text-left whitespace-normal"
                  onClick={() => setRole(item)}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t(`team.${item}Role`)}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {t(`team.${item}Description`)}
                    </span>
                  </span>
                  {role === item ? (
                    <Check className="size-4 text-primary" aria-hidden="true" />
                  ) : null}
                </Button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3">
            {onCancel ? (
              <Button variant="ghost" onClick={onCancel}>
                {t('cancel_19766ed')}
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={next}>
              {t('team.continue')}
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={form.handleSubmit((values) => create.mutate(values))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="teammate-name">{t('team.name')}</Label>
            <Input
              id="teammate-name"
              {...form.register('name')}
              readOnly={immutable}
              aria-invalid={!!form.formState.errors.name}
              aria-describedby="teammate-name-error"
            />
            {form.formState.errors.name ? (
              <p id="teammate-name-error" className="text-xs text-destructive">
                {t('team.nameRequired')}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teammate-brief">{t('team.brief')}</Label>
            <Textarea
              id="teammate-brief"
              rows={3}
              {...form.register('instructions')}
              readOnly={immutable}
              aria-invalid={!!form.formState.errors.instructions}
              aria-describedby="teammate-brief-error"
            />
            {form.formState.errors.instructions ? (
              <p id="teammate-brief-error" className="text-xs text-destructive">
                {t('team.briefRequired')}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teammate-first-work">{t('team.firstAssignment')}</Label>
            <Textarea
              id="teammate-first-work"
              rows={2}
              {...form.register('first_assignment')}
              readOnly={immutable}
              aria-invalid={!!form.formState.errors.first_assignment}
            />
            {form.formState.errors.first_assignment ? (
              <p className="text-xs text-destructive">{t('team.briefRequired')}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">{t('team.firstAssignmentDescription')}</p>
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{t('team.safeStart')}</p>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer py-2 font-medium focus-visible:outline-ring">
              {t('team.moreOptions')}
            </summary>
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="teammate-timezone">{t('timezone_4ceca1d')}</Label>
                <Input
                  id="teammate-timezone"
                  {...form.register('timezone')}
                  readOnly={immutable}
                  aria-invalid={!!form.formState.errors.timezone}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="teammate-budget">{t('team.monthlyBudget')}</Label>
                <Input
                  id="teammate-budget"
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  {...form.register('budget_usd_month', { valueAsNumber: true })}
                  readOnly={immutable}
                  aria-invalid={!!form.formState.errors.budget_usd_month}
                />
              </div>
            </div>
            {form.formState.errors.timezone || form.formState.errors.budget_usd_month ? (
              <p className="text-destructive">{t('team.checkOptions')}</p>
            ) : null}
          </details>
          {create.data?.setup ? (
            <p className="text-xs text-muted-foreground">
              {t('team.setupStages', { count: create.data.setup.completed_stages.length })}
            </p>
          ) : null}
          {form.formState.errors.root ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              {!immutable ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={create.isPending || restoring || resume.isError}
                  onClick={() => setStep('role')}
                >
                  <ArrowLeft aria-hidden="true" />
                  {t('team.back')}
                </Button>
              ) : (
                <span />
              )}
              {onCancel ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={create.isPending}
                  onClick={onCancel}
                >
                  {t('cancel_19766ed')}
                </Button>
              ) : null}
            </div>
            <Button
              type="submit"
              disabled={create.isPending || restoring || resume.isError}
              aria-busy={create.isPending}
            >
              {t(create.isPending ? 'team.creating' : 'team.createTeammate')}
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
