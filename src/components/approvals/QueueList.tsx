'use client';

import { useApprovalsStore } from '@/lib/approvals/store';
import type { RuleAction } from '@/lib/approvals/types';
import { cn } from '@/lib/utils';
import { getActionIcon } from './actionIcons';
import { actionTypeLabel, formatRelativeTime, scopeLabel, whyText } from './formatters';

type Props = {
  actions: RuleAction[];
  focusedId: string | null;
  onFocus: (id: string) => void;
};

export function QueueList({ actions, focusedId, onFocus }: Props) {
  const pendingDecisions = useApprovalsStore((s) => s.pendingDecisions);

  if (!actions.length) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Nothing else in the queue.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card" role="list">
      {actions.map((action) => {
        const isFocused = action.id === focusedId;
        const optimistic = pendingDecisions[action.id];
        const Icon = getActionIcon(action.action_type);
        return (
          <li key={action.id}>
            <button
              type="button"
              onClick={() => onFocus(action.id)}
              className={cn(
                'grid w-full grid-cols-[5rem_8rem_minmax(0,1fr)_minmax(0,1fr)_4rem] items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                isFocused && 'bg-accent/60',
                optimistic && 'opacity-40',
              )}
              aria-current={isFocused ? 'true' : undefined}
            >
              <span className="font-data text-xs tabular-nums text-muted-foreground">
                {formatRelativeTime(action.created_at)}
              </span>
              <span className="flex items-center gap-1.5 truncate text-xs font-medium uppercase tracking-wide">
                <Icon className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <span className="truncate">{actionTypeLabel(action.action_type)}</span>
              </span>
              <span className="truncate font-data text-xs text-foreground">
                {scopeLabel(action)}
              </span>
              <span className="truncate text-xs text-muted-foreground">{whyText(action)}</span>
              <span className="text-right text-xs text-muted-foreground">
                {optimistic ? optimistic : isFocused ? 'Focused' : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
