'use client';

import {
  resolveVideoEffects,
  type VideoEditorAgentRequest,
  type VideoEditorPoolAsset,
  type VideoEditorWorkflow,
  workflowSlug,
} from '@continuum/contracts';
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
import {
  useTranslations,
  useLocale as useUiLocale,
  useTranslations as useUiTranslations,
} from 'next-intl';
import { useEffect, useMemo, useRef, useState, useMemo as useUiConfigMemo } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from '@/components/ai-elements/conversation';
import { Message } from '@/components/ai-elements/message';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { SlashMenu, useSlashTextarea } from '@/components/chat/slash-menu';
import { appendDictation, DictationButton } from '@/components/dictation/DictationButton';
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
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useUiErrorMessage } from '@/i18n/errors';
import { streamVideoEditorAgent } from '@/lib/api/videoEditorAgent.client';
import { cn } from '@/lib/utils';
import { hasFootage } from '../brief/briefGoals';
import type { VideoStudioContext } from '../types';
import { effectOptions } from './effectOptions';
import {
  applyFrame,
  assetMention,
  clipMentions,
  type Mention,
  type ToolChip,
  type Turn,
  withMentionContext,
} from './turnState';

function useLocalSuggestionsMessages() {
  const translateConfig = useUiTranslations('studio');
  return useUiConfigMemo(() => {
    const value = [
      { label: translateConfig('cut_pauses_ded96bea'), prompt: 'Cut the pauses and dead air.' },
      { label: translateConfig('captions_43bf6af8'), prompt: 'Add word-timed captions.' },
      {
        label: translateConfig('cut_on_beat_0c5a4cf7'),
        prompt: 'Cut the picture to the beat of the music.',
      },
      { label: 'Make it TikTok', prompt: 'Make it TikTok.' },
    ] as const;
    return value;
  }, [translateConfig]);
}

