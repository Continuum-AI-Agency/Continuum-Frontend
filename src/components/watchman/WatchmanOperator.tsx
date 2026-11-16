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
import { ApiError } from '@/lib/api/errors';
import { manageWatchman, watchmanQueryKeys, watchmanReads } from '@/lib/watchman/api';

const CLASS_LABEL: Record<WatchmanAutonomyClass, { title: string; detail: string }> = {
  generate: {
    title: 'Generate',
    detail: 'Run published pipelines to make new content.',
  },
  render: { title: 'Render', detail: 'Re-render Forge card sets.' },
  publish: {
    title: 'Publish',
    detail: 'Schedule dated drafts. At Approve, your approval schedules the draft as you.',
  },
};
const LEVEL_LABEL: Record<WatchmanAutonomyLevel, string> = {
  off: 'Off',
  approve: 'Ask me first',
  auto: 'On its own',
};

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

function isNotAdmin(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export function WatchmanOperator({ brandId }: { brandId: string }) {
  const status = useQuery({
    queryKey: watchmanQueryKeys.part(brandId, 'status'),
    queryFn: () => watchmanReads.status(brandId),
    retry: (count, error) => !isNotAdmin(error) && count < 2,
  });

  if (status.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (status.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {isNotAdmin(status.error) ? 'Brand admins only' : 'Could not load the Watchman'}
          </CardTitle>
          <CardDescription>
            {isNotAdmin(status.error)
              ? 'Ask a brand owner or admin to manage the Watchman.'
              : status.error.message}
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
          <CardTitle>No Watchman yet</CardTitle>
          <CardDescription>
            This brand has no Watchman. Continuum provisions one on request.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <WatchmanPanels brandId={brandId} watchman={watchman} />;
}

function WatchmanPanels({ brandId, watchman }: { brandId: string; watchman: WatchmanStatusView }) {
  const queryClient = useQueryClient();
  const act = useMutation({
    mutationFn: (input: WatchmanManageInput) =>
      manageWatchman(brandId, { ...input, watchman_id: watchman.id }, z.unknown()),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: watchmanQueryKeys.all(brandId),
      }),
    onError: (error) => toast.error('That did not go through', { description: error.message }),
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
                {active ? 'Active' : 'Paused'}
              </Badge>
            </CardTitle>
            <CardDescription>
              {watchman.kind === 'organic' ? 'Organic' : 'Paid'} · {watchman.timezone} ·{' '}
              {usd(watchman.budget.month_spend_usd)} of {usd(watchman.budget.budget_usd)} this month
              · {watchman.active_tasks} tasks · {watchman.failures_24h} failed wakes in 24 h
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!active || act.isPending}
              onClick={() => act.mutate({ action: 'wake', reason: 'Requested from the app' })}
            >
              Wake now
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
              {active ? 'Pause' : 'Activate'}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What it may do beyond drafts</CardTitle>
          <CardDescription>
            Off by default. “Ask me first” sends each action here for your approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {WATCHMAN_AUTONOMY_CLASSES.map((cls) => (
            <div key={cls} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{CLASS_LABEL[cls].title}</p>
                <p className="text-xs text-muted-foreground">{CLASS_LABEL[cls].detail}</p>
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
                <SelectTrigger className="w-40" aria-label={`${CLASS_LABEL[cls].title} autonomy`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WATCHMAN_AUTONOMY_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {LEVEL_LABEL[level]}
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
  const proposals = data?.proposals ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiting for your approval</CardTitle>
        <CardDescription>
          The exact call it wants to make. Approving wakes it to make that call once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          proposals.map((p) => <ProposalRow key={p.id} proposal={p} act={act} />)
        )}
      </CardContent>
    </Card>
  );
}

function ProposalRow({ proposal, act }: { proposal: WatchmanProposalView; act: Act }) {
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
              {CLASS_LABEL[proposal.kind].title}
            </Badge>
            {proposal.summary}
          </p>
          <p className="text-xs text-muted-foreground">
            {proposal.tool} · asked {when(proposal.created_at)} · expires{' '}
            {when(proposal.expires_at)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={act.isPending}
            onClick={() => decide('reject')}
          >
            Reject
          </Button>
          <Button size="sm" disabled={act.isPending} onClick={() => decide('approve')}>
            Approve
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
  const reports = data?.reports ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports held for review</CardTitle>
        <CardDescription>Nothing reaches a client until you release it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No held reports.</p>
        ) : (
          reports.map((r) => (
            <details key={r.id} className="rounded-lg border p-3">
              <summary className="flex cursor-pointer items-center justify-between gap-4">
                <span className="text-sm font-medium">
                  {r.subject}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.task_title ?? 'No task'} · to{' '}
                    {r.recipients.map((x) => x.email).join(', ') || 'nobody'}
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
                        `Send “${r.subject}” to ${to} recipient${to === 1 ? '' : 's'}?`,
                      )
                    )
                      act.mutate({ action: 'report_release', report_id: r.id });
                  }}
                >
                  Release
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
  const tasks = data?.tasks ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Standing tasks</CardTitle>
        <CardDescription>Add tasks by asking Continuum in chat or over MCP.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks.</p>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-start justify-between gap-4 rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t.condition.type} · last ran {when(t.last_fired_at)} · {t.recipients.length}{' '}
                  recipients
                  {t.review ? ' · held for review' : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: 'task_remove', task_id: t.id })}
              >
                Remove
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
  const wakes = data?.wakes ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent wakes</CardTitle>
        <CardDescription>Why it woke, what it called, what it cost.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {wakes.length === 0 ? (
          <p className="text-sm text-muted-foreground">It has not woken yet.</p>
        ) : (
          wakes.map((w) => <WakeRow key={w.id} wake={w} />)
        )}
      </CardContent>
    </Card>
  );
}

function WakeRow({ wake }: { wake: WatchmanWakeView }) {
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
          <span className="ml-2 text-xs text-muted-foreground">{when(wake.created_at)}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {wake.tool_calls.length} calls · {usd(wake.cost_usd)}
          {wake.wall_ms !== null ? ` · ${(wake.wall_ms / 1000).toFixed(1)} s` : ''}
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
                {c.duration_ms !== null ? `${c.duration_ms} ms` : ''}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
