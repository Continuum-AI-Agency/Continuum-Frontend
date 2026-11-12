'use client';
import type { AgentMentionReference } from '@continuum/contracts';
import { Gem, MessageCircle, Play, Trash2, TriangleAlert, Wand2, Workflow, X } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { AgentDelegatedCard } from '@/components/agents/AgentDelegatedCard';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message } from '@/components/ai-elements/message';
import { elementCategoryLabel } from '@/components/ai-studio/elements/elementPresentation';
import {
  buildAgentAttachmentContext,
  buildInlineTextContextBlock,
  mergeAttachmentReferences,
} from '@/components/chat/attachmentReferences';
import { ChatMarker } from '@/components/chat/ChatMarker';
import { ChatMediaGrid } from '@/components/chat/media/ChatMedia';
import { mediaFromPersistedAttachments } from '@/components/chat/media/media';
import { MentionifiedText } from '@/components/chat/mentionified-text';
import { PromptInput } from '@/components/chat/prompt-input';
import { TraceStep, type TraceStepStatus } from '@/components/chat/TraceStep';
import { useChatAttachments } from '@/components/chat/useChatAttachments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trace } from '@/components/ui/trace';
import { isSessionStreaming, useAgentRunStore } from '@/lib/agents/runStore';
import { type ElementRecord, getElement, useElements } from '@/lib/ai-studio/elements';
import { warmLaya } from '@/lib/api/layaWarm';
import { useBrandSkills } from '@/lib/organic/skills';
import { cn } from '@/lib/utils';
import { LoadWorkflowDialog } from '@/StudioCanvas/components/LoadWorkflowDialog';
import { createCanvasComposerMentionProvider } from './canvasContextProvider';
import {
  expandElementMentions,
  readElementMention,
  refreshElementMentions,
} from './elementMentions';
import { PipelineProposalCard } from './PipelineProposalCard';
import {
  type CanvasComposerState,
  type ComposerPipelineProposal,
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
// It shows what the agent is doing but never renders the graph — committed patches
// appear on the canvas immediately, then Realtime confirms the durable state.

// `useElements` hands back a fresh `[]` until its query resolves. Swapping in one
// stable empty array keeps the mention provider (and its one-read signals cache)
// from being rebuilt on every render while the Elements load.
const NO_ELEMENTS: ElementRecord[] = [];

/** How many saved flows may ride along as reference in one turn. */
const MAX_ATTACHED_WORKFLOWS = 3;

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
  /** Whether the Team chat panel is open, so the bar can clear its footprint. */
  chatOpen?: boolean;
  onRun: () => void;
  className?: string;
}

