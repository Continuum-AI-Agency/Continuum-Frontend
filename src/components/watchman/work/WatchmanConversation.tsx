'use client';

import type {
  WatchmanConversationEvent,
  WatchmanConversationView,
  WatchmanUiAction,
  WatchmanUiMessage,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUiErrorMessage } from '@/i18n/errors';
import { ApiError } from '@/lib/api/errors';
import { interactWatchman, watchmanQueryKeys, watchmanReads } from '@/lib/watchman/api';
import {
  clearWatchmanReadData,
  watchmanAccessDenied,
  watchmanReadIsTransient,
} from '../readAccess';
import { conversationAction } from './conversationAction';
import { groupMarks } from './timeline';
import { WatchmanCard, watchmanActionKey } from './WatchmanCards';

const replySchema = z.object({ message: z.string().trim().min(1).max(8_000) });

export function WatchmanConversation({
  brandId,
  watchmanId,
  conversationId,
  canManage,
  currentActions,
}: {
  brandId: string;
  watchmanId: string;
  conversationId: string;
  canManage: boolean;
  currentActions: ReadonlySet<string>;
}) {
  const t = useTranslations('automations');
  const locale = useLocale();
  const explainError = useUiErrorMessage();
  const client = useQueryClient();
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const key = [...watchmanQueryKeys.part(brandId, 'conversation', watchmanId), conversationId];
  const history = useQuery({
    queryKey: key,
    queryFn: async (): Promise<WatchmanConversationView> => {
      try {
        return await watchmanReads.conversation(brandId, watchmanId, conversationId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404)
          return {
            conversation_id: conversationId,
            watchman_id: watchmanId,
            version: 0,
            events: [],
            messages: [],
          };
        throw error;
      }
    },
    refetchInterval: 15_000,
    retry: (count, error) => !watchmanAccessDenied(error) && count < 1,
  });
  const form = useForm<z.infer<typeof replySchema>>({
    resolver: zodResolver(replySchema),
    defaultValues: { message: '' },
  });
  const send = useMutation({
    mutationFn: async (payload: { message: string } | { action: WatchmanUiAction }) => {
      const fingerprint = JSON.stringify({ conversationId, payload });
      if (request.current?.fingerprint !== fingerprint)
        request.current = { fingerprint, id: crypto.randomUUID() };
      return interactWatchman({
        brand_id: brandId,
        watchman_id: watchmanId,
        conversation_id: conversationId,
        request_id: request.current.id,
        ...payload,
      });
    },
    onSuccess: async (message: WatchmanUiMessage) => {
      request.current = null;
      client.setQueryData<WatchmanConversationView>(key, (prior) =>
        prior
          ? {
              ...prior,
              messages: [...prior.messages.filter((row) => row.id !== message.id), message].sort(
                (a, b) => a.sequence - b.sequence,
              ),
            }
          : prior,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: watchmanQueryKeys.part(brandId, 'dashboard') }),
      ]);
    },
  });
  const accessDenied = watchmanAccessDenied(history.error);
  useEffect(() => {
    if (accessDenied)
      clearWatchmanReadData(client, [
        ...watchmanQueryKeys.part(brandId, 'conversation', watchmanId),
        conversationId,
      ]);
  }, [accessDenied, brandId, client, conversationId, watchmanId]);
  const showHistory = !accessDenied && (!history.isError || watchmanReadIsTransient(history.error));
  const canInteract = canManage && !accessDenied && !history.isPending && showHistory;
  const submit = form.handleSubmit(async ({ message }) => {
    try {
      await send.mutateAsync({ message });
      form.reset();
    } catch {
      /* The mutation's visible error preserves the input for retry. */
    }
  });
  const events = showHistory ? (history.data?.events ?? []) : [];
  const messages = showHistory ? (history.data?.messages ?? []) : [];
  const personMessages = events.filter(
    (event): event is Extract<WatchmanConversationEvent, { type: 'message' }> =>
      event.type === 'message' && event.actor === 'person',
  );
  const personText = (text: string): string => {
    const action = conversationAction(text);
    if (action?.type === 'open_work') return t('team.actionOpenedWork');
    if (action?.type === 'resolve_question') return action.value;
    if (action?.type === 'decide_approval')
      return t(action.decision === 'approve' ? 'team.actionApproved' : 'team.actionRejected');
    return text;
  };
  const marks = groupMarks(
    personMessages.map((event) => ({
      seq: event.sequence,
      at: event.created_at,
      text: personText(event.text),
    })),
  );
  const cardSequences = new Set(messages.map((message) => message.sequence));
  const content = [
    ...events
      .filter(
        (event) =>
          event.type !== 'message' ||
          event.actor === 'person' ||
          !cardSequences.has(event.sequence),
      )
      .map((event) => ({ kind: 'event' as const, sequence: event.sequence, event })),
    ...messages.map((message) => ({ kind: 'ui' as const, sequence: message.sequence, message })),
  ].sort((a, b) => a.sequence - b.sequence);
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={t('team.conversation')}>
      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-[var(--card-pad)]"
        aria-live="polite"
        aria-busy={history.isPending}
      >
        {history.isPending ? (
          <p className="text-xs text-muted-foreground">{t('team.loading')}</p>
        ) : null}
        {history.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-destructive">{explainError(history.error)}</p>
            <Button variant="outline" onClick={() => void history.refetch()}>
              {t('team.retry')}
            </Button>
          </div>
        ) : null}
        {!history.isPending && !history.isError && !content.length ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {t('team.conversationEmpty')}
          </p>
        ) : null}
        {marks.length > 10 ? (
          <nav aria-label={t('team.conversationHistory')} className="flex flex-wrap gap-2">
            {marks.map((mark) => (
              <a
                key={mark.seq}
                href={`#watchman-message-${mark.seq}`}
                className="max-w-40 truncate text-xs text-muted-foreground underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
              >
                {mark.text}
              </a>
            ))}
          </nav>
        ) : null}
        {content.map((item) =>
          item.kind === 'event' ? (
            <article
              id={`watchman-message-${item.sequence}`}
              key={item.event.id}
              className="space-y-1 border-b border-border pb-4"
            >
              <p className="text-xs text-muted-foreground">
                {t(
                  item.event.type === 'message' && item.event.actor === 'person'
                    ? 'team.you'
                    : 'team.teammate',
                )}{' '}
                · {new Date(item.event.created_at).toLocaleString(locale)}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {item.event.type === 'message'
                  ? item.event.actor === 'person'
                    ? personText(item.event.text)
                    : item.event.text
                  : item.event.type === 'question'
                    ? item.event.question
                    : item.event.type === 'decision'
                      ? item.event.value
                      : item.event.type === 'handoff'
                        ? item.event.handoff.objective
                        : t(`team.operationStatus.${item.event.receipt.status}`)}
              </p>
            </article>
          ) : (
            <article key={item.message.id} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {t('team.teammate')} · {new Date(item.message.created_at).toLocaleString(locale)}
              </p>
              {item.message.blocks.map((block) => (
                <WatchmanCard
                  key={block.id}
                  block={block}
                  canManage={
                    canInteract &&
                    !send.isPending &&
                    (watchmanActionKey(block) === null ||
                      currentActions.has(watchmanActionKey(block) ?? ''))
                  }
                  onAction={(action) => send.mutateAsync({ action })}
                />
              ))}
            </article>
          ),
        )}
      </div>
      <form
        onSubmit={submit}
        className="shrink-0 space-y-2 border-t border-border p-[var(--card-pad)]"
      >
        <Label htmlFor={`reply-${watchmanId}`}>{t('team.replyLabel')}</Label>
        <Textarea
          id={`reply-${watchmanId}`}
          {...form.register('message')}
          rows={3}
          placeholder={t('team.replyPlaceholder')}
          disabled={!canInteract || send.isPending}
          aria-invalid={!!form.formState.errors.message}
        />
        {form.formState.errors.message ? (
          <p className="text-xs text-destructive">{t('team.briefRequired')}</p>
        ) : null}
        {send.isError ? (
          <p role="alert" className="text-xs text-destructive">
            {explainError(send.error)}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t('team.replyBoundary')}</p>
          <Button
            type="submit"
            disabled={!canInteract || send.isPending}
            aria-busy={send.isPending}
          >
            <Send className="size-3.5" aria-hidden="true" />
            {t(send.isPending ? 'team.sending' : 'team.sendReply')}
          </Button>
        </div>
      </form>
    </section>
  );
}
