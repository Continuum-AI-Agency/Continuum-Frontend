'use client';

import { useTranslations } from 'next-intl';

// Steer an agent while it works: queue a note for its next step and watch it glide into the plan
// when the agent picks it up, or interrupt it now. The host owns the run — a picked-up note comes
// back as a plan step carrying the note's id, and that shared id is what carries the glide.

import { Check, CornerDownLeft, CornerDownRight, Square, User, X } from 'lucide-react';
import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { type FormEvent, useState } from 'react';
import {
  AgentArtifactCard,
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardHeader,
  AgentCardTitle,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardFooter } from '@/components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export type SteeringStepStatus = 'done' | 'running' | 'pending' | 'failed';
export type SteeringStep = {
  id: string;
  label: string;
  status: SteeringStepStatus;
  fromNote?: boolean;
};
export type SteeringNote = { id: string; text: string };

function StepNode({ status }: { status: SteeringStepStatus }) {
  return (
    <span
      aria-label={status}
      role="img"
      className={cn(
        'relative z-10 grid size-5 shrink-0 place-items-center rounded-full border bg-card',
        status === 'done' && 'border-success/40 bg-success/10 text-success',
        status === 'running' && 'border-primary/50 bg-primary/10 text-primary',
        status === 'pending' && 'border-dashed border-muted-foreground/50 text-muted-foreground',
        status === 'failed' && 'border-destructive/40 bg-destructive/10 text-destructive',
      )}
    >
      {status === 'done' && <Check className="size-3" />}
      {status === 'running' && <Spinner className="size-3" />}
      {status === 'failed' && <X className="size-3" />}
    </span>
  );
}

export function AgentSteering({
  steps,
  queued,
  running,
  onQueue,
  onRemove,
  onInterrupt,
  className,
}: {
  steps: SteeringStep[];
  queued: SteeringNote[];
  running: boolean;
  onQueue: (text: string) => void;
  onRemove?: (note: SteeringNote) => void;
  onInterrupt?: () => void;
  className?: string;
}) {
  const uiText = useTranslations('common');
  const [draft, setDraft] = useState('');
  const current = steps.find((s) => s.status === 'running');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !running) return;
    onQueue(text);
    setDraft('');
  };

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <LayoutGroup>
        <AgentArtifactCard className={cn('mt-0', className)}>
          <AgentCardHeader
            action={
              running ? (
                <StatusLabel tone="running">{uiText('running_f4ccae2')}</StatusLabel>
              ) : (
                <StatusLabel tone="failed">{uiText('m_51e9111b87')}</StatusLabel>
              )
            }
          >
            <AgentCardEyebrow label={uiText('m_00de387a1a')} />
            <AgentCardTitle>
              {current
                ? current.label
                : running
                  ? uiText('starting_bbe5fc3')
                  : uiText('m_50be3afcff')}
            </AgentCardTitle>
          </AgentCardHeader>
          <AgentCardBody className="flex flex-col gap-3 pt-3 pb-4">
            <ol aria-label={uiText('m_ae2f98a099')} className="flex flex-col">
              {steps.map((step, index) => (
                <motion.li
                  layout="position"
                  layoutId={`steer-${step.id}`}
                  key={step.id}
                  className="relative flex min-w-0 items-center gap-2.5 py-1"
                >
                  {index < steps.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute top-1/2 left-2.5 h-full w-0.5 -translate-x-1/2 rounded-full',
                        step.status === 'done' ? 'bg-success/40' : 'bg-foreground/10',
                      )}
                    />
                  )}
                  <StepNode status={step.status} />
                  <span
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-xs',
                      step.status === 'running' && 'bg-primary/5 font-medium',
                      step.status === 'done' && 'text-muted-foreground',
                      step.status === 'failed' && 'text-destructive',
                    )}
                  >
                    <span className="truncate">{step.label}</span>
                    {step.fromNote && (
                      <Badge variant="violet" className="px-1.5 text-3xs">
                        <User />
                        {uiText('m_dcd3b715eb')}
                      </Badge>
                    )}
                    {step.status === 'running' && (
                      <Badge variant="secondary" className="ml-auto px-1.5 text-3xs">
                        {uiText('m_e3b8204056')}
                      </Badge>
                    )}
                  </span>
                </motion.li>
              ))}
            </ol>
            {queued.length > 0 && (
              <section aria-label={uiText('m_234f0ba59b')} className="flex flex-col gap-1.5">
                <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
                  {uiText('m_aadc8884ea')}
                </h3>
                <ul className="flex flex-col gap-1">
                  {queued.map((note) => (
                    <motion.li
                      layout="position"
                      layoutId={`steer-${note.id}`}
                      key={note.id}
                      className="flex min-w-0 items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/[0.03] py-1 pr-1 pl-2 text-xs"
                    >
                      <CornerDownRight className="size-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate" title={note.text}>
                        {note.text}
                      </span>
                      {onRemove && (
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => onRemove(note)}
                          aria-label={uiText('m_bc84dfb369', { v0: String(note.text) })}
                        >
                          <X />
                        </Button>
                      )}
                    </motion.li>
                  ))}
                </ul>
              </section>
            )}
          </AgentCardBody>
          <CardFooter className="flex items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-3">
            <form onSubmit={submit} className="min-w-0 flex-1">
              <InputGroup className="h-8 bg-card">
                <InputGroupInput
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={!running}
                  placeholder={running ? uiText('m_debea8e4ee') : uiText('m_226ce7d789')}
                  aria-label={uiText('m_1ced700c32')}
                  className="text-xs"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText className="hidden text-3xs sm:flex">
                    <CornerDownLeft className="size-3" />
                  </InputGroupText>
                  <InputGroupButton
                    type="submit"
                    size="xs"
                    variant="default"
                    disabled={!running || draft.trim() === ''}
                  >
                    {uiText('m_d325fcd919')}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
            {onInterrupt && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!running}
                onClick={onInterrupt}
              >
                <Square data-icon="inline-start" className="fill-current" />
                {uiText('m_d5db454984')}
              </Button>
            )}
          </CardFooter>
        </AgentArtifactCard>
      </LayoutGroup>
    </MotionConfig>
  );
}
