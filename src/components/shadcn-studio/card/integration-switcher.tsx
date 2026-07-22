'use client';

import {
  CheckIcon,
  CopyIcon,
  FigmaLogoIcon,
  GitHubLogoIcon,
  MixIcon,
  Pencil1Icon,
  ReaderIcon,
} from '@radix-ui/react-icons';
import { GitBranch, GitMerge, Loader2, MessageSquare, PenLine, Plus, Users } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import * as React from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type IconComponent = React.ComponentType<{ className?: string }>;

export type IntegrationSwitcherItemStatus = 'checked' | 'copy';

export type IntegrationSwitcherItem = {
  id: string;
  title: string;
  icon: IconComponent;
  status: IntegrationSwitcherItemStatus;
  code?: string;
  subtitle?: string;
  children?: IntegrationSwitcherItem[];
};

export type IntegrationSwitcherTab = {
  id: string;
  name: string;
  icon: IconComponent;
};

export type IntegrationSwitcherData = Record<string, IntegrationSwitcherItem[]>;

type IntegrationSwitcherProps = {
  integrations?: IntegrationSwitcherTab[];
  data?: IntegrationSwitcherData;
  activeIntegration?: string;
  defaultActiveIntegration?: string;
  onActiveIntegrationChange?: (integrationId: string) => void;
  className?: string;
  tabBarTrailing?: React.ReactNode;
  maxItemHeight?: number | string;
  onItemToggle?: (integrationId: string, itemId: string, next: boolean) => void;
  pendingItemIds?: Set<string>;
  emptyState?: React.ReactNode;
  onSyncClick?: (integrationId: string) => void;
  syncLabel?: (integrationId: string, hasItems: boolean) => string;
  syncingTabIds?: Set<string>;
};

const defaultIntegrations: IntegrationSwitcherTab[] = [
  { id: 'github', name: 'GitHub', icon: GitHubLogoIcon },
  { id: 'figma', name: 'Figma', icon: FigmaLogoIcon },
  { id: 'slack', name: 'Slack', icon: MessageSquare },
  { id: 'linear', name: 'Linear', icon: MixIcon },
  { id: 'teams', name: 'Teams', icon: Users },
];

const defaultIntegrationData: IntegrationSwitcherData = {
  github: [
    {
      id: '#380',
      title: 'fix-checkout-process',
      icon: GitBranch,
      status: 'checked',
    },
    { id: '#346', title: 'update-api-docs', icon: GitMerge, status: 'copy' },
    {
      id: '#341',
      title: 'sync-release-notes',
      icon: ReaderIcon,
      status: 'copy',
    },
  ],
  figma: [
    { id: 'v2.1', title: 'design-system-kit', icon: PenLine, status: 'copy' },
    {
      id: 'v2.0',
      title: 'handoff-components',
      icon: Pencil1Icon,
      status: 'checked',
    },
    { id: 'lib', title: 'token-library', icon: ReaderIcon, status: 'copy' },
  ],
  slack: [
    {
      id: 'ops',
      title: 'launch-war-room',
      icon: MessageSquare,
      status: 'checked',
    },
    {
      id: 'cs',
      title: 'customer-escalations',
      icon: MessageSquare,
      status: 'copy',
    },
    {
      id: 'rev',
      title: 'weekly-revenue-sync',
      icon: ReaderIcon,
      status: 'copy',
    },
  ],
  linear: [
    {
      id: 'LIN-184',
      title: 'audit-onboarding-flow',
      icon: GitBranch,
      status: 'copy',
    },
    {
      id: 'LIN-172',
      title: 'ship-command-menu',
      icon: GitMerge,
      status: 'checked',
    },
    {
      id: 'LIN-151',
      title: 'triage-performance',
      icon: ReaderIcon,
      status: 'copy',
    },
  ],
  teams: [
    { id: 'MKT', title: 'access-review', icon: Users, status: 'checked' },
    {
      id: 'ENG',
      title: 'incident-followup',
      icon: MessageSquare,
      status: 'copy',
    },
    { id: 'CS', title: 'renewal-readiness', icon: ReaderIcon, status: 'copy' },
  ],
};

const listTransition = {
  duration: 0.24,
  ease: [0.2, 0.8, 0.2, 1],
} as const;

