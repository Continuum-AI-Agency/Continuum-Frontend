'use client';

import type { ForgeAgentFrame, ForgeAgentRequest, ForgeAgentTool } from '@continuum/contracts';
import { Check, Send, Sparkles, Square, TriangleAlert, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from '@/components/ai-elements/conversation';
import { Message } from '@/components/ai-elements/message';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { DraftChange } from '@/components/forge/draftChanges';
import { streamForgeAgent } from '@/lib/api/forgeAgent.client';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  { label: 'Bigger headline', prompt: 'Make the headline bigger.' },
  { label: 'Blue variant', prompt: 'Recolour the background blue; keep everything else.' },
  { label: 'Tidy layout', prompt: 'Align the text layers to the centre of the composition.' },
] as const;
const HISTORY_TURNS = 10;
const TOOL_LABEL: Record<ForgeAgentTool, string> = {
  read_template: 'Read the template',
  read_tool_result: 'Read more',
  apply_commands: 'Edit',
  ask_user: 'Question',
};

type ToolChip = { toolCallId: string; tool: ForgeAgentTool; ok?: boolean; summary?: string };
type Question = Extract<ForgeAgentFrame, { type: 'question' }>['data'];
export type ForgeAgentTurn = {
  id: string;
  prompt: string;
  text: string;
  tools: ToolChip[];
  question: Question | null;
  status: 'running' | 'done' | 'error' | 'stopped';
  error?: string;
  /** Draft revisions this turn saved: one undo step each in the editor. */
  drafts: number;
  /** Layers the turn's drafts touched, from the draft frames. */
  changedNodeIds: string[];
  /** What the turn changed, read from the draft once the turn ends. */
  changes?: DraftChange[];
  /** The person took the whole turn back ("Undo this turn"), or why they could not. */
  undo?: 'done' | 'blocked';
};

/** How a turn folds its NDJSON frames. */
export function applyForgeAgentFrame(turn: ForgeAgentTurn, frame: ForgeAgentFrame): ForgeAgentTurn {
  switch (frame.type) {
    case 'text_delta':
      return { ...turn, text: turn.text + frame.data.text };
    case 'tool_start':
      return { ...turn, tools: [...turn.tools, { toolCallId: frame.data.toolCallId, tool: frame.data.tool }] };
    case 'tool_result':
      return {
        ...turn,
        tools: turn.tools.map((chip) =>
          chip.toolCallId === frame.data.toolCallId ? { ...chip, ok: frame.data.ok, summary: frame.data.summary } : chip,
        ),
      };
    case 'draft':
      return {
        ...turn,
        drafts: turn.drafts + 1,
        changedNodeIds: [...new Set([...turn.changedNodeIds, ...frame.data.changedNodeIds, ...frame.data.createdNodeIds])],
      };
    case 'question':
      return { ...turn, question: frame.data };
    case 'done':
      return { ...turn, status: 'done' };
    case 'error':
      return { ...turn, status: frame.data.code === 'aborted' ? 'stopped' : 'error', error: frame.data.message };
    default:
      return turn;
  }
}

function ToolChips({ tools }: { tools: ToolChip[] }) {
  const shown = tools.filter((chip) => chip.tool !== 'read_tool_result');
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((chip) => (
        <Badge
          key={chip.toolCallId}
          variant="outline"
          className={cn('gap-1 font-normal', chip.ok === false && 'border-destructive/50 text-destructive')}
          title={chip.summary ?? TOOL_LABEL[chip.tool]}
        >
          {chip.ok === undefined ? (
            <Spinner className="size-3" />
          ) : chip.ok ? (
            <Check className="size-3" aria-hidden />
          ) : (
            <X className="size-3" aria-hidden />
          )}
          <span className="max-w-64 truncate">{chip.summary ?? TOOL_LABEL[chip.tool]}</span>
        </Badge>
      ))}
    </div>
  );
}

/**
 * The layer editor's agent (right pane). Each edit it makes is saved to the person's draft and
 * lands in the editor as one undo step; publishing stays the person's.
 */
