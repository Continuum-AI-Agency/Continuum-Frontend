'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The buttons a decision card carries, one per control kind (decisionControl.ts). Approve opens
// the platform card's own approval: the platform checks the exact action first, a person
// confirms, and a write that lands leaves its Undo on the card. Dismiss records the
// recommendation as rejected. Copy reports what the clipboard did. A control with no wiring is
// a disabled button that says why, on hover and on focus.

import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  ExternalLinkIcon,
  LockIcon,
  PlusIcon,
  WrenchIcon,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PlatformCardActionControl } from '../../../platformCards/PlatformCardActionControl';
import type { CardWrite, PlatformCardAction } from '../../../platformCards/platformCardActionModel';
import { type DecisionControl, type DismissControl, QUEUED_NOTE } from './decisionControl';

export type DismissState = 'idle' | 'pending' | 'failed' | 'done';

/** A control that cannot run: the button, disabled, inside a focusable trigger whose tooltip
 *  says why. The reason is in the accessible text too, for a reader who never hovers. */
function WithReason({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="inline-flex rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="decision-control-reason"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the disabled control's reason has to be reachable by keyboard
            tabIndex={0}
          />
        }
      >
        {children}
        <span className="sr-only">{reason}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

function DisabledControl({
  label,
  reason,
  icon,
  testId,
}: {
  label: string;
  reason: string;
  icon?: ReactNode;
  testId: string;
}) {
  return (
    <WithReason reason={reason}>
      <Button data-testid={testId} disabled size="sm" type="button" variant="outline">
        {icon}
        {label}
      </Button>
    </WithReason>
  );
}

/** Approve mounts the platform card's control already open, so the dialog checks the action
 *  with the platform the moment it opens. The control stays mounted after it closes: once the
 *  write lands the card says "Applied" and the control's own Undo sits beside it, and Approve
 *  is gone, so a second press can never replace the control that holds the Undo. Cancelled,
 *  Approve opens a fresh check. */
function ApproveControl({
  write,
  target,
  currency,
  applied,
}: {
  write: CardWrite;
  target: PlatformCardAction;
  currency: string | null;
  applied: boolean;
}) {
  const betaUiText = useBetaTranslations('scale');

  const [round, setRound] = useState(0);
  return (
    <>
      {applied ? (
        <Badge data-testid="decision-applied" variant="success">
          <CheckIcon aria-hidden="true" />
          {betaUiText('beta_0c79a9c22284')}
        </Badge>
      ) : (
        <Button
          data-testid="decision-approve"
          onClick={() => setRound((current) => current + 1)}
          size="sm"
          type="button"
        >
          <CheckIcon aria-hidden="true" />
          {betaUiText('beta_6007acbe30b2')}
        </Button>
      )}
      {round > 0 ? (
        <PlatformCardActionControl
          currency={currency}
          key={round}
          portfolioId={target.portfolioId}
          recommendationId={target.recommendationId}
          startOpen
          write={write}
        />
      ) : null}
    </>
  );
}

const COPY_RESET_MS = 1800;

/** Copies the card's list. "Copied" only once the clipboard took it. */
function CopyListControl({ text }: { text: string }) {
  const betaUiText = useBetaTranslations('scale');

  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current != null) clearTimeout(timer.current);
    },
    [],
  );
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('No clipboard in this browser');
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), COPY_RESET_MS);
  };
  return (
    <Button
      data-state={state}
      data-testid="decision-copy"
      onClick={() => void copy()}
      size="sm"
      type="button"
      variant="outline"
    >
      {state === 'copied' ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      {state === 'copied'
        ? betaUiText('beta_8d525e5f158b')
        : state === 'failed'
          ? betaUiText('beta_d5cb934f8035')
          : betaUiText('beta_682fc8d38922')}
    </Button>
  );
}

export function DecisionControlView({
  control,
  currency,
  applied,
  hasSteps,
  stepsOpen,
  stepsId,
  onToggleSteps,
  onCreatePortfolio,
}: {
  control: DecisionControl;
  currency: string | null;
  /** The card's write landed in this session and has not been undone. */
  applied: boolean;
  /** A fix with steps opens them; one without goes straight to the platform. */
  hasSteps: boolean;
  stepsOpen: boolean;
  stepsId: string;
  onToggleSteps: () => void;
  onCreatePortfolio: () => void;
}) {
  const betaUiText = useBetaTranslations('scale');

  switch (control.kind) {
    case 'approve':
      return (
        <ApproveControl
          applied={applied}
          currency={currency}
          target={control.target}
          write={control.write}
        />
      );
    case 'queued':
      return (
        <WithReason reason={QUEUED_NOTE}>
          <Badge data-testid="decision-queued" variant="success">
            <ClockIcon aria-hidden="true" />
            {betaUiText('beta_661ff40a07e0')}
          </Badge>
        </WithReason>
      );
    case 'fix': {
      const variant = control.primary ? 'default' : 'outline';
      if (hasSteps) {
        return (
          <Button
            aria-controls={stepsId}
            aria-expanded={stepsOpen}
            data-testid="decision-fix"
            onClick={onToggleSteps}
            size="sm"
            type="button"
            variant={variant}
          >
            <WrenchIcon aria-hidden="true" />
            {control.label}
          </Button>
        );
      }
      return (
        <a
          className={cn(buttonVariants({ size: 'sm', variant }))}
          data-testid="decision-fix"
          href={control.href}
          rel="noopener noreferrer"
          target="_blank"
        >
          <WrenchIcon aria-hidden="true" />
          {control.label}
          <ExternalLinkIcon aria-hidden="true" />
        </a>
      );
    }
    case 'copy':
      return <CopyListControl text={control.text} />;
    case 'create':
      return (
        <Button data-testid="decision-create" onClick={onCreatePortfolio} size="sm" type="button">
          <PlusIcon aria-hidden="true" />
          {betaUiText('beta_a53487ce414c')}
        </Button>
      );
    case 'locked':
      return (
        <DisabledControl
          icon={<LockIcon aria-hidden="true" />}
          label={control.label}
          reason={control.reason}
          testId="decision-locked"
        />
      );
    case 'unavailable':
      return (
        <DisabledControl
          label={control.label}
          reason={control.reason}
          testId="decision-unavailable"
        />
      );
  }
}

export function DismissView({
  control,
  state,
  onDismiss,
}: {
  control: DismissControl;
  state: DismissState;
  onDismiss: (recommendationId: string) => void;
}) {
  const betaUiText = useBetaTranslations('scale');

  if (control.kind === 'unavailable') {
    return (
      <DisabledControl
        label={betaUiText('beta_48845bff334a')}
        reason={control.reason}
        testId="decision-dismiss"
      />
    );
  }
  const pending = state === 'pending';
  return (
    <>
      <Button
        aria-busy={pending}
        data-testid="decision-dismiss"
        disabled={pending}
        onClick={() => onDismiss(control.recommendationId)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {pending ? betaUiText('beta_fb6d39dff4c1') : betaUiText('beta_48845bff334a')}
      </Button>
      {state === 'failed' ? (
        <span className="text-destructive text-xs" role="status">
          {betaUiText('beta_79967d016707')}
        </span>
      ) : null}
    </>
  );
}