function useControllableIntegration({
  integrations,
  activeIntegration,
  defaultActiveIntegration,
  onActiveIntegrationChange,
}: {
  integrations: IntegrationSwitcherTab[];
  activeIntegration?: string;
  defaultActiveIntegration?: string;
  onActiveIntegrationChange?: (integrationId: string) => void;
}) {
  const fallbackIntegration = integrations[0]?.id ?? '';
  const [internalActiveIntegration, setInternalActiveIntegration] = React.useState(
    defaultActiveIntegration ?? fallbackIntegration,
  );
  const selectedIntegration = activeIntegration ?? internalActiveIntegration;

  const setSelectedIntegration = React.useCallback(
    (integrationId: string) => {
      if (!activeIntegration) {
        setInternalActiveIntegration(integrationId);
      }
      onActiveIntegrationChange?.(integrationId);
    },
    [activeIntegration, onActiveIntegrationChange],
  );

  return [selectedIntegration, setSelectedIntegration] as const;
}

function IntegrationTabBar({
  integrations,
  activeIntegration,
  layoutId,
  onSelectIntegration,
  trailing,
}: {
  integrations: IntegrationSwitcherTab[];
  activeIntegration: string;
  layoutId: string;
  onSelectIntegration: (integrationId: string) => void;
  trailing?: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label="Integrations"
      className="flex w-full flex-wrap items-center gap-1 rounded-full border border-border/70 bg-muted/60 p-1"
    >
      {integrations.map((integration) => {
        const isActive = activeIntegration === integration.id;
        const IntegrationIcon = integration.icon;

        return (
          <button
            key={integration.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`integration-switcher-panel-${integration.id}`}
            data-active-tab={isActive ? 'true' : undefined}
            onClick={() => onSelectIntegration(integration.id)}
            className={cn(
              'relative inline-flex min-h-8 flex-1 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors sm:flex-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isActive && 'text-foreground',
            )}
          >
            {isActive ? (
              <motion.span
                layoutId={reduceMotion ? undefined : layoutId}
                className="absolute inset-0 rounded-full bg-background shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-2 whitespace-nowrap">
              <IntegrationIcon className="h-4 w-4" />
              {integration.name}
            </span>
          </button>
        );
      })}
      {trailing ? <div className="ml-auto flex items-center pl-1">{trailing}</div> : null}
    </div>
  );
}

function ActionIcon({ status }: { status: IntegrationSwitcherItemStatus }) {
  if (status === 'checked') {
    return (
      <span
        aria-label="Already synced"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      >
        <CheckIcon className="h-4 w-4" />
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label="Copy item"
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CopyIcon className="h-4 w-4" />
    </button>
  );
}

function ToggleAction({
  checked,
  pending,
  itemTitle,
  onToggle,
}: {
  checked: boolean;
  pending: boolean;
  itemTitle: string;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? `Unassign ${itemTitle}` : `Assign ${itemTitle}`}
      disabled={pending}
      onClick={() => onToggle(!checked)}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        checked
          ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground',
        pending && 'cursor-wait opacity-70',
      )}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : checked ? (
        <CheckIcon className="h-4 w-4" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
    </button>
  );
}

function IntegrationItemRow({
  item,
  activeIntegration,
  depth,
  onItemToggle,
  pendingItemIds,
}: {
  item: IntegrationSwitcherItem;
  activeIntegration: string;
  depth: number;
  onItemToggle?: (integrationId: string, itemId: string, next: boolean) => void;
  pendingItemIds?: Set<string>;
}) {
  const ItemIcon = item.icon;
  const isPending = pendingItemIds?.has(item.id) ?? false;
  const hasChildren = !!item.children?.length;
  const indentPx = depth * 24;

  return (
    <>
      <div
        className={cn(
          'flex min-h-12 items-center justify-between gap-3 border-b border-border/70 py-2.5',
          !hasChildren && 'last:border-0',
        )}
        style={{ paddingLeft: indentPx }}
      >
        <div className="flex min-w-0 items-center gap-3">
          {depth > 0 ? (
            <span
              aria-hidden
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/50"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 0V8C4 10.2091 5.79086 12 8 12H16"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </span>
          ) : null}
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <ItemIcon className="h-4 w-4" />
          </span>
          <span className="shrink-0 font-mono text-sm text-muted-foreground">
            {item.code ?? item.id}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <span className="block truncate text-sm font-medium text-primary">{item.title}</span>
            {item.subtitle ? (
              <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
            ) : null}
          </span>
        </div>
        {onItemToggle ? (
          <ToggleAction
            checked={item.status === 'checked'}
            pending={isPending}
            itemTitle={item.title}
            onToggle={(next) => onItemToggle(activeIntegration, item.id, next)}
          />
        ) : (
          <ActionIcon status={item.status} />
        )}
      </div>
      {hasChildren
        ? item.children!.map((child) => (
            <IntegrationItemRow
              key={`${activeIntegration}-${item.id}-${child.id}`}
              item={child}
              activeIntegration={activeIntegration}
              depth={depth + 1}
              onItemToggle={onItemToggle}
              pendingItemIds={pendingItemIds}
            />
          ))
        : null}
    </>
  );
}

function SyncBar({
  activeIntegration,
  hasItems,
  onSyncClick,
  syncing,
  syncLabel,
}: {
  activeIntegration: string;
  hasItems: boolean;
  onSyncClick: (integrationId: string) => void;
  syncing: boolean;
  syncLabel?: (integrationId: string, hasItems: boolean) => string;
}) {
  const label =
    syncLabel?.(activeIntegration, hasItems) ??
    (hasItems ? 'Sync more accounts' : 'Connect this provider');
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-3 py-2">
      <span className="text-xs text-muted-foreground">Add accounts available to your user.</span>
      <button
        type="button"
        onClick={() => onSyncClick(activeIntegration)}
        disabled={syncing}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm outline-none transition-colors',
          'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
          syncing && 'cursor-wait opacity-70',
        )}
      >
        {syncing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        {label}
      </button>
    </div>
  );
}

