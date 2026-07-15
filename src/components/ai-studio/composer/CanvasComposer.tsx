'use client';

import {
  ArrowUpIcon,
  ChatBubbleIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  MagicWandIcon,
  PlayIcon,
  TrashIcon,
} from '@radix-ui/react-icons';
import { type KeyboardEvent, useState } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message } from '@/components/ai-elements/message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { StarterPickerButton } from './StarterPickerButton';
import {
  type CanvasComposerState,
  type ComposerTurn,
  useCanvasComposer,
} from './useCanvasComposer';

// The prompt surface for the Canvas Composer.
//
// Collapsed it is a slim bar: each prompt is an independent, memory-less turn —
// fire and forget. EXPANDING it opens the chat: the transcript becomes visible
// and, from then on, rides along as the next prompt's history. Memory is the
// expansion, nothing else; collapse and the next turn is one-shot again.
//
// It shows what the agent is doing but never renders the graph — the nodes appear
// on the canvas itself, via the realtime merge, as the agent writes them.

const EXAMPLES = [
  'A hero image of our product on wet concrete, then animate it into a 6s clip',
  'Three-shot reel: pull a reference from the library, generate two more, cut them together',
  'A prompt box feeding an image generator, ready for me to fill in',
];

interface CanvasComposerProps {
  brandProfileId?: string;
  roomId?: string;
  /** Whether the canvas currently has any nodes — decides hero vs bar. */
  isCanvasEmpty: boolean;
  selectedNodeIds: string[];
  onRun: () => void;
  className?: string;
}

