'use client';

import type { ForgeAgentFrame, ForgeAgentRequest, ForgeAgentTool } from '@continuum/contracts';
import { Check, Send, Sparkles, Square, TriangleAlert, X } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useRef, useState, useMemo as useUiConfigMemo } from 'react';
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
import { useUiErrorMessage } from '@/i18n/errors';
import { streamForgeAgent } from '@/lib/api/forgeAgent.client';
import { cn } from '@/lib/utils';

function useLocalSuggestionsMessages() {
  const translateConfig = useUiTranslations('forge');
  return useUiConfigMemo(() => {
    const value = [
      { label: translateConfig('bigger_headline_5654c7e9'), prompt: 'Make the headline bigger.' },
      {
        label: translateConfig('blue_variant_80f5608f'),
        prompt: 'Recolour the background blue; keep everything else.',
      },
      {
        label: translateConfig('tidy_layout_f2aa2a3d'),
        prompt: 'Align the text layers to the centre of the composition.',
      },
    ] as const;
    return value;
  }, [translateConfig]);
}
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
};

/** How a turn folds its NDJSON frames. */
export function applyForgeAgentFrame(turn: ForgeAgentTurn, frame: ForgeAgentFrame): ForgeAgentTurn {
  switch (frame.type) {
    case 'text_delta':
      return { ...turn, text: turn.text + frame.data.text };
    case 'tool_start':
      return {
        ...turn,
        tools: [...turn.tools, { toolCallId: frame.data.toolCallId, tool: frame.data.tool }],
      };
    case 'tool_result':
      return {
        ...turn,
        tools: turn.tools.map((chip) =>
          chip.toolCallId === frame.data.toolCallId
            ? { ...chip, ok: frame.data.ok, summary: frame.data.summary }
            : chip,
        ),
      };
    case 'draft':
      return { ...turn, drafts: turn.drafts + 1 };
    case 'question':
      return { ...turn, question: frame.data };
    case 'done':
      return { ...turn, status: 'done' };
    case 'error':
      return {
        ...turn,
        status: frame.data.code === 'aborted' ? 'stopped' : 'error',
        error: frame.data.message,
      };
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
          className={cn(
            'gap-1 font-normal',
            chip.ok === false && 'border-destructive/50 text-destructive',
          )}
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
  compId,
  selectedNodeIds,
  prepare,
  onDraft,
  onRunningChange,
}: {
  assetId: string;
  brandId: string;
  baseVersionId: string;
  compId?: number;
  selectedNodeIds: readonly string[];
  /** Saves pending editor changes; the draft revision the agent starts from, or null to refuse. */
  prepare: () => Promise<number | null>;
  /** The agent saved a new draft revision. */
  onDraft: () => Promise<void>;
  onRunningChange: (running: boolean) => void;
}): React.ReactNode {
  const SUGGESTIONS = useLocalSuggestionsMessages();

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('forge');

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
    };
    const update = (change: (current: ForgeAgentTurn) => ForgeAgentTurn) =>
      setTurns((all) => all.map((entry) => (entry.id === turn.id ? change(entry) : entry)));
    const history = turns.slice(-HISTORY_TURNS).flatMap((prior) => [
      { role: 'user' as const, text: prior.prompt.slice(0, 8_000) },
      {
        role: 'assistant' as const,
        text:
          [prior.text, prior.question?.question, prior.error]
            .filter(Boolean)
            .join('\n')
            .slice(0, 8_000) || '…',
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
        prompt: prompt.slice(0, 8_000),
        history,
        selection: { nodeIds: selectedNodeIds.slice(0, 200) },
        ...(compId ? { compId } : {}),
        baseDraftRevision,
      };
      // Draft reloads run one after another, in frame order.
      let reloads = Promise.resolve();
      await streamForgeAgent({
        assetId,
        request,
        signal: controller.signal,
        onFrame: (frame) => {
          update((current) => applyForgeAgentFrame(current, frame));
          if (frame.type === 'draft') reloads = reloads.then(onDraft).catch(() => undefined);
        },
      });
      await reloads;
      update((current) =>
        current.status === 'running' ? { ...current, status: 'done' } : current,
      );
    } catch (error) {
      update((current) =>
        controller.signal.aborted
          ? { ...current, status: 'stopped' }
          : { ...current, status: 'error', error: uiErrorText(error) },
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
              title={translateUi('edit_by_asking_e4fb7bf0')}
              description={translateUi('retext_restyle_move_recolour_or_hid_7f06c09a')}
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
                        <Spinner className="size-3" /> {translateUi('working_5474eef8')}{' '}
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
                    {turn.drafts > 0 && turn.status !== 'running' ? (
                      <span className="text-xs text-muted-foreground">
                        {' '}
                        {translateUi('saved_to_your_draft_as_75926d7e')} {turn.drafts}{' '}
                        {translateUi('undo_step_21a9c1b9')}
                        {turn.drafts === 1 ? '' : 's'}.
                      </span>
                    ) : null}
                    {turn.status === 'stopped' ? (
                      <span className="text-xs text-muted-foreground">
                        {translateUi('stopped_f8ec77e7')}
                      </span>
                    ) : null}
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
              selectedNodeIds.length
                ? translateUi('ask_about_the_value0_selected_layer_2a2f8738', {
                    count: Number(selectedNodeIds.length),
                  })
                : translateUi('ask_the_template_agent_99175462')
            }
            aria-label={translateUi('ask_the_template_agent_3c2f9179')}
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
                aria-label={translateUi('stop_the_agent_624818d4')}
                onClick={() => abortRef.current?.abort()}
              >
                <Square />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={translateUi('send_f6f4688f')}
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
