'use client';
import { ArrowUpToLine, ScrollText, SquareArrowOutUpRight } from 'lucide-react';

import { Pill } from '@/components/kibo-ui/pill';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export type AgenticActivityItem = {
  id: string;
  actorName: string;
  summary: string;
  timestamp: string;
  avatarUrl?: string;
  highlight?: string;
};

type AgenticActivityLogProps = {
  items: AgenticActivityItem[];
  emptyMessage?: string;
};

function initialsFromName(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function AgenticActivityLog({ items, emptyMessage }: AgenticActivityLogProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Pill variant="muted">
            <ScrollText aria-hidden="true" />
          </Pill>
          <div>
            <h3 className="text-lg font-semibold">Recent activity</h3>
            <p className="text-sm text-muted-foreground">
              Agentic DCO actions from the last 7 days.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="icon" aria-label="Open activity log">
            <SquareArrowOutUpRight aria-hidden="true" />
          </Button>
          <Button variant="secondary" size="icon" aria-label="Pin activity log">
            <ArrowUpToLine aria-hidden="true" />
          </Button>
        </div>
      </div>

      <Separator className="my-3" />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {emptyMessage ?? 'No DCO activity yet. Automations will appear here as they run.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, index) => (
            <div key={item.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {item.avatarUrl ? (
                      <AvatarImage src={item.avatarUrl} alt={item.actorName} />
                    ) : null}
                    <AvatarFallback className="text-xs font-semibold">
                      {initialsFromName(item.actorName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <span className="block font-medium">{item.actorName}</span>
                    <span className="block text-sm text-muted-foreground">{item.summary}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.highlight ? <Pill variant="violet">{item.highlight}</Pill> : null}
                  <span className="text-sm text-muted-foreground">{item.timestamp}</span>
                </div>
              </div>
              {index < items.length - 1 ? <Separator className="my-3" /> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
