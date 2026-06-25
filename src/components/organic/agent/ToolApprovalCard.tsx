'use client';

import { Check, X } from 'lucide-react';
import { CardContent, CardFooter } from '@/components/ui/card';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { AgentButton, AgentDecisionCard, MetaRow, PlatformTag } from './agentCardKit';
import type { ToolApproval } from './types';

type ContentInput = {
  platform?: string;
  format?: string;
  scheduledAt?: string;
  scheduled_at?: string;
  angle?: string;
  topic?: string;
  description?: string;
  objective?: string;
};

function parseContentInput(input: unknown): ContentInput {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as ContentInput;
}

function formatScheduledAt(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new Date(raw).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function inputSummary(input: unknown): string {
  try {
    const text = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
    return text.length > 400 ? `${text.slice(0, 400)}…` : text;
  } catch {
    return String(input);
  }
}

export function ToolApprovalCard({
  approval,
  onApproveAction,
  onDenyAction,
  disabled,
}: {
  approval: ToolApproval;
  onApproveAction: () => void;
  onDenyAction: () => void;
  disabled?: boolean;
}) {
  const content = parseContentInput(approval.input);
  const platform = content.platform;
  const format = content.format;
  const scheduledAt = formatScheduledAt(content.scheduledAt ?? content.scheduled_at);
  const angle = content.angle ?? content.topic ?? content.description;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <HoverCard openDelay={400}>
          <HoverCardTrigger asChild>
            <AgentDecisionCard className="mt-0 w-[210px] shrink-0 cursor-default transition-colors hover:border-border/70">
              <CardContent className="space-y-2.5 px-3.5 pt-3.5 pb-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {platform && <PlatformTag platform={platform} />}
                  {format && (
                    <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {format}
                    </span>
                  )}
                </div>
                {scheduledAt && <MetaRow items={[scheduledAt]} className="text-xs" />}
                {angle && (
                  <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80">
                    {angle}
                  </p>
                )}
                {!platform && !angle && (
                  <p className="text-xs text-muted-foreground">{approval.toolName}</p>
                )}
              </CardContent>
              <CardFooter className="flex items-center justify-end gap-1 border-t border-border/50 px-3 py-2">
                <AgentButton
                  variant="ghost"
                  disabled={disabled}
                  onClick={onDenyAction}
                  className="h-7 min-h-0 gap-1 px-2.5 text-xs"
                >
                  <X className="h-3 w-3" />
                  Deny
                </AgentButton>
                <AgentButton
                  variant="primary"
                  disabled={disabled}
                  onClick={onApproveAction}
                  className="h-7 min-h-0 gap-1 px-2.5 text-xs"
                >
                  <Check className="h-3 w-3" />
                  Approve
                </AgentButton>
              </CardFooter>
            </AgentDecisionCard>
          </HoverCardTrigger>
          <HoverCardContent side="top" align="start" className="w-72 p-0">
            <div className="space-y-2 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {approval.toolName}
              </p>
              <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-2.5 text-2xs leading-relaxed text-muted-foreground">
                {inputSummary(approval.input)}
              </pre>
            </div>
          </HoverCardContent>
        </HoverCard>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuLabel className="text-xs text-muted-foreground">
          {approval.toolName}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={disabled}
          onSelect={onApproveAction}
          className="gap-2 text-emerald-600 focus:text-emerald-600 dark:text-emerald-400"
        >
          <Check className="h-3.5 w-3.5" />
          Approve
        </ContextMenuItem>
        <ContextMenuItem
          disabled={disabled}
          onSelect={onDenyAction}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
          Deny
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