export function CanvasComposer({
  brandProfileId,
  roomId,
  isCanvasEmpty,
  selectedNodeIds,
  chatOpen = false,
  onRun,
  className,
}: CanvasComposerProps) {
  const translateUi = useUiTranslations('studio');
  const mediaText = useUiTranslations('library');

  const [expanded, setExpanded] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [queuedText, setQueuedText] = useState<string | null>(null);
  const [workflowPickerOpen, setWorkflowPickerOpen] = useState(false);
  // Saved flows the user pointed at, as REFERENCE. Nothing lands on the canvas — the row's
  // menu still offers that separately. Kept as {id,label} rather than the whole row: only
  // the id crosses the wire, and the Backend re-reads the graph brand-scoped anyway.
  const [attachedWorkflows, setAttachedWorkflows] = useState<{ id: string; label: string }[]>([]);
  const composerAttachments = useChatAttachments({
    brandId: brandProfileId,
    sessionId: roomId,
  });
  const { state, turns, submit, cancel, clear, dismiss, resolvePipelineProposal } =
    useCanvasComposer(brandProfileId, roomId);

  // Pressing Run hands the graph to the canvas executor, which then owns the
  // feedback (node spinners, or a preflight toast naming the blocked node). The
  // composer card has said everything it has to say, so it retires — leaving it
  // up made a run that was genuinely executing look like a dead button.
  const runAndRetireCard = useCallback(() => {
    dismiss();
    onRun();
  }, [dismiss, onRun]);

  const attachWorkflow = useCallback((workflow: { id: string; name: string }) => {
    setAttachedWorkflows((current) =>
      current.some((item) => item.id === workflow.id)
        ? current
        : // An outline is far heavier than a skill id, so this caps well below the wire's
          // 20-reference limit. Three flows is already a lot to hold beside the canvas the
          // agent is being shown.
          [...current, { id: workflow.id, label: workflow.name }].slice(-MAX_ATTACHED_WORKFLOWS),
    );
  }, []);
  const { all: brandSkills } = useBrandSkills(brandProfileId);
  const { elements } = useElements(brandProfileId);
  const elementCatalog = elements.length > 0 ? elements : NO_ELEMENTS;
  const mentionProvider = useMemo(
    () =>
      brandProfileId
        ? createCanvasComposerMentionProvider({
            brandId: brandProfileId,
            skills: brandSkills,
            elements: elementCatalog,
            uiText: translateUi,
            mediaText,
          })
        : undefined,
    [brandProfileId, brandSkills, elementCatalog, translateUi, mediaText],
  );

  // A run started before this mount (navigation away and back) lives only in the
  // app-level store — the local turn state is idle even though the model is still
  // working the room. Treat it as running so Stop works and hero stays hidden.
  const roomRunStreaming = useAgentRunStore(roomId ? isSessionStreaming(roomId) : () => false);
  const isRunning = state.status === 'running' || roomRunStreaming;

  const hero = isCanvasEmpty && state.status === 'idle' && !expanded && !roomRunStreaming;

  const attachedRow = attachedWorkflows.length > 0 && (
    <div className="flex flex-wrap items-center gap-1 px-1 pb-1">
      {attachedWorkflows.map((workflow) => (
        <Badge key={workflow.id} variant="muted" className="gap-1 pr-1">
          <Workflow className="size-3" aria-hidden />
          <span className="max-w-40 truncate">{workflow.label}</span>
          <button
            type="button"
            aria-label={translateUi('remove_value0_from_context_8ac559a9', {
              value0: String(workflow.label),
            })}
            className="rounded-full p-0.5 hover:bg-foreground/10"
            onClick={() =>
              setAttachedWorkflows((current) => current.filter((item) => item.id !== workflow.id))
            }
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );

  const promptInput = (
    <PromptInput
      variant="canvas"
      disabled={!brandProfileId || !roomId}
      // Wakes the Laya decision service behind the composer's fast path: a cold instance
      // takes ~90s to load, so waiting for the first edit means that edit always falls back.
      onFocus={() => warmLaya()}
      isStreaming={isRunning}
      onStop={cancel}
      mentionProvider={mentionProvider}
      mentionSource="canvas"
      slashSkills={brandProfileId ? brandSkills : undefined}
      attachments={composerAttachments}
      inlinePastedText
      attachmentOnlyPrompt="Use the attached media as a visual reference."
      queuedText={queuedText}
      onQueuedTextConsumed={() => setQueuedText(null)}
      onSubmit={async (value, submittedAttachments, references) => {
        const attachmentContext = buildAgentAttachmentContext(submittedAttachments, 'canvas');
        const resolvedReferences = mergeAttachmentReferences(
          references,
          submittedAttachments,
          'canvas',
        );
        // An Element mention arrives holding ONE ref; a fallback Element still owes
        // the rest of its members, and every Element owes the model a line saying
        // what its image is.
        const grounded = expandElementMentions(
          await refreshElementMentions(resolvedReferences, (elementId) =>
            getElement(brandProfileId as string, elementId),
          ),
        );
        // Attached flows join the same `references` array the @-grabber fills: the Backend
        // resolver reads one list, so a second channel would be a second thing to keep in
        // step for no gain.
        const workflowReferences: AgentMentionReference[] = attachedWorkflows.map((workflow) => ({
          id: workflow.id,
          type: 'workflow',
          label: workflow.label,
          source: 'canvas',
        }));
        await submit(value, selectedNodeIds, {
          remember: expanded,
          attachments: attachmentContext.attachments,
          references: [...grounded.references, ...workflowReferences],
          thinking,
          ...(grounded.grounding ? { grounding: grounded.grounding } : {}),
          ...(grounded.styleSlugs.length ? { styleSlugs: grounded.styleSlugs } : {}),
          pastedText: buildInlineTextContextBlock(attachmentContext.inlineTexts),
        });
      }}
      ariaLabel={translateUi('canvasWorkflowDescription')}
      placeholder={
        selectedNodeIds.length > 0
          ? translateUi('change_the_value0_selected_node_val_66799e94', {
              count: Number(selectedNodeIds.length),
            })
          : translateUi('describe_a_workflow_for_skills_elem_0ce06e4b')
      }
      actions={
        <>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setWorkflowPickerOpen(true)}
            aria-label={translateUi('attach_a_saved_workflow_as_context_f5e2266a')}
            title={translateUi('attach_a_saved_workflow_as_context_f5e2266a')}
            className="size-8 shrink-0 text-muted-foreground"
            type="button"
          >
            <Workflow />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setExpanded((value) => !value)}
            aria-label={
              expanded
                ? translateUi('collapse_composer_chat_bfd95037')
                : translateUi('expand_composer_chat_7e104f76')
            }
            aria-expanded={expanded}
            data-testid="composer-expand"
            className="size-8 shrink-0 text-muted-foreground"
            type="button"
          >
            {expanded ? <X /> : <MessageCircle />}
          </Button>
          <Button
            size="sm"
            variant={thinking ? 'secondary' : 'ghost'}
            aria-label={
              thinking
                ? translateUi('disable_deeper_thinking_33444b39')
                : translateUi('enable_deeper_thinking_86ae9cdb')
            }
            aria-pressed={thinking}
            title={
              thinking
                ? translateUi('thinking_mode_maximum_reasoning_556f457c')
                : translateUi('fast_mode_low_reasoning_f9c3a6ee')
            }
            onClick={() => setThinking((value) => !value)}
            className="h-8 px-2 text-xs"
            type="button"
          >
            {thinking ? translateUi('thinking_a20d12c5') : translateUi('fast_6c582b62')}
          </Button>
        </>
      }
    />
  );

  const inputRow = (
    <>
      {attachedRow}
      {promptInput}
      <LoadWorkflowDialog
        brandProfileId={brandProfileId}
        open={workflowPickerOpen}
        onOpenChange={setWorkflowPickerOpen}
        showTrigger={false}
        onAttachWorkflow={attachWorkflow}
      />
    </>
  );

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4',
        hero ? 'top-1/2 -translate-y-1/2' : 'bottom-6',
        // Reserve the Team chat panel's bottom-right footprint (~400px) when it is
        // open so the two overlays never overlap or steal each other's clicks.
        chatOpen && !hero ? 'md:pr-[26rem]' : '',
        className,
      )}
    >
      <div className="pointer-events-auto w-full max-w-2xl">
        {hero ? (
          <div className="mb-4 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              {' '}
              {translateUi('describe_the_workflow_you_want_78fecafd')}{' '}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {' '}
              {translateUi('continuum_lays_out_the_nodes_wires__ba3aa826')}{' '}
            </p>
          </div>
        ) : null}

        {expanded ? (
          <div className="flex h-[26rem] flex-col rounded-xl border bg-background/95 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Wand2 className="size-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">{translateUi('composer_9cb2832c')}</span>
              <Badge variant="secondary">{translateUi('remembers_this_chat_2e375a38')}</Badge>
              <div className="ml-auto">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={clear}
                  disabled={turns.length === 0}
                  aria-label={translateUi('clear_the_conversation_908c0aa7')}
                  className="size-7 text-muted-foreground"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <Conversation className="min-h-0 flex-1">
              <ConversationContent className="flex flex-col gap-3 p-3">
                {turns.length === 0 ? (
                  <ConversationEmptyState
                    icon={<Wand2 className="size-10" aria-hidden />}
                    title={translateUi('compose_on_the_canvas_5684633b')}
                    description={translateUi('prompts_sent_from_here_share_this_c_923f3a02')}
                  />
                ) : (
                  turns.map((turn, index) => (
                    <TurnMessages
                      key={turn.id}
                      turn={turn}
                      isLast={index === turns.length - 1}
                      onRun={runAndRetireCard}
                      onCancel={cancel}
                      onResolveProposal={(outcome) => resolvePipelineProposal(turn.id, outcome)}
                    />
                  ))
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="border-t p-2">{inputRow}</div>
          </div>
        ) : (
          <>
            <ComposerProgress
              state={state}
              references={turns.at(-1)?.references}
              onDismiss={dismiss}
              onRun={runAndRetireCard}
              onResolveProposal={(outcome) => {
                const turnId = turns.at(-1)?.id;
                if (turnId) resolvePipelineProposal(turnId, outcome);
              }}
            />
            {inputRow}
          </>
        )}

        {hero ? (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQueuedText(example)}
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

type ProposalOutcome = NonNullable<ComposerPipelineProposal['outcome']>;

function ProposalSlot({
  proposal,
  onResolve,
}: {
  proposal: ComposerPipelineProposal | null;
  onResolve: (outcome: ProposalOutcome) => void;
}) {
  if (!proposal || proposal.outcome === 'dismissed') return null;
  return (
    <PipelineProposalCard
      proposal={proposal}
      onPublished={() => onResolve('published')}
      onDismiss={() => onResolve('dismissed')}
    />
  );
}

function TurnMessages({
  turn,
  isLast,
  onRun,
  onCancel,
  onResolveProposal,
}: {
  turn: ComposerTurn;
  isLast: boolean;
  onRun: () => void;
  onCancel: () => void;
  onResolveProposal: (outcome: ProposalOutcome) => void;
}) {
  const translateUi = useUiTranslations('studio');

  const { state } = turn;
  const graphChanged = state.status === 'done' && state.graph && state.changed !== false;

  return (
    <>
      {/* biome-ignore lint/a11y/useValidAriaRole: `role` is the Message component's author prop (house ai-elements API), not an ARIA role */}
      <Message role="user">
        <p className="text-sm">
          <MentionifiedText text={turn.prompt} references={turn.references} />
        </p>
        <ElementGroundingChips references={turn.references} />
        <ChatMediaGrid
          items={mediaFromPersistedAttachments(turn.id, turn.attachments)}
          lightboxTitle={translateUi('attachmentFallback')}
        />
      </Message>
      {/* biome-ignore lint/a11y/useValidAriaRole: `role` is the Message component's author prop (house ai-elements API), not an ARIA role */}
      <Message role="assistant">
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <ComposerSteps state={state} />
            </div>
            {state.status === 'running' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                className="h-6 px-2 text-xs text-muted-foreground"
              >
                {' '}
                {translateUi('stop_cae7d57b')}{' '}
              </Button>
            ) : null}
          </div>

          {state.status === 'error' ? (
            <span className="flex items-start gap-2 text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {state.error}
            </span>
          ) : null}

          {state.status === 'done' ? <p>{state.summary || translateUi('done_ed251864')}</p> : null}

          {state.status === 'done' && state.changed === false ? <ComposerAnsweredNote /> : null}

          {state.warnings.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {state.warnings.map((warning) => (
                <li key={warning} className="text-xs text-amber-600 dark:text-amber-500">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}

          {state.delegations.length > 0 ? (
            <div className="flex flex-col gap-2">
              {state.delegations.map((delegation) => (
                <AgentDelegatedCard key={delegation.callId} data={delegation} />
              ))}
            </div>
          ) : null}

          {graphChanged && isLast ? (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={onRun}
              data-testid="composer-turn-run"
              className="h-6 w-fit px-2 text-xs"
            >
              <Play data-icon="inline-start" /> {translateUi('run_00d60e31')}{' '}
            </Button>
          ) : null}

          <ProposalSlot proposal={state.pipelineProposal} onResolve={onResolveProposal} />
        </div>
      </Message>
      {graphChanged && state.graph ? (
        <ChatMarker
          kind="milestone"
          icon={<Workflow />}
          label={translateUi('canvas_updated_value0_ef8e9db4', {
            value0: String(graphCountLabel(state.graph, translateUi)),
          })}
        />
      ) : null}
      {state.pipelineProposal?.outcome === 'published' ? (
        <ChatMarker kind="milestone" label={translateUi('pipeline_published_f2dd44d3')} />
      ) : null}
    </>
  );
}

function graphCountLabel(
  graph: { nodeCount: number; edgeCount: number },
  t: ReturnType<typeof useUiTranslations<'studio'>>,
): string {
  return t('composerGraphCounts', { nodes: graph.nodeCount, connections: graph.edgeCount });
}

/**
 * Every step the composer reported, not just the latest. Earlier steps are done; the last one is
 * running, failed, or done with the turn. Open while running, folded once the turn settles.
 */
function ComposerSteps({ state }: { state: CanvasComposerState }) {
  const translateUi = useUiTranslations('studio');

  const [open, setOpen] = useState<boolean>();
  const running = state.status === 'running';
  const { steps } = state;

  if (steps.length === 0) {
    return running ? (
      <Trace>
        <TraceStep status="running" title={translateUi('thinking_a02f1cea')} />
      </Trace>
    ) : null;
  }

  const lastStatus: TraceStepStatus | undefined = running
    ? 'running'
    : state.status === 'error'
      ? 'error'
      : undefined;

  return (
    <Trace>
      <TraceStep
        status={lastStatus}
        icon={<Wand2 />}
        title={translateUi('value0_step_value1_81a83ce3', { count: Number(steps.length) })}
        open={open ?? running}
        onOpenChange={setOpen}
      >
        <Trace>
          {steps.map((step, index) => (
            <TraceStep
              // biome-ignore lint/suspicious/noArrayIndexKey: steps only ever append, so position is identity
              key={index}
              status={index === steps.length - 1 ? lastStatus : undefined}
              title={step}
            />
          ))}
        </Trace>
      </TraceStep>
    </Trace>
  );
}

/**
 * Which Elements ground this turn.
 *
 * This chip is the only place a fallback Element admits that it is spending several
 * reference slots, or that the person ceiling left members behind — silent
 * truncation is how a user concludes the product is random
 * (docs/research/element-reference-generation.md §9.2).
 */
function ElementGroundingChips({ references }: { references?: AgentMentionReference[] }) {
  const translateUi = useUiTranslations('studio');

  const elements = (references ?? []).map(readElementMention).filter((element) => element !== null);
  if (elements.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid="composer-elements">
      <Gem className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">{translateUi('elements_grounding_this_generation_b4c764b4')}</span>
      {elements.map((element) => (
        <Badge key={element.elementId} variant="secondary" className="gap-1 font-normal">
          {element.name}
          <span className="text-muted-foreground">
            {[
              elementCategoryLabel(element.category, translateUi),
              element.mode === 'fallback'
                ? translateUi('elementReferenceImages', { count: element.assetIds.length })
                : null,
              element.droppedCount > 0
                ? translateUi('elementReferencesDropped', { count: element.droppedCount })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </Badge>
      ))}
    </div>
  );
}

/**
 * A completed turn that changed nothing. The wire says so (`response.done.changed`),
 * and without this the same prose, node count and Run button rendered as an ordinary
 * build — so an answered question looked like a workflow the user had to go run.
 */
function ComposerAnsweredNote() {
  const translateUi = useUiTranslations('studio');

  return (
    <p className="text-xs text-muted-foreground" data-testid="composer-answered-note">
      {' '}
      {translateUi('answered_nothing_on_the_canvas_chan_08fe8bea')}{' '}
    </p>
  );
}

function ComposerProgress({
  state,
  references,
  onDismiss,
  onRun,
  onResolveProposal,
}: {
  state: CanvasComposerState;
  references?: AgentMentionReference[];
  onDismiss: () => void;
  onRun: () => void;
  onResolveProposal: (outcome: ProposalOutcome) => void;
}) {
  const translateUi = useUiTranslations('studio');

  if (state.status === 'idle') return null;

  const latestStep = state.steps.at(-1);

  return (
    <div className="mb-2 rounded-xl border bg-background/95 p-3 text-sm shadow-lg backdrop-blur">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {state.status === 'running' ? (
            <Trace>
              <TraceStep status="running" title={latestStep ?? translateUi('thinking_a02f1cea')} />
            </Trace>
          ) : null}

          {state.status === 'error' ? (
            <p className="flex items-start gap-2 text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {state.error}
            </p>
          ) : null}

          {state.status === 'done' && state.summary ? (
            <p className="text-foreground">{state.summary}</p>
          ) : null}

          {state.status === 'done' && state.changed === false ? <ComposerAnsweredNote /> : null}

          <ElementGroundingChips references={references} />

          {state.graph && state.changed !== false ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {graphCountLabel(state.graph, translateUi)} {translateUi(
                'on_the_canvas_6f5e6584',
              )}{' '}
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

          <div className="mt-2 empty:hidden">
            <ProposalSlot proposal={state.pipelineProposal} onResolve={onResolveProposal} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {state.status === 'done' && state.graph && state.changed !== false ? (
            <Button size="sm" type="button" onClick={onRun} data-testid="composer-card-run">
              <Play data-icon="inline-start" /> {translateUi('run_00d60e31')}{' '}
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            type="button"
            onClick={onDismiss}
            aria-label={
              state.status === 'running'
                ? translateUi('stop_the_composer_a97eda0f')
                : translateUi('dismiss_48845bff')
            }
            data-testid="composer-card-dismiss"
            className="size-7"
          >
            <X />
          </Button>
        </div>
      </div>
    </div>
  );
}
