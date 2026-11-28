'use client';

import {
  WATCHMAN_ROLES,
  type WatchmanAttentionItem,
  type WatchmanDashboard,
  type WatchmanDashboardTeammate,
  type WatchmanManageInput,
  type WatchmanUiAction,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Plus, RefreshCw, Search, Settings2, Users } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { PageHeader } from '@/components/shared/PageHeader';
import { Panel } from '@/components/shared/Panel';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUiErrorMessage } from '@/i18n/errors';
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import {
  interactWatchman,
  manageWatchman,
  watchmanQueryKeys,
  watchmanReads,
} from '@/lib/watchman/api';
import { filtersKey, filtersToRestore } from './dashboard/inboxFilters';
import { WatchmanReadiness } from './dashboard/WatchmanReadiness';
import { WatchmanSettings } from './dashboard/WatchmanSettings';
import { clearWatchmanReadData, watchmanAccessDenied } from './readAccess';
import { WatchmanSetup } from './WatchmanSetup';
import { WatchmanWorkForm } from './WatchmanWorkForm';
import { WatchmanCard, WatchmanWorkRow, watchmanActionKey } from './work/WatchmanCards';
import { WatchmanConversation } from './work/WatchmanConversation';

const generalConversation = (id: string) => `watchman:${id}`;
const tone = (lifecycle: WatchmanDashboardTeammate['lifecycle']) =>
  lifecycle === 'failed'
    ? 'error'
    : lifecycle === 'blocked' || lifecycle === 'waiting'
      ? 'warning'
      : lifecycle === 'paused'
        ? 'info'
        : 'success';

export function WatchmanOperator({ brandId }: { brandId: string }) {
  return <WatchmanWorkspace key={brandId} brandId={brandId} />;
}

function WatchmanWorkspace({ brandId }: { brandId: string }) {
  const t = useTranslations('automations');
  const explainError = useUiErrorMessage();
  const client = useQueryClient();
  const dashboard = useQuery({
    queryKey: watchmanQueryKeys.part(brandId, 'dashboard'),
    queryFn: () => watchmanReads.dashboard(brandId),
    refetchInterval: 15_000,
    retry: (count, error) =>
      !(error instanceof ApiError && [401, 403].includes(error.status)) && count < 1,
  });
  const accessDenied = watchmanAccessDenied(dashboard.error);
  useEffect(() => {
    if (accessDenied) clearWatchmanReadData(client, watchmanQueryKeys.all(brandId));
  }, [accessDenied, brandId, client]);
  if (dashboard.isPending)
    return (
      <div className="p-[var(--card-pad)] text-sm text-muted-foreground" aria-busy="true">
        {t('team.loading')}
      </div>
    );
  if (dashboard.isError)
    return (
      <Panel title={t('team.title')} bodyClassName="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {explainError(dashboard.error)}
        </p>
        <Button variant="outline" onClick={() => void dashboard.refetch()}>
          {t('team.retry')}
        </Button>
      </Panel>
    );
  return (
    <WorkspaceData
      key={brandId}
      brandId={brandId}
      data={dashboard.data}
      refreshing={dashboard.isFetching}
      onRefresh={() => void dashboard.refetch()}
    />
  );
}

