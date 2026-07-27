'use client';

import { FileText, Loader2, Target } from 'lucide-react';
import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGoals } from '@/hooks/useGoals';
import { formatRelativeTime } from '@/lib/time/relativeTime';

export function JainaGoalsSidebarPanel({ brandId }: { brandId: string }) {
  const query = useGoals(brandId);

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading Goals…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="m-3 rounded-md border border-dashed border-border p-3">
        <p className="text-xs font-medium">Goals are not available here yet.</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          This environment has not published the campaign Goal store.
        </p>
      </div>
    );
  }

  const goals = query.data ?? [];
  if (goals.length === 0) {
    return (
      <div className="m-3 rounded-md border border-dashed border-border p-4 text-center">
        <Target className="mx-auto size-4 text-muted-foreground" />
        <p className="mt-2 text-xs font-medium">No campaign Goals yet</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Create one from this Goals tab to start its structured campaign checklist.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-44 md:max-h-none md:flex-1 md:min-h-0">
      <div className="flex gap-2 p-2 md:flex-col">
        {goals.map((goal) => (
          <Link
            key={goal.id}
            href={`/goals/${encodeURIComponent(goal.id)}`}
            className="flex min-w-[220px] items-start gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-left transition-colors hover:border-border hover:bg-background/70 md:min-w-0"
          >
            <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-primary">{goal.title}</span>
              <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                {goal.outcome}
              </span>
              <span className="mt-1 block font-mono text-2xs text-muted-foreground">
                Updated {formatRelativeTime(goal.updatedAt)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </ScrollArea>
  );
}
