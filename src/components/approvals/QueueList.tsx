'use client';

import { useApprovalsStore } from '@/lib/approvals/store';
import type { RuleAction } from '@/lib/approvals/types';
import { cn } from '@/lib/utils';
import { getActionIcon } from './actionIcons';
import { actionTypeLabel, formatRelativeTime, scopeLabel, whyText } from './formatters';

// The focused row is tinted bg-accent/60, where the muted caption colour measures 2.9:1 (light)
// and 2.4:1 (dark); on that row the captions read in the foreground ink (7.9:1 / 4.9:1).
const FOCUSABLE_CAPTION = 'text-muted-foreground group-aria-[current=true]:text-foreground';

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
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
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
                'group grid w-full grid-cols-[5rem_8rem_minmax(0,1fr)_minmax(0,1fr)_4rem] items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                isFocused && 'bg-accent/60',
                optimistic && 'opacity-40',
              )}
              aria-current={isFocused ? 'true' : undefined}
            >
              <span className={cn('font-data text-xs tabular-nums', FOCUSABLE_CAPTION)}>
                {formatRelativeTime(action.created_at)}
              </span>
              <span className="flex items-center gap-1.5 truncate text-xs font-medium uppercase tracking-wide">
                <Icon className={cn('h-3 w-3 shrink-0', FOCUSABLE_CAPTION)} strokeWidth={1.5} />
                <span className="truncate">{actionTypeLabel(action.action_type)}</span>
              </span>
              <span className="truncate font-data text-xs text-foreground">
                {scopeLabel(action)}
              </span>
              <span className={cn('truncate text-xs', FOCUSABLE_CAPTION)}>{whyText(action)}</span>
              <span className={cn('text-right text-xs', FOCUSABLE_CAPTION)}>
                {optimistic ? optimistic : isFocused ? 'Focused' : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
