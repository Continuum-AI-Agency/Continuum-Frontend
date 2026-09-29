'use client';

import type { VideoEditorAgentRequest, VideoEditorPoolAsset } from '@continuum/contracts';
import {
  AtSign,
  Check,
  CornerUpLeft,
  Send,
  Sparkles,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from '@/components/ai-elements/conversation';
import { Message } from '@/components/ai-elements/message';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { streamVideoEditorAgent } from '@/lib/api/videoEditorAgent.client';
import { cn } from '@/lib/utils';
import type { VideoStudioContext } from '../types';
import {
  applyFrame,
  assetMention,
  clipMentions,
  type Mention,
  type ToolChip,
  type Turn,
  withMentionContext,
} from './turnState';

const SUGGESTIONS = [
  { label: 'Cut pauses', prompt: 'Cut the pauses and dead air.' },
  { label: 'Captions', prompt: 'Add word-timed captions.' },
  { label: 'Cut on beat', prompt: 'Cut the picture to the beat of the music.' },
  { label: 'Make it TikTok', prompt: 'Make it TikTok.' },
] as const;

const HISTORY_TURNS = 10;
const humanize = (op: string) => op.replaceAll('_', ' ');

function ToolChips({ tools }: { tools: ToolChip[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tools.map((chip) => (
        <Badge
          key={chip.toolCallId}
          variant="outline"
          className={cn(
            'gap-1 font-normal',
            chip.ok === false && 'border-destructive/50 text-destructive',
          )}
          title={humanize(chip.op)}
        >
          {chip.ok === undefined ? (
            <Spinner className="size-3" />
          ) : chip.ok ? (
            <Check className="size-3" aria-hidden />
          ) : (
            <X className="size-3" aria-hidden />
          )}
          <span className="max-w-64 truncate">{chip.summary ?? humanize(chip.op)}</span>
        </Badge>
      ))}
    </div>
  );
}

// The in-editor agent chat (right dock): a streaming turn per prompt whose edits are
// committed revisions — the timeline refetches on every `project_revision` frame.
export function EditorAgentPanel({ studio }: { studio: VideoStudioContext }): React.ReactNode {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [pool, setPool] = useState<VideoEditorPoolAsset[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const running = turns.at(-1)?.status === 'running';

  useEffect(() => () => abortRef.current?.abort(), []);

  // The pool is read on first @-mention; an op not landed yet leaves only the clips.
  useEffect(() => {
    if (!mentionOpen || pool) return;
    setPool([]);
    studio
      .runOp('get_pool', {})
      .then((result) => setPool(result.assets))
      .catch(() => setPool([]));
  }, [mentionOpen, pool, studio]);

  const clips = useMemo(() => clipMentions(studio.project), [studio.project]);
  const assets = useMemo(() => (pool ?? []).map(assetMention), [pool]);

  const send = async (raw: string) => {
    const prompt = raw.trim();
    if (!prompt || running) return;
    const turn: Turn = {
      id: crypto.randomUUID(),
      prompt,
      text: '',
      tools: [],
      status: 'running',
      baseRevision: studio.project.revision,
      committed: false,
      undone: false,
    };
    const history = turns.slice(-HISTORY_TURNS).flatMap((prior) => [
      { role: 'user' as const, text: prior.prompt.slice(0, 8_000) },
      { role: 'assistant' as const, text: (prior.text || prior.error || '…').slice(0, 8_000) },
    ]);
    const request: VideoEditorAgentRequest = {
      prompt: withMentionContext(prompt, mentions).slice(0, 8_000),
      history,
      selection: {
        clipIds: studio.selection.clipIds.slice(0, 100),
        ...(studio.selection.rangeSec ? { rangeSec: studio.selection.rangeSec } : {}),
      },
      playheadSec: Math.max(0, studio.playheadSec),
      baseRevision: turn.baseRevision,
    };
    const update = (change: (current: Turn) => Turn) =>
      setTurns((all) => all.map((entry) => (entry.id === turn.id ? change(entry) : entry)));

    setTurns((all) => [...all, turn]);
    setDraft('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamVideoEditorAgent({
        projectId: studio.projectId,
        request,
        signal: controller.signal,
        onFrame: (frame) => {
          update((current) => applyFrame(current, frame));
          if (frame.type === 'project_revision') void studio.refresh();
        },
      });
      update((current) =>
        current.status === 'running' ? { ...current, status: 'done' } : current,
      );
    } catch (error) {
      update((current) =>
        controller.signal.aborted
          ? { ...current, status: 'stopped' }
          : {
              ...current,
              status: 'error',
              error: error instanceof Error ? error.message : 'The editor agent failed.',
            },
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const undoTurn = async (turn: Turn) => {
    try {
      await studio.runOp('undo', { toRevision: turn.baseRevision });
      setTurns((all) =>
        all.map((entry) => (entry.id === turn.id ? { ...entry, undone: true } : entry)),
      );
    } catch (error) {
      setTurns((all) =>
        all.map((entry) =>
          entry.id === turn.id
            ? { ...entry, error: error instanceof Error ? error.message : 'Undo failed.' }
            : entry,
        ),
      );
    }
  };

  const insertMention = (mention: Mention) => {
    const element = textareaRef.current;
    const caret = element?.selectionStart ?? draft.length;
    // The '@' that opened the picker is already typed; the token supplies its own.
    const before = draft.slice(0, caret).replace(/@$/, '');
    setDraft(`${before}${mention.token} ${draft.slice(caret)}`);
    setMentions((all) => [...all.filter((entry) => entry.token !== mention.token), mention]);
    setMentionOpen(false);
    requestAnimationFrame(() => element?.focus());
  };

  const lastCommitted = [...turns].reverse().find((turn) => turn.committed && !turn.undone);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="editor-agent-panel">
      <Conversation className="flex-1">
        <ConversationContent className="gap-4 p-3 md:px-3 lg:px-3">
          {turns.length === 0 ? (
            <ConversationEmptyState
              icon={<Sparkles className="size-6" />}
              title="Edit by asking"
              description="Cut pauses, add captions, cut to the beat, reformat — every change is one undo away."
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
                        <Spinner className="size-3" /> Working…
                      </span>
                    ) : null}
                    {turn.status === 'stopped' ? (
                      <span className="text-xs text-muted-foreground">Stopped.</span>
                    ) : null}
                    {turn.error ? (
                      <span className="flex items-start gap-2 text-destructive">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {turn.error}
                      </span>
                    ) : null}
                    {turn === lastCommitted && turn.status !== 'running' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-fit px-2 text-xs"
                        onClick={() => void undoTurn(turn)}
                        data-testid="editor-agent-undo-turn"
                      >
                        <CornerUpLeft data-icon="inline-start" />
                        Undo this turn
                      </Button>
                    ) : null}
                    {turn.undone ? (
                      <span className="text-xs text-muted-foreground">
                        Undone — restored revision {turn.baseRevision}.
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

        <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
          <PopoverAnchor className="relative">
            <Textarea
              ref={textareaRef}
              value={draft}
              placeholder="Ask the editor… (@ to mention a clip or asset)"
              className="min-h-16 resize-none pr-20 text-sm"
              onChange={(event) => {
                const { value, selectionStart } = event.target;
                setDraft(value);
                const typed = value.slice(0, selectionStart);
                if (/(^|\s)@$/.test(typed)) setMentionOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              data-testid="editor-agent-input"
            />
            <div className="absolute right-2 bottom-2 flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Mention a clip or asset"
                onClick={() => setMentionOpen(true)}
              >
                <AtSign />
              </Button>
              {running ? (
                <Button
                  size="icon"
                  variant="outline"
                  className="size-7"
                  aria-label="Stop"
                  onClick={() => abortRef.current?.abort()}
                  data-testid="editor-agent-stop"
                >
                  <Square />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="size-7"
                  aria-label="Send"
                  disabled={!draft.trim()}
                  onClick={() => void send(draft)}
                >
                  <Send />
                </Button>
              )}
            </div>
          </PopoverAnchor>
          <PopoverContent side="top" align="start" className="w-72 p-0">
            <Command>
              <CommandInput placeholder="Clips and assets…" autoFocus />
              <CommandList>
                <CommandEmpty>Nothing to mention.</CommandEmpty>
                {clips.length > 0 ? (
                  <CommandGroup heading="Clips">
                    {clips.map((mention) => (
                      <CommandItem
                        key={mention.id}
                        value={`${mention.token} ${mention.id}`}
                        onSelect={() => insertMention(mention)}
                      >
                        <span className="truncate">{mention.token}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {mention.detail}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {assets.length > 0 ? (
                  <CommandGroup heading="Assets">
                    {assets.map((mention) => (
                      <CommandItem
                        key={mention.id}
                        value={`${mention.token} ${mention.id}`}
                        onSelect={() => insertMention(mention)}
                      >
                        <span className="truncate">{mention.token}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {mention.detail}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