export function ForgeAgentPanel({
  assetId,
  brandId,
  baseVersionId,
  workingCopyId,
  compId,
  selectedNodeIds,
  selectedLayerNames = [],
  prepare,
  onDraft,
  finishTurn,
  undoTurn,
  onRunningChange,
}: {
  assetId: string;
  brandId: string;
  baseVersionId: string;
  workingCopyId?: string;
  compId?: number;
  selectedNodeIds: readonly string[];
  /** The selected layers' names, in selection order. */
  selectedLayerNames?: readonly string[];
  /** Saves pending editor changes; the draft revision the agent starts from, or null to refuse. */
  prepare: () => Promise<number | null>;
  /** The agent saved a new draft revision. */
  onDraft: () => Promise<void>;
  /** The turn ended: what it changed on these layers, read from the editor's draft. */
  finishTurn?: (turnId: string, nodeIds: string[]) => DraftChange[];
  /** Puts the draft back as this turn found it, as one undo step; false once it has moved on. */
  undoTurn?: (turnId: string) => boolean;
  onRunningChange: (running: boolean) => void;
}): React.ReactNode {
  const [turns, setTurns] = useState<ForgeAgentTurn[]>([]);
  const [draft, setDraft] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const running = turns.at(-1)?.status === 'running';
  useEffect(() => {
    onRunningChange(running);
    return () => onRunningChange(false);
  }, [onRunningChange, running]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (raw: string) => {
    const prompt = raw.trim();
    if (!prompt || running) return;
    const turn: ForgeAgentTurn = {
      id: crypto.randomUUID(),
      prompt,
      text: '',
      tools: [],
      question: null,
      status: 'running',
      drafts: 0,
      changedNodeIds: [],
    };
    const update = (change: (current: ForgeAgentTurn) => ForgeAgentTurn) =>
      setTurns((all) => all.map((entry) => (entry.id === turn.id ? change(entry) : entry)));
    const history = turns.slice(-HISTORY_TURNS).flatMap((prior) => [
      { role: 'user' as const, text: prior.prompt.slice(0, 8_000) },
      {
        role: 'assistant' as const,
        text: [prior.text, prior.question?.question, prior.error].filter(Boolean).join('\n').slice(0, 8_000) || '…',
      },
    ]);
    setTurns((all) => [...all, turn]);
    setDraft('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const baseDraftRevision = await prepare();
      if (baseDraftRevision === null)
        throw new Error('Save or reconcile your draft first: the agent edits the saved draft.');
      const request: ForgeAgentRequest = {
        brandId,
        baseVersionId,
        ...(workingCopyId ? { workingCopyId } : {}),
        prompt: prompt.slice(0, 8_000),
        history,
        selection: { nodeIds: selectedNodeIds.slice(0, 200) },
        ...(compId ? { compId } : {}),
        baseDraftRevision,
      };
      // Draft reloads run one after another, in frame order.
      let reloads = Promise.resolve();
      const touched = new Set<string>();
      await streamForgeAgent({
        assetId,
        request,
        signal: controller.signal,
        onFrame: (frame) => {
          update((current) => applyForgeAgentFrame(current, frame));
          if (frame.type === 'draft') {
            for (const id of [...frame.data.changedNodeIds, ...frame.data.createdNodeIds]) touched.add(id);
            reloads = reloads.then(onDraft).catch(() => undefined);
          }
        },
      });
      await reloads;
      const changes = touched.size && finishTurn ? finishTurn(turn.id, [...touched]) : undefined;
      update((current) => ({ ...(current.status === 'running' ? { ...current, status: 'done' } : current), changes }));
    } catch (error) {
      update((current) =>
        controller.signal.aborted
          ? { ...current, status: 'stopped' }
          : { ...current, status: 'error', error: error instanceof Error ? error.message : 'The agent failed.' },
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="forge-agent-panel">
      <Conversation className="flex-1">
        <ConversationContent className="gap-4 p-3">
          {turns.length === 0 ? (
            <ConversationEmptyState
              icon={<Sparkles className="size-6" />}
              title="Edit by asking"
              description="Retext, restyle, move, recolour or hide layers. Every change is one undo step in your draft; you review and publish."
            />
          ) : (
            turns.map((turn) => (
              <div key={turn.id} className="flex flex-col gap-3">
                {/* biome-ignore lint/a11y/useValidAriaRole: `role` is the Message component's author prop, not an ARIA role */}
                <Message role="user">
                  <p className="whitespace-pre-wrap text-sm">{turn.prompt}</p>
                </Message>
                {/* biome-ignore lint/a11y/useValidAriaRole: `role` is the Message component's author prop, not an ARIA role */}
                <Message role="assistant">
                  <div className="flex flex-col gap-2 text-sm">
                    <ToolChips tools={turn.tools} />
                    {turn.text ? (
                      <SafeMarkdown content={turn.text} isAnimating={turn.status === 'running'} />
                    ) : turn.status === 'running' ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Spinner className="size-3" />
                        Working…
                      </span>
                    ) : null}
                    {turn.question ? (
                      <div className="flex flex-col gap-2" data-testid="forge-agent-question">
                        <p className="font-medium">{turn.question.question}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {turn.question.options.map((option) => (
                            <Button
                              key={option.label}
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              title={option.description}
                              disabled={running || turn !== turns.at(-1)}
                              onClick={() => void send(option.label)}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {turn.changes?.length && turn.status !== 'running' ? (
                      <ul aria-label="What this turn changed" className="flex flex-col gap-0.5 text-xs">
                        {turn.changes.map((change) => (
                          <li key={change.key} className="text-pretty">
                            <span className="font-medium">{change.name}</span>: {change.changes.join(', ')}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {turn.drafts > 0 && turn.status !== 'running' ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {turn.undo === 'done' ? (
                          <span>Turn undone. Redo brings it back.</span>
                        ) : (
                          <>
                            <span>Saved to your draft.</span>
                            {undoTurn ? (
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={running}
                                onClick={() => {
                                  const undone = undoTurn(turn.id);
                                  setTurns((all) => all.map((entry) => (entry.id === turn.id ? { ...entry, undo: undone ? 'done' : 'blocked' } : entry)));
                                }}
                              >
                                <Undo2 data-icon="inline-start" aria-hidden />
                                Undo this turn
                              </Button>
                            ) : null}
                          </>
                        )}
                        {turn.undo === 'blocked' ? (
                          <span>The draft changed after this turn; use Undo for those steps.</span>
                        ) : null}
                      </div>
                    ) : null}
                    {turn.status === 'stopped' ? <span className="text-xs text-muted-foreground">Stopped.</span> : null}
                    {turn.status === 'error' && turn.error ? (
                      <span className="flex items-start gap-2 text-destructive">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {turn.error}
                      </span>
                    ) : null}
                  </div>
                </Message>
              </div>
            ))
          )}
        </ConversationContent>
      </Conversation>
      <div className="flex flex-col gap-2 border-t p-3">
        <Suggestions>
          {SUGGESTIONS.map((suggestion) => (
            <Suggestion
              key={suggestion.label}
              suggestion={suggestion.prompt}
              onClick={(prompt) => void send(prompt)}
              disabled={running}
              className="h-7 px-3 text-xs"
            >
              {suggestion.label}
            </Suggestion>
          ))}
        </Suggestions>
        <div className="relative">
          <Textarea
            value={draft}
            placeholder={
              selectedLayerNames.length && selectedLayerNames.length <= 3
                ? `Ask about ${selectedLayerNames.join(', ')}…`
                : selectedNodeIds.length
                  ? `Ask about the ${selectedNodeIds.length} selected layer${selectedNodeIds.length === 1 ? '' : 's'}…`
                  : 'Ask the template agent…'
            }
            aria-label="Ask the template agent"
            className="min-h-16 resize-none pr-12 text-sm"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            data-testid="forge-agent-input"
          />
          <div className="absolute right-2 bottom-2">
            {running ? (
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Stop the agent"
                onClick={() => abortRef.current?.abort()}
              >
                <Square />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Send"
                disabled={!draft.trim()}
                onClick={() => void send(draft)}
              >
                <Send />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