export function CanvasComposer({
  brandProfileId,
  roomId,
  isCanvasEmpty,
  selectedNodeIds,
  onRun,
  className,
}: CanvasComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [expanded, setExpanded] = useState(false);
  const { state, turns, submit, cancel, clear } = useCanvasComposer(brandProfileId, roomId);

  const isRunning = state.status === 'running';
  const canSubmit = Boolean(brandProfileId && roomId && prompt.trim() && !isRunning);

  const handleSubmit = () => {
    if (!canSubmit) return;
    void submit(prompt, selectedNodeIds, { remember: expanded });
    setPrompt('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const hero = isCanvasEmpty && state.status === 'idle' && !expanded;

  const inputRow = (
    <div className="flex items-end gap-2 p-2">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setExpanded((value) => !value)}
        aria-label={expanded ? 'Collapse composer chat' : 'Expand composer chat'}
        aria-expanded={expanded}
        data-testid="composer-expand"
        className="mb-1 shrink-0 text-muted-foreground"
      >
        {expanded ? <Cross2Icon /> : <ChatBubbleIcon />}
      </Button>
      <StarterPickerButton brandProfileId={brandProfileId} />
      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isRunning}
        rows={hero ? 2 : 1}
        aria-label="Describe the workflow you want on the canvas"
        placeholder={
          selectedNodeIds.length > 0
            ? `Change the ${selectedNodeIds.length} selected node${selectedNodeIds.length > 1 ? 's' : ''}…`
            : 'e.g. a hero image of the new sneaker, animated into a 6s clip'
        }
        className="min-h-0 resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0"
      />
      <Button
        size="icon"
        onClick={handleSubmit}
        disabled={!canSubmit}
        aria-label="Build this workflow"
        className="mb-1 shrink-0"
      >
        <ArrowUpIcon />
      </Button>
    </div>
  );

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4',
        hero ? 'top-1/2 -translate-y-1/2' : 'bottom-6',
        className,
      )}
    >
      <div className="pointer-events-auto w-full max-w-2xl">
        {hero ? (
          <div className="mb-4 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              Describe the workflow you want
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Continuum lays out the nodes, wires them up, and pulls in your creative. You press
              Run.
            </p>
          </div>
        ) : null}

        {expanded ? (
          <div className="flex h-[26rem] flex-col rounded-xl border bg-background/95 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <MagicWandIcon className="size-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">Composer</span>
              <Badge variant="secondary">remembers this chat</Badge>
              <div className="ml-auto">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={clear}
                  disabled={turns.length === 0}
                  aria-label="Clear the conversation"
                  className="size-7 text-muted-foreground"
                >
                  <TrashIcon />
                </Button>
              </div>
            </div>

            <Conversation className="min-h-0 flex-1">
              <ConversationContent className="flex flex-col gap-3 p-3">
                {turns.length === 0 ? (
                  <ConversationEmptyState
                    icon={<MagicWandIcon className="size-10" aria-hidden />}
                    title="Compose on the canvas"
                    description="Prompts sent from here share this conversation as context."
                  />
                ) : (
                  turns.map((turn, index) => (
                    <TurnMessages
                      key={turn.id}
                      turn={turn}
                      isLast={index === turns.length - 1}
                      onRun={onRun}
                      onCancel={cancel}
                    />
                  ))
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="border-t">{inputRow}</div>
          </div>
        ) : (
          <>
            <ComposerProgress state={state} onDismiss={cancel} onRun={onRun} />
            <div className="rounded-xl border bg-background/95 shadow-lg backdrop-blur">
              {inputRow}
            </div>
          </>
        )}

        {hero ? (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="rounded-full border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TurnMessages({
  turn,
  isLast,
  onRun,
  onCancel,
}: {
  turn: ComposerTurn;
  isLast: boolean;
  onRun: () => void;
  onCancel: () => void;
}) {
  const { state } = turn;
  const latestStep = state.steps.at(-1);

  return (
    <>
      {/* biome-ignore lint/a11y/useValidAriaRole: `role` is the Message component's author prop (house ai-elements API), not an ARIA role */}
      <Message role="user">
        <p className="text-sm">{turn.prompt}</p>
      </Message>
      {/* biome-ignore lint/a11y/useValidAriaRole: `role` is the Message component's author prop (house ai-elements API), not an ARIA role */}
      <Message role="assistant">
        <div className="flex flex-col gap-1.5 text-sm">
          {state.status === 'running' ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
              {latestStep ?? 'Thinking…'}
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                className="h-6 px-2 text-xs text-muted-foreground"
              >
                Stop
              </Button>
            </span>
          ) : null}

          {state.status === 'error' ? (
            <span className="flex items-start gap-2 text-destructive">
              <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {state.error}
            </span>
          ) : null}

          {state.status === 'done' ? <p>{state.summary || 'Done.'}</p> : null}

          {state.warnings.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {state.warnings.map((warning) => (
                <li key={warning} className="text-xs text-amber-600 dark:text-amber-500">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}

          {state.graph ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {state.graph.nodeCount} node{state.graph.nodeCount === 1 ? '' : 's'} ·{' '}
                {state.graph.edgeCount} connection{state.graph.edgeCount === 1 ? '' : 's'} on the
                canvas
              </span>
              {isLast && state.status === 'done' ? (
                <Button size="sm" variant="outline" onClick={onRun} className="h-6 px-2 text-xs">
                  <PlayIcon data-icon="inline-start" />
                  Run
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Message>
    </>
  );
}

function ComposerProgress({
  state,
  onDismiss,
  onRun,
}: {
  state: CanvasComposerState;
  onDismiss: () => void;
  onRun: () => void;
}) {
  if (state.status === 'idle') return null;

  const latestStep = state.steps.at(-1);

  return (
    <div className="mb-2 rounded-xl border bg-background/95 p-3 text-sm shadow-lg backdrop-blur">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {state.status === 'running' ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
              {latestStep ?? 'Thinking…'}
            </p>
          ) : null}

          {state.status === 'error' ? (
            <p className="flex items-start gap-2 text-destructive">
              <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {state.error}
            </p>
          ) : null}

          {state.status === 'done' && state.summary ? (
            <p className="text-foreground">{state.summary}</p>
          ) : null}

          {state.graph ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {state.graph.nodeCount} node{state.graph.nodeCount === 1 ? '' : 's'} ·{' '}
              {state.graph.edgeCount} connection{state.graph.edgeCount === 1 ? '' : 's'} on the
              canvas
            </p>
          ) : null}

          {state.warnings.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {state.warnings.map((warning) => (
                <li key={warning} className="text-xs text-amber-600 dark:text-amber-500">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {state.status === 'done' && state.graph ? (
            <Button size="sm" onClick={onRun}>
              <PlayIcon data-icon="inline-start" />
              Run
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            onClick={onDismiss}
            aria-label={state.status === 'running' ? 'Stop the composer' : 'Dismiss'}
            className="size-7"
          >
            <Cross2Icon />
          </Button>
        </div>
      </div>
    </div>
  );
}
