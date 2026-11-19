'use client';

import {
  WATCHMAN_AUTONOMY_CLASSES,
  WATCHMAN_AUTONOMY_LEVELS,
  type WatchmanAutonomyClass,
  type WatchmanAutonomyLevel,
  type WatchmanManageInput,
  type WatchmanProposalView,
  type WatchmanStatusView,
  type WatchmanWakeView,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast-imperative';
import { useUiErrorMessage } from '@/i18n/errors';
import { ApiError } from '@/lib/api/errors';
import { manageWatchman, watchmanQueryKeys, watchmanReads } from '@/lib/watchman/api';

type AutomationsText = ReturnType<typeof useTranslations<'automations'>>;

function classLabel(
  uiText: AutomationsText,
): Record<WatchmanAutonomyClass, { title: string; detail: string }> {
  return {
    generate: {
      title: uiText('generate_49e49bb'),
      detail: uiText('run_published_pipelines_to_make_new_content_4812fa1'),
    },
    render: {
      title: uiText('render_6d89eb7'),
      detail: uiText('re_render_forge_card_sets_15b9643'),
    },
    publish: {
      title: uiText('publish_859390e'),
      detail: uiText('schedule_dated_drafts_at_approve_your_approva_130364e'),
    },
  };
}

function levelLabel(uiText: AutomationsText): Record<WatchmanAutonomyLevel, string> {
  return {
    off: uiText('off_ca7981b'),
    approve: uiText('ask_me_first_c9278e8'),
    auto: uiText('on_its_own_42e696a'),
  };
}

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const when = (iso: string | null, locale: string) =>
  iso ? new Date(iso).toLocaleString(locale) : '—';

function isNotAdmin(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export function WatchmanOperator({ brandId }: { brandId: string }) {
  const uiText = useTranslations('automations');
  const getUiErrorMessage = useUiErrorMessage();
  const status = useQuery({
    queryKey: watchmanQueryKeys.part(brandId, 'status'),
    queryFn: () => watchmanReads.status(brandId),
    retry: (count, error) => !isNotAdmin(error) && count < 2,
  });

  if (status.isPending) {
    return <p className="text-sm text-muted-foreground">{uiText('loading_ba3bbbe')}</p>;
  }
  if (status.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {isNotAdmin(status.error)
              ? uiText('brand_admins_only_1d70d11')
              : uiText('could_not_load_the_watchman_9c50c68')}
          </CardTitle>
          <CardDescription>
            {isNotAdmin(status.error)
              ? uiText('ask_a_brand_owner_or_admin_to_manage_the_watc_3d688bb')
              : getUiErrorMessage(status.error)}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const [watchman] = status.data.watchmen;
  if (!watchman) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{uiText('no_watchman_yet_507f569')}</CardTitle>
          <CardDescription>
            {uiText('this_brand_has_no_watchman_continuum_provisio_447fd8c')}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <WatchmanPanels brandId={brandId} watchman={watchman} />;
}

function WatchmanPanels({ brandId, watchman }: { brandId: string; watchman: WatchmanStatusView }) {
  const uiText = useTranslations('automations');
  const getUiErrorMessage = useUiErrorMessage();
  const classes = classLabel(uiText);
  const levels = levelLabel(uiText);
  const queryClient = useQueryClient();
  const act = useMutation({
    mutationFn: (input: WatchmanManageInput) =>
      manageWatchman(brandId, { ...input, watchman_id: watchman.id }, z.unknown()),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: watchmanQueryKeys.all(brandId),
      }),
    onError: (error) =>
      toast.error(uiText('that_did_not_go_through_e074b86'), {
        description: getUiErrorMessage(error),
      }),
  });
  const active = watchman.status === 'active';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              {watchman.name}
              <Badge variant={active ? 'success' : 'secondary'}>
                {active ? uiText('active_9234069') : uiText('paused_e159b06')}
              </Badge>
            </CardTitle>
            <CardDescription>
              {uiText('kind_select_organic_organic_other_paid_timezo_f21e769', {
                kind: watchman.kind,
                timezone: watchman.timezone,
                spent: usd(watchman.budget.month_spend_usd),
                budget: usd(watchman.budget.budget_usd),
                tasks: watchman.active_tasks,
                failures: watchman.failures_24h,
              })}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!active || act.isPending}
              onClick={() => act.mutate({ action: 'wake', reason: 'Requested from the app' })}
            >
              {uiText('wake_now_b14d667')}
            </Button>
            <Button
              size="sm"
              variant={active ? 'outline' : 'default'}
              disabled={act.isPending}
              onClick={() =>
                act.mutate({
                  action: 'configure',
                  configure: { status: active ? 'paused' : 'active' },
                })
              }
            >
              {active ? uiText('pause_858e4ba') : uiText('activate_24433c7')}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{uiText('what_it_may_do_beyond_drafts_064e19e')}</CardTitle>
          <CardDescription>
            {uiText('off_by_default_ask_me_first_sends_each_action_cc2131e')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {WATCHMAN_AUTONOMY_CLASSES.map((cls) => (
            <div key={cls} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{classes[cls].title}</p>
                <p className="text-xs text-muted-foreground">{classes[cls].detail}</p>
              </div>
              <Select
                value={watchman.autonomy[cls] ?? 'off'}
                disabled={act.isPending}
                onValueChange={(level: WatchmanAutonomyLevel) =>
                  act.mutate({
                    action: 'configure',
                    configure: { autonomy: { [cls]: level } },
                  })
                }
              >
                <SelectTrigger
                  className="w-40"
                  aria-label={uiText('autonomyclass_select_generate_generate_autono_a604612', {
                    autonomyClass: cls,
                  })}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WATCHMAN_AUTONOMY_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {levels[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <Proposals brandId={brandId} watchmanId={watchman.id} act={act} />
      <Reports brandId={brandId} watchmanId={watchman.id} act={act} />
      <Tasks brandId={brandId} watchmanId={watchman.id} act={act} />
      <Timeline brandId={brandId} watchmanId={watchman.id} />
    </div>
  );
}

type Act = { mutate: (input: WatchmanManageInput) => void; isPending: boolean };
type PanelProps = { brandId: string; watchmanId: string; act: Act };

function Proposals({ brandId, watchmanId, act }: PanelProps) {
  const { data } = useQuery({
    queryKey: watchmanQueryKeys.part(brandId, 'proposals', watchmanId),
    queryFn: () => watchmanReads.proposals(brandId, watchmanId),
  });
  const uiText = useTranslations('automations');
  const proposals = data?.proposals ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{uiText('waiting_for_your_approval_af7a94b')}</CardTitle>
        <CardDescription>
          {uiText('the_exact_call_it_wants_to_make_approving_wak_1d1fffb')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{uiText('nothing_waiting_a05adbb')}</p>
        ) : (
          proposals.map((p) => <ProposalRow key={p.id} proposal={p} act={act} />)
        )}
      </CardContent>
    </Card>
  );
}

function ProposalRow({ proposal, act }: { proposal: WatchmanProposalView; act: Act }) {
  const uiText = useTranslations('automations');
  const locale = useLocale();
  const decide = (decision: 'approve' | 'reject') =>
    act.mutate({
      action: 'proposal_decide',
      proposal_id: proposal.id,
      decision,
    });
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            <Badge variant="outline" className="mr-2">
              {classLabel(uiText)[proposal.kind].title}
            </Badge>
            {proposal.summary}
          </p>
          <p className="text-xs text-muted-foreground">
            {uiText('tool_asked_asked_expires_expires_12c6d0f', {
              tool: proposal.tool,
              asked: when(proposal.created_at, locale),
              expires: when(proposal.expires_at, locale),
            })}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={act.isPending}
            onClick={() => decide('reject')}
          >
            {uiText('reject_ab604a3')}
          </Button>
          <Button size="sm" disabled={act.isPending} onClick={() => decide('approve')}>
            {uiText('approve_6007acb')}
          </Button>
        </div>
      </div>
      <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
        {JSON.stringify(proposal.input, null, 2)}
      </pre>
    </div>
  );
}

function Reports({ brandId, watchmanId, act }: PanelProps) {
  const { data } = useQuery({
    queryKey: watchmanQueryKeys.part(brandId, 'reports', watchmanId),
    queryFn: () => watchmanReads.reports(brandId, watchmanId),
  });
  const uiText = useTranslations('automations');
  const reports = data?.reports ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{uiText('reports_held_for_review_d907daf')}</CardTitle>
        <CardDescription>
          {uiText('nothing_reaches_a_client_until_you_release_it_9366b9d')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">{uiText('no_held_reports_0d231de')}</p>
        ) : (
          reports.map((r) => (
            <details key={r.id} className="rounded-lg border p-3">
              <summary className="flex cursor-pointer items-center justify-between gap-4">
                <span className="text-sm font-medium">
                  {r.subject}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {uiText('hastask_select_yes_task_other_no_task_to_hasr_04dbbbc', {
                      hasTask: r.task_title ? 'yes' : 'no',
                      task: r.task_title ?? '',
                      hasRecipients: r.recipients.length > 0 ? 'yes' : 'no',
                      recipients: r.recipients.map((x) => x.email).join(', '),
                    })}
                  </span>
                </span>
                <Button
                  size="sm"
                  disabled={act.isPending}
                  onClick={(event) => {
                    // A button in a summary would also toggle it; and a release emails clients.
                    event.preventDefault();
                    const to = r.recipients.length;
                    if (
                      window.confirm(
                        uiText('send_subject_to_count_plural_one_recipient_ot_a9b317c', {
                          subject: r.subject,
                          count: to,
                        }),
                      )
                    )
                      act.mutate({ action: 'report_release', report_id: r.id });
                  }}
                >
                  {uiText('release_e020e3c')}
                </Button>
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-sm">{r.body_md}</pre>
            </details>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Tasks({ brandId, watchmanId, act }: PanelProps) {
  const { data } = useQuery({
    queryKey: watchmanQueryKeys.part(brandId, 'tasks', watchmanId),
    queryFn: () => watchmanReads.tasks(brandId, watchmanId),
  });
  const uiText = useTranslations('automations');
  const locale = useLocale();
  const tasks = data?.tasks ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{uiText('standing_tasks_b137451')}</CardTitle>
        <CardDescription>
          {uiText('add_tasks_by_asking_continuum_in_chat_or_over_6ce317f')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{uiText('no_tasks_2d01772')}</p>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-start justify-between gap-4 rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {uiText('condition_last_ran_lastran_count_plural_one_r_04f382f', {
                    condition: t.condition.type,
                    lastRan: when(t.last_fired_at, locale),
                    count: t.recipients.length,
                    review: t.review ? 'yes' : 'no',
                  })}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: 'task_remove', task_id: t.id })}
              >
                {uiText('remove_c3812fc')}
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Timeline({ brandId, watchmanId }: { brandId: string; watchmanId: string }) {
  const { data } = useQuery({
    queryKey: watchmanQueryKeys.part(brandId, 'wakes', watchmanId),
    queryFn: () => watchmanReads.wakes(brandId, watchmanId),
  });
  const uiText = useTranslations('automations');
  const wakes = data?.wakes ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{uiText('recent_wakes_0fd8e40')}</CardTitle>
        <CardDescription>
          {uiText('why_it_woke_what_it_called_what_it_cost_fbf8fab')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {wakes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{uiText('it_has_not_woken_yet_56bd076')}</p>
        ) : (
          wakes.map((w) => <WakeRow key={w.id} wake={w} />)
        )}
      </CardContent>
    </Card>
  );
}

function WakeRow({ wake }: { wake: WatchmanWakeView }) {
  const uiText = useTranslations('automations');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const failed = wake.status === 'failed';
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 p-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm">
          <Badge variant={failed ? 'destructive' : 'secondary'} className="mr-2">
            {wake.status}
          </Badge>
          {wake.reason}
          <span className="ml-2 text-xs text-muted-foreground">
            {when(wake.created_at, locale)}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {uiText('calls_plural_one_call_other_calls_cost_haswal_d1cd1ec', {
            calls: wake.tool_calls.length,
            cost: usd(wake.cost_usd),
            hasWall: wake.wall_ms !== null ? 'yes' : 'no',
            seconds: wake.wall_ms !== null ? (wake.wall_ms / 1000).toFixed(1) : '',
          })}
        </span>
      </button>
      {open ? (
        <div className="space-y-1 border-t p-3 text-xs">
          {wake.error ? <p className="text-destructive">{wake.error}</p> : null}
          {wake.note_to_self ? <p className="text-muted-foreground">{wake.note_to_self}</p> : null}
          {wake.tool_calls.map((c) => (
            <p key={`${c.at}-${c.tool}`} className="flex justify-between gap-4 font-mono">
              <span>
                {c.tool} {c.status === 'ok' ? '' : `· ${c.error_code ?? c.status}`}
              </span>
              <span className="text-muted-foreground">
                {c.duration_ms !== null
                  ? uiText('duration_ms_743886b', { duration: c.duration_ms })
                  : ''}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