function WorkspaceData({
  brandId,
  data,
  refreshing,
  onRefresh,
}: {
  brandId: string;
  data: WatchmanDashboard;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations('automations');
  const locale = useLocale();
  const explainError = useUiErrorMessage();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [conversationId, setConversationId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [setupRequestId, setSetupRequestId] = useState<string>();
  const [assigning, setAssigning] = useState(false);
  const [settings, setSettings] = useState(false);
  const [expandedAttention, setExpandedAttention] = useState<string>();
  const [role, setRole] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [preferencesReady, setPreferencesReady] = useState(false);
  const pendingRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const workPanel = useRef<HTMLElement>(null);
  const selected = data.teammates.find((row) => row.profile.id === selectedId) ?? data.teammates[0];
  const selectedConversation = selected
    ? selected.profile.id === selectedId
      ? (conversationId ?? generalConversation(selected.profile.id))
      : generalConversation(selected.profile.id)
    : undefined;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const priorSetup = z.string().uuid().safeParse(params.get('setupRequest'));
    if (priorSetup.success) setSetupRequestId(priorSetup.data);
    const selected = params.get('teammate');
    if (selected) setSelectedId(selected);
    const conversation = params.get('conversation');
    if (selected && conversation) setConversationId(conversation);
    try {
      const restored = filtersToRestore(params, window.localStorage.getItem(filtersKey(brandId)));
      setRole(params.get('role') ?? restored?.role ?? 'all');
      setStatusFilter(params.get('status') ?? restored?.status ?? 'all');
    } catch {
      /* Preferences are optional; storage failure never blocks work. */
    }
    setPreferencesReady(true);
  }, [brandId]);
  useEffect(() => {
    if (!preferencesReady) return;
    try {
      window.localStorage.setItem(
        filtersKey(brandId),
        JSON.stringify({ role, status: statusFilter }),
      );
    } catch {
      /* No durable work depends on browser preferences. */
    }
  }, [brandId, preferencesReady, role, statusFilter]);

  const choose = (id: string, conversation?: string | null) => {
    setSelectedId(id);
    setConversationId(conversation ?? generalConversation(id));
    setAssigning(false);
    setSettings(false);
    const params = new URLSearchParams(window.location.search);
    params.set('teammate', id);
    params.set('conversation', conversation ?? generalConversation(id));
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    if (window.matchMedia?.('(max-width: 1023px)').matches)
      requestAnimationFrame(() => {
        workPanel.current?.focus({ preventScroll: true });
        workPanel.current?.scrollIntoView({ block: 'start' });
      });
  };
  const dismissSetup = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('setupRequest');
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    setSetupRequestId(undefined);
    setAdding(false);
  };
  const resumeSetup = (requestId: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('setupRequest', requestId);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    setSetupRequestId(requestId);
    setAdding(true);
  };
  const interaction = useMutation({
    mutationFn: async ({
      watchmanId,
      conversation,
      payload,
    }: {
      watchmanId: string;
      conversation: string;
      payload: { message: string } | { action: WatchmanUiAction };
    }) => {
      const fingerprint = JSON.stringify({ watchmanId, conversation, payload });
      if (pendingRequest.current?.fingerprint !== fingerprint)
        pendingRequest.current = { fingerprint, id: crypto.randomUUID() };
      return interactWatchman({
        brand_id: brandId,
        watchman_id: watchmanId,
        conversation_id: conversation,
        request_id: pendingRequest.current.id,
        ...payload,
      });
    },
    onSuccess: async () => {
      pendingRequest.current = null;
      await client.invalidateQueries({ queryKey: watchmanQueryKeys.all(brandId) });
    },
  });
  const action = (item: WatchmanAttentionItem, value: WatchmanUiAction) =>
    interaction.mutateAsync({
      watchmanId: item.watchman_id,
      conversation: item.conversation_id ?? generalConversation(item.watchman_id),
      payload: { action: value },
    });
  const assignment = async (input: WatchmanManageInput) => {
    if (!selected || !selectedConversation) return;
    if (input.action === 'wake' && input.reason)
      await interaction.mutateAsync({
        watchmanId: selected.profile.id,
        conversation: selectedConversation,
        payload: { message: input.reason },
      });
    else {
      await manageWatchman(brandId, { ...input, watchman_id: selected.profile.id }, z.unknown());
      await client.invalidateQueries({ queryKey: watchmanQueryKeys.all(brandId) });
    }
  };
  const filtered = data.teammates.filter(
    (row) =>
      (role === 'all' || row.profile.role === role) &&
      (statusFilter === 'all' || row.lifecycle === statusFilter) &&
      `${row.profile.name} ${row.profile.instructions}`
        .toLocaleLowerCase(locale)
        .includes(search.toLocaleLowerCase(locale)),
  );
  const work = selected
    ? data.work.filter((row) => row.owner_watchman_id === selected.profile.id)
    : [];
  const currentActions = new Set(
    data.needs_you.flatMap((item) => {
      const key = item.block ? watchmanActionKey(item.block) : null;
      return key ? [key] : [];
    }),
  );
  const ready = selected?.readiness?.state === 'ready';

  return (
    <div className="flex h-full min-h-0 flex-col gap-[var(--app-shell-gap)]">
      <PageHeader
        title={t('team.title')}
        description={t('team.description')}
        action={
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('team.refresh')}
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn('size-4', refreshing && 'animate-spin motion-reduce:animate-none')}
                aria-hidden="true"
              />
            </Button>
            {data.can_manage ? (
              <Button onClick={() => setAdding(true)}>
                <Plus className="size-4" aria-hidden="true" />
                {t('team.addTeammate')}
              </Button>
            ) : null}
          </>
        }
      />
      {data.partial ? (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-border pb-2 text-xs text-muted-foreground"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <div>
            <p>{t('team.partial')}</p>
            {data.issues.map((issue) => (
              <p key={`${issue.source}:${issue.message}`}>{issue.message}</p>
            ))}
          </div>
        </div>
      ) : null}
      {!data.can_manage ? (
        <p className="text-xs text-muted-foreground">{t('team.readOnly')}</p>
      ) : null}
      {adding || setupRequestId || !data.teammates.length ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {data.can_manage ? (
            <WatchmanSetup
              brandId={brandId}
              existingKinds={[]}
              onRequestStarted={setSetupRequestId}
              onComplete={(id) => {
                setSetupRequestId(undefined);
                setAdding(false);
                choose(id);
              }}
              onCancel={data.teammates.length ? dismissSetup : undefined}
            />
          ) : (
            <Panel title={t('team.noTeammates')}>
              <p className="text-sm text-muted-foreground">{t('team.noTeammatesReadOnly')}</p>
            </Panel>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 divide-y divide-border overflow-y-auto border-y border-border lg:auto-rows-auto lg:grid-cols-[minmax(12rem,0.7fr)_minmax(0,2fr)_minmax(14rem,1fr)] lg:divide-x lg:divide-y-0 lg:overflow-hidden">
          <Panel
            data-watchman-pane="team"
            title={t('team.team')}
            meta={data.teammates.length}
            className="max-h-[22rem] min-h-0 lg:max-h-none"
            bodyClassName="flex min-h-0 flex-col gap-3 p-0"
          >
            <div className="space-y-2 px-[var(--card-pad)] pt-[var(--card-pad)]">
              <div className="relative">
                <Label htmlFor="watchman-search" className="sr-only">
                  {t('team.searchTeammates')}
                </Label>
                <Search
                  className="pointer-events-none absolute top-2 left-2 size-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="watchman-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-7"
                  placeholder={t('team.searchTeammates')}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={role}
                  onValueChange={(value) => {
                    if (value) setRole(value);
                  }}
                >
                  <SelectTrigger className="w-full" aria-label={t('team.filterRole')}>
                    <SelectValue
                      items={{
                        all: t('team.allRoles'),
                        ...Object.fromEntries(
                          WATCHMAN_ROLES.map((value) => [value, t(`team.${value}Role`)]),
                        ),
                      }}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('team.allRoles')}</SelectItem>
                    {WATCHMAN_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(`team.${role}Role`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    if (value) setStatusFilter(value);
                  }}
                >
                  <SelectTrigger className="w-full" aria-label={t('team.filterStatus')}>
                    <SelectValue
                      items={{
                        all: t('team.allStates'),
                        ...Object.fromEntries(
                          (
                            ['ready', 'working', 'waiting', 'blocked', 'paused', 'failed'] as const
                          ).map((value) => [value, t(`team.lifecycle.${value}`)]),
                        ),
                      }}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('team.allStates')}</SelectItem>
                    {(['ready', 'working', 'waiting', 'blocked', 'paused', 'failed'] as const).map(
                      (state) => (
                        <SelectItem key={state} value={state}>
                          {t(`team.lifecycle.${state}`)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtered.map((row) => (
                <button
                  type="button"
                  key={row.profile.id}
                  aria-pressed={selected?.profile.id === row.profile.id}
                  onClick={() => choose(row.profile.id)}
                  className={cn(
                    'w-full space-y-2 border-t border-border px-[var(--card-pad)] py-3 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    selected?.profile.id === row.profile.id && 'bg-muted/50',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{row.profile.name}</span>
                    <Pill>
                      <PillIndicator variant={tone(row.lifecycle)} />
                      {t(`team.lifecycle.${row.lifecycle}`)}
                    </Pill>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`team.${row.profile.role}Role`)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t('team.workCount', { count: row.active_work_count })}
                  </span>
                </button>
              ))}
              {!filtered.length ? (
                <p className="p-[var(--card-pad)] text-xs text-muted-foreground">
                  {t('team.noMatches')}
                </p>
              ) : null}
            </div>
          </Panel>
          <section
            ref={workPanel}
            tabIndex={-1}
            data-watchman-pane="conversation"
            className="flex h-[80svh] min-h-[32rem] flex-col lg:h-auto lg:min-h-0"
            aria-label={selected?.profile.name}
          >
            {selected ? (
              <>
                <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border p-[var(--card-pad)]">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{selected.profile.name}</h2>
                    <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                      {selected.profile.instructions}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t(`team.lifecycle.${selected.lifecycle}`)} · {selected.profile.timezone}
                    </p>
                    {selected.budget ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('team.modelBudget', {
                          spent: new Intl.NumberFormat(locale, {
                            style: 'currency',
                            currency: 'USD',
                          }).format(selected.budget.month_spend_usd),
                          limit: new Intl.NumberFormat(locale, {
                            style: 'currency',
                            currency: 'USD',
                          }).format(selected.budget.budget_usd),
                        })}
                      </p>
                    ) : null}
                  </div>
                  {data.can_manage ? (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('team.settings')}
                        aria-expanded={settings}
                        onClick={() => {
                          setSettings(!settings);
                          setAssigning(false);
                        }}
                      >
                        <Settings2 aria-hidden="true" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setAssigning(!assigning);
                          setSettings(false);
                        }}
                      >
                        {t('team.giveWork')}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <WatchmanReadiness
                  readiness={selected.readiness}
                  canManage={data.can_manage}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  onResumeSetup={() => resumeSetup(selected.profile.id)}
                  onBudget={() => {
                    setSettings(true);
                    setAssigning(false);
                  }}
                />
                {assigning ? (
                  <WatchmanWorkForm
                    active={selected.profile.status === 'active'}
                    pending={interaction.isPending}
                    submit={assignment}
                    onClose={() => setAssigning(false)}
                  />
                ) : null}
                {settings && data.can_manage ? (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <WatchmanSettings
                      brandId={brandId}
                      watchmanId={selected.profile.id}
                      ready={ready}
                    />
                  </div>
                ) : selectedConversation ? (
                  <WatchmanConversation
                    key={`${selected.profile.id}:${selectedConversation}`}
                    brandId={brandId}
                    watchmanId={selected.profile.id}
                    conversationId={selectedConversation}
                    canManage={data.can_manage}
                    currentActions={currentActions}
                  />
                ) : null}
              </>
            ) : (
              <p className="p-[var(--card-pad)] text-sm text-muted-foreground">
                {t('team.selectTeammate')}
              </p>
            )}
          </section>
          <div
            data-watchman-pane="attention"
            className="flex min-h-80 flex-col divide-y divide-border lg:min-h-0"
          >
            <Panel
              title={t('team.needsYou')}
              meta={data.needs_you.length}
              className="min-h-0 flex-1"
              bodyClassName="min-h-0 overflow-y-auto p-0"
            >
              {data.needs_you.length ? (
                data.needs_you.map((item) => (
                  <div
                    key={item.id}
                    className="border-b border-border p-[var(--card-pad)] last:border-0"
                  >
                    <button
                      type="button"
                      className="w-full space-y-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-expanded={expandedAttention === item.id}
                      onClick={() => {
                        setExpandedAttention(expandedAttention === item.id ? undefined : item.id);
                        choose(item.watchman_id, item.conversation_id);
                      }}
                    >
                      <span className="block text-xs text-muted-foreground">
                        {
                          data.teammates.find((row) => row.profile.id === item.watchman_id)?.profile
                            .name
                        }
                      </span>
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="block break-words text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    </button>
                    {expandedAttention === item.id ? (
                      <div className="mt-3">
                        {item.block ? (
                          <WatchmanCard
                            block={item.block}
                            canManage={data.can_manage && !interaction.isPending}
                            onAction={(value) => action(item, value)}
                          />
                        ) : item.href ? (
                          <Link
                            className={buttonVariants({ variant: 'outline', size: 'sm' })}
                            href={item.href}
                          >
                            {t('team.openDetails')}
                          </Link>
                        ) : item.type === 'connection' ? (
                          <Link
                            className={buttonVariants({ variant: 'outline', size: 'sm' })}
                            href="/settings?section=integrations"
                          >
                            {t('team.manageConnections')}
                          </Link>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              choose(item.watchman_id, item.conversation_id);
                              if (item.type === 'report') setSettings(true);
                            }}
                          >
                            {t('team.openDetails')}
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="space-y-2 p-[var(--card-pad)]">
                  <p className="text-sm font-medium">{t('team.noAttention')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('team.noAttentionDescription')}
                  </p>
                </div>
              )}
              {interaction.isError ? (
                <p role="alert" className="p-[var(--card-pad)] text-xs text-destructive">
                  {explainError(interaction.error)}
                </p>
              ) : null}
            </Panel>
            <Panel
              title={t('team.work')}
              meta={work.length}
              className="min-h-0 flex-1"
              bodyClassName="min-h-0 overflow-y-auto p-0"
            >
              {work.length ? (
                work.map((item) => (
                  <WatchmanWorkRow
                    key={item.execution.workNodeId}
                    work={item}
                    onOpen={() => choose(item.owner_watchman_id, item.conversation_id)}
                  />
                ))
              ) : (
                <div className="space-y-2 p-[var(--card-pad)]">
                  <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium">{t('team.noWork')}</p>
                  <p className="text-xs text-muted-foreground">{t('team.noWorkDescription')}</p>
                  {data.can_manage ? (
                    <Button variant="outline" size="sm" onClick={() => setAssigning(true)}>
                      {t('team.giveWork')}
                    </Button>
                  ) : null}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
