'use client';

import type { WatchmanUiAction, WatchmanUiBlock, WatchmanWork } from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ChangeSource } from '@ui-sdk/core';
import { Button as ActionButton } from '@ui-sdk/react/button';
import { ArrowUpRight, FileCheck, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Pill } from '@/components/kibo-ui/pill';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { useUiErrorMessage } from '@/i18n/errors';

export const isHumanActionSource = (source: ChangeSource) =>
  source !== 'agent' && source !== 'programmatic';

export const watchmanActionKey = (block: WatchmanUiBlock): string | null =>
  block.type === 'approval'
    ? `approval:${block.operation_id}:${block.version}`
    : block.type === 'question'
      ? `question:${block.request_id}:${block.version}`
      : null;

const answerSchema = z.object({ answer: z.string().trim().min(1).max(4_000) });
type CardProps = {
  block: WatchmanUiBlock;
  canManage: boolean;
  onAction: (action: WatchmanUiAction) => Promise<unknown>;
};

export function WatchmanWorkRow({
  work,
  onOpen,
  disabled = false,
}: {
  work: WatchmanWork;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations('automations');
  const repeatedObjective = work.objective.trim().startsWith(work.title.trim());
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className="flex w-full items-start justify-between gap-3 border-b border-border px-[var(--card-pad)] py-3 text-left outline-none last:border-b-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm font-medium leading-relaxed" title={work.title}>
          {work.title}
        </span>
        {!repeatedObjective ? (
          <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {work.objective}
          </span>
        ) : null}
      </span>
      <Pill className="shrink-0">{t(`team.workStatus.${work.status}`)}</Pill>
    </button>
  );
}

function QuestionCard({
  block,
  canManage,
  onAction,
}: CardProps & { block: Extract<WatchmanUiBlock, { type: 'question' }> }) {
  const t = useTranslations('automations');
  const explainError = useUiErrorMessage();
  const [error, setError] = useState<string>();
  const form = useForm<z.infer<typeof answerSchema>>({
    resolver: zodResolver(answerSchema),
    defaultValues: { answer: '' },
  });
  const answer = async (value: string, source: ChangeSource) => {
    setError(undefined);
    if (!isHumanActionSource(source)) {
      const message = t('team.humanOnly');
      setError(message);
      throw new Error(message);
    }
    try {
      await onAction({
        type: 'resolve_question',
        request_id: block.request_id,
        expected_version: block.version,
        value,
      });
    } catch (cause) {
      setError(explainError(cause));
    }
  };
  return (
    <section className="space-y-3 border-y border-border py-4" aria-label={t('team.question')}>
      <p className="text-sm font-medium">{block.question}</p>
      {block.options.length ? (
        <div className="flex flex-wrap gap-2">
          {block.options.map((option) => (
            <ActionButton
              key={option.value}
              className={buttonVariants({ variant: 'outline' })}
              disabled={!canManage}
              data-agent-confirm={t('team.humanOnly')}
              pendingAnnouncement={t('team.sending')}
              onClick={(_event, { source }) => answer(option.value, source)}
            >
              {option.label}
            </ActionButton>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(event) => event.preventDefault()}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`answer-${block.id}`}>{t('team.answer')}</Label>
            <Input
              id={`answer-${block.id}`}
              {...form.register('answer')}
              aria-invalid={!!form.formState.errors.answer}
              disabled={!canManage}
            />
          </div>
          <ActionButton
            className={buttonVariants()}
            disabled={!canManage}
            data-agent-confirm={t('team.humanOnly')}
            pendingAnnouncement={t('team.sending')}
            onClick={(_event, { source }) =>
              form.handleSubmit(({ answer: value }) => answer(value, source))()
            }
          >
            {t('team.sendReply')}
          </ActionButton>
        </form>
      )}
      {form.formState.errors.answer ? (
        <p className="text-xs text-destructive">{t('team.answerRequired')}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function WatchmanCard({ block, canManage, onAction }: CardProps) {
  const t = useTranslations('automations');
  const locale = useLocale();
  const explainError = useUiErrorMessage();
  const [error, setError] = useState<string>();
  if (block.type === 'question')
    return <QuestionCard block={block} canManage={canManage} onAction={onAction} />;
  if (block.type === 'text')
    return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{block.text}</p>;
  if (block.type === 'work')
    return (
      <WatchmanWorkRow
        disabled={!canManage}
        work={block.work}
        onOpen={() => void onAction({ type: 'open_work', execution: block.work.execution })}
      />
    );
  if (block.type === 'report')
    return (
      <section className="space-y-3" aria-label={t('team.report')}>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          {block.title}
        </h3>
        <SafeMarkdown content={block.body_md} mode="static" className="text-sm" />
        <p className="text-xs text-muted-foreground">
          {t('team.evidenceCount', { count: block.evidence_ids.length })}
        </p>
      </section>
    );
  if (block.type === 'evidence') {
    const evidence = block.evidence;
    const value = new Intl.NumberFormat(
      locale,
      evidence.unit === 'currency' && evidence.currency
        ? { style: 'currency', currency: evidence.currency }
        : { maximumFractionDigits: 4 },
    ).format(evidence.value);
    return (
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-y border-border py-3 text-xs">
        <dt className="font-medium">{evidence.metric}</dt>
        <dd className="font-mono tabular-nums">
          {value}
          {evidence.unit === 'percent' ? '%' : ''}
        </dd>
        <dt className="text-muted-foreground">{t('team.source')}</dt>
        <dd className="break-all text-right">
          {evidence.provider} · {evidence.account_id}
        </dd>
        <dt className="text-muted-foreground">{t('team.period')}</dt>
        <dd className="text-right">
          {new Date(evidence.period.start).toLocaleDateString(locale)} –{' '}
          {new Date(evidence.period.end).toLocaleDateString(locale)}
        </dd>
      </dl>
    );
  }
  const expired = Date.parse(block.expires_at) <= Date.now();
  const decide = async (decision: 'approve' | 'reject', source: ChangeSource) => {
    setError(undefined);
    if (!isHumanActionSource(source)) {
      const message = t('team.humanOnly');
      setError(message);
      throw new Error(message);
    }
    try {
      await onAction({
        type: 'decide_approval',
        proposal_id: block.proposal_id,
        operation_id: block.operation_id,
        expected_version: block.version,
        decision,
      });
    } catch (cause) {
      setError(explainError(cause));
    }
  };
  return (
    <section className="space-y-3 border-y border-border py-4" aria-label={t('team.approval')}>
      <h3 className="flex items-start gap-2 text-sm font-medium">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {block.summary}
      </h3>
      <dl className="grid gap-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {block.facts.map((fact) => (
          <div key={`${fact.label}:${fact.value}`} className="contents">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="break-words">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        {t(expired ? 'team.approvalExpired' : 'team.expires', {
          date: new Date(block.expires_at).toLocaleString(locale),
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <ActionButton
          className={buttonVariants()}
          disabled={!canManage || expired}
          data-agent-confirm={t('team.humanOnly')}
          pendingAnnouncement={t('team.sending')}
          onClick={(_event, { source }) => decide('approve', source)}
        >
          {t('team.approve')}
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </ActionButton>
        <ActionButton
          className={buttonVariants({ variant: 'outline' })}
          disabled={!canManage || expired}
          data-agent-confirm={t('team.humanOnly')}
          pendingAnnouncement={t('team.sending')}
          onClick={(_event, { source }) => decide('reject', source)}
        >
          {t('team.reject')}
        </ActionButton>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
