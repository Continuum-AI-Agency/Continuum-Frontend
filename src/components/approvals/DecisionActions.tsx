'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { buttonVariants } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import { useUiErrorMessage } from '@/i18n/errors';
import { useApprove, useReject } from '@/lib/approvals/queries';
import { useApprovalsStore } from '@/lib/approvals/store';
import type { RuleAction } from '@/lib/approvals/types';
import { cn } from '@/lib/utils';
import { useApprovalFormatters } from './formatters';
import { RejectDialog } from './RejectDialog';

type DecisionActionsHandle = {
  approve: () => Promise<void>;
  openReject: () => void;
};

type Props = {
  action: RuleAction;
  brandId: string;
  onAdvance: () => void;
  bindGlobalKeys?: boolean;
};

export const DecisionActions = React.forwardRef<DecisionActionsHandle, Props>(
  function DecisionActions({ action, brandId, onAdvance, bindGlobalKeys = true }, ref) {
    const uiText = useTranslations('common');
    const getUiErrorMessage = useUiErrorMessage();
    const { actionTypeLabel } = useApprovalFormatters();
    const approve = useApprove(brandId);
    const reject = useReject(brandId);
    const markOptimistic = useApprovalsStore((s) => s.markOptimistic);
    const clearOptimistic = useApprovalsStore((s) => s.clearOptimistic);
    const optimistic = useApprovalsStore((s) => s.pendingDecisions[action.id]);
    const [rejectOpen, setRejectOpen] = React.useState(false);
    const reduceMotion = useReducedMotion();

    const busy = approve.isPending || reject.isPending || Boolean(optimistic);

    const runApprove = React.useCallback(async () => {
      if (busy) return;
      markOptimistic(action.id, 'approve');
      onAdvance();
      try {
        const result = await approve.mutateAsync({ ruleActionId: action.id });
        if (!result.ok) {
          toast.error(uiText('m_4bef5be9a8'));
        } else if (result.alreadyExecuted) {
          toast.info(uiText('m_d540b39f7b'));
        } else {
          toast.success(
            uiText('m_827752f9da', { v0: String(actionTypeLabel(action.action_type)) }),
          );
        }
      } catch (err) {
        toast.error(uiText('m_4bef5be9a8', { v0: getUiErrorMessage(err) }));
      } finally {
        clearOptimistic(action.id);
      }
    }, [
      action,
      approve,
      busy,
      clearOptimistic,
      markOptimistic,
      onAdvance,
      uiText,
      getUiErrorMessage,
    ]);

    const runReject = React.useCallback(
      async (reason: string) => {
        markOptimistic(action.id, 'reject');
        setRejectOpen(false);
        onAdvance();
        try {
          const result = await reject.mutateAsync({ ruleActionId: action.id, reason });
          if (!result.ok) {
            toast.error(uiText('m_49474675c1'));
          } else {
            toast.success(
              uiText('m_443110582b', { v0: String(actionTypeLabel(action.action_type)) }),
            );
          }
        } catch (err) {
          toast.error(uiText('m_49474675c1', { v0: getUiErrorMessage(err) }));
        } finally {
          clearOptimistic(action.id);
        }
      },
      [action, clearOptimistic, markOptimistic, onAdvance, reject, uiText, getUiErrorMessage],
    );

    React.useImperativeHandle(
      ref,
      () => ({
        approve: runApprove,
        openReject: () => setRejectOpen(true),
      }),
      [runApprove],
    );

    React.useEffect(() => {
      if (!bindGlobalKeys) return;
      function handler(event: KeyboardEvent) {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        )
          return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const key = event.key.toLowerCase();
        if (event.key === 'Enter' || key === 'a') {
          event.preventDefault();
          void runApprove();
        } else if (key === 'r') {
          event.preventDefault();
          setRejectOpen(true);
        }
      }
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [bindGlobalKeys, runApprove]);

    return (
      <>
        <motion.button
          type="button"
          onClick={runApprove}
          disabled={busy}
          whileTap={reduceMotion || busy ? undefined : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className={cn(buttonVariants({ size: 'lg' }), 'min-w-[10rem] gap-2')}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
          )}
          <span>{uiText('approve_6007acb')}</span>
        </motion.button>

        <RejectDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          onConfirm={runReject}
          busy={reject.isPending}
          actionLabel={actionTypeLabel(action.action_type)}
        />
      </>
    );
  },
);

export type { DecisionActionsHandle };