/** Offered while the timeline has footage and no brief — the fastest way to a first cut. */
function useLocalFirstCutSuggestionMessages() {
  const translateConfig = useUiTranslations('studio');
  return useUiConfigMemo(() => {
    const value = {
      label: translateConfig('first_cut_3_variants_16402d5e'),
      prompt: 'Draft a first cut from this footage: 3 variants, 30 s each, with captions.',
    } as const;
    return value;
  }, [translateConfig]);
}

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
export function EditorAgentPanel({
  studio,
  onRunningChange,
}: {
  studio: VideoStudioContext;
  /** Told when a turn starts and ends (and false on unmount, which aborts the turn). */
  onRunningChange?: (running: boolean) => void;
}): React.ReactNode {
  const SUGGESTIONS = useLocalSuggestionsMessages();
  const FIRST_CUT_SUGGESTION = useLocalFirstCutSuggestionMessages();

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('studio');
  const displayLocale = useUiLocale();

  const uiText = useTranslations('common');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [pool, setPool] = useState<VideoEditorPoolAsset[] | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflows, setWorkflows] = useState<VideoEditorWorkflow[]>([]);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowError, setWorkflowError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const slashOptions = useMemo(() => effectOptions(workflows), [workflows]);
  const slash = useSlashTextarea(slashOptions, setDraft);
  const textareaRef = slash.ref;
  const running = turns.at(-1)?.status === 'running';
  useEffect(() => {
    onRunningChange?.(running);
    return () => onRunningChange?.(false);
  }, [onRunningChange, running]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Saved workflows feed the `/` menu; the house effects are there without them. The workspace
  // may hand a fresh runOp every render, so read it once on mount.
  const runOp = useRef(studio.runOp);
  runOp.current = studio.runOp;
  useEffect(() => {
    runOp
      .current('list_workflows', {})
      .then((result) => setWorkflows(result.workflows))
      .catch(() => undefined);
  }, []);

  const effectNames = (prompt: string) =>
    resolveVideoEffects(prompt, workflows).applied.map((effect) => effect.name);

  // The pool is read on first @-mention; an op not landed yet leaves only the clips.
  useEffect(() => {
    if (!mentionOpen || pool) return;
    setPool([]);
    studio
      .runOp('get_pool', {})
      .then((result) => setPool(result.assets))
      .catch(() => setPool([]));
  }, [mentionOpen, pool, studio]);

  const clips = useMemo(
    () => clipMentions(studio.project, displayLocale),
    [studio.project, displayLocale],
  );
  const assets = useMemo(
    () => (pool ?? []).map((asset) => assetMention(asset, translateUi)),
    [pool, translateUi],
  );

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
              error: uiErrorText(error),
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
          entry.id === turn.id ? { ...entry, error: uiErrorText(error) } : entry,
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

  const openWorkflows = async (open: boolean) => {
    setWorkflowOpen(open);
    if (!open) return;
    setWorkflowBusy(true);
    setWorkflowError('');
    try {
      setWorkflows((await studio.runOp('list_workflows', {})).workflows);
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'Could not load workflows.');
    } finally {
      setWorkflowBusy(false);
    }
  };

  const saveWorkflow = async () => {
    if (!workflowName.trim() || !draft.trim() || workflowBusy) return;
    setWorkflowBusy(true);
    setWorkflowError('');
    try {
      const { workflow } = await studio.runOp('save_workflow', {
        name: workflowName.trim(),
        prompt: draft.trim(),
      });
      setWorkflows((all) => [workflow, ...all]);
      setWorkflowName('');
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'Could not save workflow.');
    } finally {
      setWorkflowBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="editor-agent-panel">
      <Conversation className="flex-1">
        <ConversationContent className="gap-4 p-3 md:px-3 lg:px-3">
          {turns.length === 0 ? (
            <ConversationEmptyState
              icon={<Sparkles className="size-6" />}
              title={translateUi('edit_by_asking_e4fb7bf0')}
              description={translateUi('cut_pauses_add_captions_cut_to_the__63f34bb9')}
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
                        {effectNames(turn.prompt).length
                          ? translateUi('editing_with_value0_67b28889', {
                              value0: String(effectNames(turn.prompt).join(', ')),
                            })
                          : uiText('working_5474eef')}
                      </span>
                    ) : null}
                    {turn.status === 'stopped' ? (
                      <span className="text-xs text-muted-foreground">
                        {translateUi('stopped_f8ec77e7')}
                      </span>
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
                        <CornerUpLeft data-icon="inline-start" />{' '}
                        {translateUi('undo_this_turn_e2cd98c6')}{' '}
                      </Button>
                    ) : null}
                    {turn.undone ? (
                      <span className="text-xs text-muted-foreground">
                        {' '}
                        {translateUi('undone_restored_revision_6e48b105')} {turn.baseRevision}.
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
        <Popover open={workflowOpen} onOpenChange={(open) => void openWorkflows(open)}>
          <PopoverTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-fit text-xs"
                disabled={running}
              />
            }
          >
            {' '}
            {translateUi('saved_workflows_c30cdde1')}{' '}
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="flex w-80 flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {' '}
              {translateUi('reusable_instructions_for_the_curre_9496d555')}{' '}
            </p>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {workflowBusy ? (
                <Spinner className="size-4" />
              ) : workflows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {translateUi('no_saved_workflows_yet_7bebdd02')}
                </p>
              ) : (
                workflows.map((workflow) => (
                  <Button
                    key={workflow.id}
                    variant="ghost"
                    className="justify-start truncate"
                    title={workflow.prompt}
                    onClick={() => {
                      setDraft(workflow.prompt);
                      setMentions([]);
                      setWorkflowOpen(false);
                      requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                  >
                    <span className="truncate">{workflow.name}</span>
                    {workflowSlug(workflow.name) ? (
                      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                        /{workflowSlug(workflow.name)}
                      </span>
                    ) : null}
                  </Button>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Input
                aria-label={translateUi('workflow_name_43d40c5c')}
                placeholder={translateUi('name_this_prompt_d6666c98')}
                maxLength={100}
                value={workflowName}
                onChange={(event) => setWorkflowName(event.target.value)}
              />
              <Button
                size="sm"
                disabled={
                  workflowBusy ||
                  !workflowName.trim() ||
                  !draft.trim() ||
                  draft.trim().length > 2000
                }
                onClick={() => void saveWorkflow()}
              >
                {' '}
                {translateUi('save_prompt_7462a09b')}{' '}
              </Button>
            </div>
            {workflowError ? (
              <p role="alert" className="text-xs text-destructive">
                {workflowError}
              </p>
            ) : null}
          </PopoverContent>
        </Popover>
        <Suggestions>
          {(!studio.project.brief && hasFootage(studio.project)
            ? [FIRST_CUT_SUGGESTION, ...SUGGESTIONS]
            : SUGGESTIONS
          ).map((suggestion) => (
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
            {slash.menuProps ? <SlashMenu {...slash.menuProps} /> : null}
            <Textarea
              ref={textareaRef}
              value={draft}
              placeholder={translateUi('ask_the_editor_to_mention_for_effec_bcb1b21f')}
              className="min-h-16 resize-none pr-28 text-sm"
              onChange={(event) => {
                const { value, selectionStart } = event.target;
                setDraft(value);
                const typed = value.slice(0, selectionStart);
                if (/(^|\s)@$/.test(typed)) setMentionOpen(true);
              }}
              onSelect={slash.onSelect}
              onBlur={slash.close}
              onKeyDown={(event) => {
                if (slash.onKeyDown(event)) return;
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              data-testid="editor-agent-input"
            />
            <div className="absolute right-2 bottom-2 flex gap-1">
              <DictationButton
                disabled={running}
                onTranscript={(spoken) => setDraft((current) => appendDictation(current, spoken))}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={translateUi('mention_a_clip_or_asset_f1110b75')}
                onClick={() => setMentionOpen(true)}
              >
                <AtSign />
              </Button>
              {running ? (
                <Button
                  size="icon"
                  variant="outline"
                  className="size-7"
                  aria-label={uiText('stop_cae7d57')}
                  onClick={() => abortRef.current?.abort()}
                  data-testid="editor-agent-stop"
                >
                  <Square />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="size-7"
                  aria-label={uiText('send_f6f4688')}
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
              <CommandInput placeholder={translateUi('clips_and_assets_8e2b8674')} autoFocus />
              <CommandList>
                <CommandEmpty>{translateUi('nothing_to_mention_4c4455b2')}</CommandEmpty>
                {clips.length > 0 ? (
                  <CommandGroup heading={translateUi('clips_4b782ddc')}>
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
                  <CommandGroup heading={translateUi('assets_bd12731d')}>
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