function IntegrationItemList({
  activeIntegration,
  items,
  maxHeight,
  onItemToggle,
  pendingItemIds,
  emptyState,
  onSyncClick,
  syncLabel,
  syncingTabIds,
}: {
  activeIntegration: string;
  items: IntegrationSwitcherItem[];
  maxHeight: number | string;
  onItemToggle?: (integrationId: string, itemId: string, next: boolean) => void;
  pendingItemIds?: Set<string>;
  emptyState?: React.ReactNode;
  onSyncClick?: (integrationId: string) => void;
  syncLabel?: (integrationId: string, hasItems: boolean) => string;
  syncingTabIds?: Set<string>;
}) {
  const reduceMotion = useReducedMotion();
  const showEmpty = items.length === 0 && emptyState;
  const heightStyle = typeof maxHeight === 'number' ? Math.max(164, maxHeight) : maxHeight;
  const isSyncing = syncingTabIds?.has(activeIntegration) ?? false;

  return (
    <div className="relative overflow-hidden" style={{ height: heightStyle, minHeight: 164 }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={activeIntegration}
          id={`integration-switcher-panel-${activeIntegration}`}
          role="tabpanel"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14 }}
          transition={listTransition}
          className="absolute inset-0 flex flex-col"
        >
          {onSyncClick ? (
            <SyncBar
              activeIntegration={activeIntegration}
              hasItems={items.length > 0}
              onSyncClick={onSyncClick}
              syncing={isSyncing}
              syncLabel={syncLabel}
            />
          ) : null}
          {showEmpty ? (
            <div className="flex flex-1 items-center justify-center px-4 text-center">
              {emptyState}
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1 pr-2">
              <div className="flex flex-col">
                {items.map((item) => (
                  <IntegrationItemRow
                    key={`${activeIntegration}-${item.id}`}
                    item={item}
                    activeIntegration={activeIntegration}
                    depth={0}
                    onItemToggle={onItemToggle}
                    pendingItemIds={pendingItemIds}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function IntegrationSwitcher({
  integrations = defaultIntegrations,
  data = defaultIntegrationData,
  activeIntegration,
  defaultActiveIntegration,
  onActiveIntegrationChange,
  className,
  tabBarTrailing,
  maxItemHeight = 320,
  onItemToggle,
  pendingItemIds,
  emptyState,
  onSyncClick,
  syncLabel,
  syncingTabIds,
}: IntegrationSwitcherProps) {
  const instanceId = React.useId();
  const [selectedIntegration, setSelectedIntegration] = useControllableIntegration({
    integrations,
    activeIntegration,
    defaultActiveIntegration,
    onActiveIntegrationChange,
  });
  const activeIntegrationId = integrations.some(
    (integration) => integration.id === selectedIntegration,
  )
    ? selectedIntegration
    : (integrations[0]?.id ?? '');
  const activeItems = data[activeIntegrationId] ?? [];

  return (
    <Card className={cn('w-full max-w-[560px] gap-4 rounded-2xl bg-card p-3 shadow-sm', className)}>
      <CardContent className="space-y-3 p-0">
        <IntegrationTabBar
          integrations={integrations}
          activeIntegration={activeIntegrationId}
          layoutId={`${instanceId}-active-integration-pill`}
          onSelectIntegration={setSelectedIntegration}
          trailing={tabBarTrailing}
        />
        <IntegrationItemList
          activeIntegration={activeIntegrationId}
          items={activeItems}
          maxHeight={maxItemHeight}
          onItemToggle={onItemToggle}
          pendingItemIds={pendingItemIds}
          emptyState={emptyState}
          onSyncClick={onSyncClick}
          syncLabel={syncLabel}
          syncingTabIds={syncingTabIds}
        />
      </CardContent>
    </Card>
  );
}

export default IntegrationSwitcher;
