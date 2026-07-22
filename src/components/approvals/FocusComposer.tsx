'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { RuleAction } from '@/lib/approvals/types';
import { cn } from '@/lib/utils';
import { getActionIcon } from './actionIcons';
import { ComposerOverflowMenu } from './ComposerOverflowMenu';
import { DecisionActions, type DecisionActionsHandle } from './DecisionActions';
import { EvidenceStrip } from './EvidenceStrip';
import {
  actionTypeLabel,
  formatRelativeTime,
  isExecutorUnsupported,
  scopeLabel,
  whyText,
} from './formatters';
import { PayloadSheet } from './PayloadSheet';

type Props = {
  action: RuleAction | null;
  brandId: string;
  isLoading: boolean;
  onAdvance: () => void;
  bindGlobalKeys?: boolean;
};

export function FocusComposer({
  action,
  brandId,
  isLoading,
  onAdvance,
  bindGlobalKeys = true,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [payloadOpen, setPayloadOpen] = React.useState(false);
  const decisionRef = React.useRef<DecisionActionsHandle>(null);

  // P opens payload, S advances. Approve/Reject keys live on DecisionActions.
  React.useEffect(() => {
    if (!action || !bindGlobalKeys) return;
    function handler(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'p') {
        event.preventDefault();
        setPayloadOpen((current) => !current);
      } else if (key === 's') {
        event.preventDefault();
        onAdvance();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [action, bindGlobalKeys, onAdvance]);

  if (isLoading && !action) {
    return <ComposerSkeleton />;
  }

  if (!action) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <div className="text-base font-medium text-foreground">Queue clear.</div>
          <p className="max-w-sm text-sm text-muted-foreground">
            New proposals arrive automatically as the rule engine and flow runs evaluate.
          </p>
        </CardContent>
      </Card>
    );
  }

  const Icon = getActionIcon(action.action_type);
  const unsupported = isExecutorUnsupported(action.action_type);

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={action.id}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          exit={
            reduceMotion
              ? undefined
              : { opacity: 0, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } }
          }
          transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
        >
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="gap-1.5 font-data text-xs uppercase tracking-wide"
                  >
                    <TypeIcon
                      icon={Icon}
                      unsupported={unsupported}
                      typeLabel={actionTypeLabel(action.action_type)}
                    />
                    {actionTypeLabel(action.action_type)}
                  </Badge>
                  <Badge variant="outline" className="font-data text-xs">
                    {scopeLabel(action)}
                  </Badge>
                </div>
                <h2 className="text-xl font-medium leading-snug text-foreground">
                  {whyText(action)}
                </h2>
                <div className="font-data text-xs text-muted-foreground">
                  Queued {formatRelativeTime(action.created_at)}
                </div>
              </div>
              <ComposerOverflowMenu
                action={action}
                onReject={() => decisionRef.current?.openReject()}
                onSkip={onAdvance}
                onViewPayload={() => setPayloadOpen(true)}
              />
            </CardHeader>

            <CardContent className="space-y-4">
              <EvidenceStrip facts={action.evaluation_facts ?? null} />
              {Object.keys(action.action_payload).length > 0 ? (
                <PayloadSummary payload={action.action_payload} />
              ) : null}
            </CardContent>

            <CardFooter className={cn('border-t border-border pt-4', 'justify-end')}>
              <DecisionActions
                ref={decisionRef}
                action={action}
                brandId={brandId}
                onAdvance={onAdvance}
                bindGlobalKeys={bindGlobalKeys}
              />
            </CardFooter>
          </Card>
        </motion.div>
      </AnimatePresence>

      <PayloadSheet action={action} open={payloadOpen} onOpenChange={setPayloadOpen} />
    </>
  );
}

function TypeIcon({
  icon: Icon,
  unsupported,
  typeLabel,
}: {
  icon: ReturnType<typeof getActionIcon>;
  unsupported: boolean;
  typeLabel: string;
}) {
  if (!unsupported) {
    return <Icon className="h-3 w-3" strokeWidth={1.5} />;
  }
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="relative inline-flex">
            <Icon className="h-3 w-3" strokeWidth={1.5} />
            <span className="absolute -right-1 -top-1 inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {typeLabel} isn&apos;t handled by the executor yet. Approving will mark this row FAILED.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PayloadSummary({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).slice(0, 4);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground">{key}</span>
          <span className="font-data tabular-nums text-foreground">{renderValue(value)}</span>
        </div>
      ))}
    </div>
  );
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function ComposerSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="skeleton-shimmer h-5 w-32 rounded-md" />
        <div className="skeleton-shimmer h-7 w-2/3 rounded-md" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="skeleton-shimmer h-16 w-full rounded-md" />
        <div className="skeleton-shimmer h-3 w-1/3 rounded-md" />
      </CardContent>
      <CardFooter className="justify-end">
        <div className="skeleton-shimmer h-11 w-40 rounded-md" />
      </CardFooter>
    </Card>
  );
}
