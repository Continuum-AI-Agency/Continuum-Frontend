'use client';

// A gated Jaina tool call opened by a BUTTON, not by a model turn.
//
// "Pause this ad set" on the Scale table is a decision a person already made; asking a model to
// rephrase it as a tool call would only add a place for the call to drift from the click. So the
// button posts `operator_action { tool, input }` on the ordinary chat stream, the Backend opens the
// tool's approval gate with no LLM in the loop, and the answer travels back as the same
// `tool_action` every other Jaina approval uses. Nothing here can write: the gate is the only way
// through, and it is answered by a human on the card this hook exposes.
//
// It rides `useJainaChat`, so the request is built by `buildJainaChatStreamRequest` and the frames
// are folded by the same `approvalsOf` / `toolResultsOf` the transcript uses — one reading of the
// wire, not a second parser that could disagree with the card in chat.

import type {
  JainaToolApprovalRequiredPayload,
  JainaToolApprovalResolvedPayload,
  JainaUIMessage,
} from '@continuum/contracts';
import { useCallback, useMemo, useState } from 'react';
import { useJainaChat } from '@/hooks/useJainaChat';
import { type JainaOperatorAction, jainaOperatorActionSchema } from '@/lib/jaina/schemas';
import { refusalReasonOf } from '@/lib/jaina/operatorOutcome';
import { approvalsOf, textOf, toolResultsOf } from '@/lib/jaina/uiMessageProjection';

export type OperatorActionRequest = JainaOperatorAction & {
  /** What the conversation records as the person's ask, e.g. "Pause ad set Summer Sale". */
  displayText: string;
};

export type OperatorActionPhase =
  /** Nothing asked yet. */
  | 'idle'
  /** Posted; waiting for the gate to open. */
  | 'opening'
  /** The approval card is up and nobody has answered it. */
  | 'awaiting'
  /** Answered; the resumed turn is running (or the denial is landing). */
  | 'deciding'
  /** The tool ran (approve) or was refused (deny) and the turn settled. */
  | 'settled'
  /** The request never arrived, or the turn ended without opening a gate. */
  | 'failed';

export type OperatorActionResult = { ok: true; output: unknown } | { ok: false; error: string };

export type OperatorActionState = {
  phase: OperatorActionPhase;
  approval: JainaToolApprovalRequiredPayload | null;
  resolution: JainaToolApprovalResolvedPayload | null;
  decision: 'approve' | 'deny' | null;
  /** The tool's own output after an approve, e.g. the read-back Meta status. */
  result: OperatorActionResult | null;
  error: string | null;
};

type Options = {
  brandId: string;
  adAccountId: string | null;
  /** The conversation the action is recorded in. Approve/deny go to the same one. */
  sessionId: string;
};

/** What the button's action looks like now, read off the messages it produced (from `start`). */
export function operatorActionStateOf({
  messages,
  start,
  decision,
  error,
  isStreaming,
}: {
  messages: JainaUIMessage[];
  start: number | null;
  decision: 'approve' | 'deny' | null;
  error: string | null;
  isStreaming: boolean;
}): OperatorActionState {
  const ours = start === null ? [] : messages.slice(start);

  let approval: JainaToolApprovalRequiredPayload | null = null;
  let resolution: JainaToolApprovalResolvedPayload | null = null;
  for (const message of ours) {
    const { pending, resolved } = approvalsOf(message);
    approval = pending.at(-1) ?? approval;
    const settled = Object.values(resolved).at(-1);
    if (settled) resolution = settled;
  }
  // A resolved approval still names the call the card was about.
  const toolCallId = approval?.toolCallId ?? resolution?.toolCallId ?? null;

  let result: OperatorActionResult | null = null;
  if (toolCallId) {
    for (const message of ours) {
      for (const entry of toolResultsOf(message)) {
        if (entry.id !== toolCallId) continue;
        result = entry.ok
          ? { ok: true, output: entry.output }
          : { ok: false, error: entry.error ?? 'The tool call failed.' };
      }
    }
  }

  // "No gate" only means refused once the turn has actually answered. Between the click and the
  // stream starting nothing is streaming yet either, and reading that as a refusal flashes an
  // error at the person who just asked.
  const answered = ours.some((message) => message.role === 'assistant');
  const phase: OperatorActionPhase =
    start === null
      ? 'idle'
      : error
        ? 'failed'
        : resolution?.decision === 'denied' || result
          ? isStreaming
            ? 'deciding'
            : 'settled'
          : decision
            ? 'deciding'
            : approval
              ? 'awaiting'
              : isStreaming || !answered
                ? 'opening'
                : // The turn answered and no gate opened: the Backend refused the action outright.
                  'failed';

  return {
    phase,
    approval,
    resolution,
    decision,
    result,
    // A refusal is reported in the Backend's own words ("Pausing is blocked: …"), not a generic line.
    error:
      error ??
      (phase === 'failed'
        ? refusalReasonOf(ours.map((message) => ({ role: message.role, content: textOf(message) })))
        : null),
  };
}

export function useJainaOperatorAction({ brandId, adAccountId, sessionId }: Options) {
  const chat = useJainaChat({ sessionId });
  const { messages, status, sendTurn } = chat;

  // Only the messages this action produced. The session is shared with earlier actions, and an
  // older pending approval must never be the one a new click answers.
  const [firstMessage, setFirstMessage] = useState<number | null>(null);
  const [decision, setDecision] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isStreaming = status === 'submitted' || status === 'streaming';

  const state = useMemo<OperatorActionState>(
    () => operatorActionStateOf({ messages, start: firstMessage, decision, error, isStreaming }),
    [decision, error, firstMessage, isStreaming, messages],
  );

  const baseTurn = useCallback(
    () => ({
      adAccountId: adAccountId ?? '',
      brandId,
      sessionId,
      canvas: false,
    }),
    [adAccountId, brandId, sessionId],
  );

  const run = useCallback(
    (request: OperatorActionRequest) => {
      if (!adAccountId) {
        setError('Select an ad account first.');
        setFirstMessage(messages.length);
        return;
      }
      setFirstMessage(messages.length);
      setDecision(null);
      // Parsed here, not only at the route: the inputs are `.strict()` literals, and a row whose
      // status no longer matches must fail on screen rather than as a 400 nobody reads.
      const parsed = jainaOperatorActionSchema.safeParse({
        tool: request.tool,
        input: request.input,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'This action is not valid for that row.');
        return;
      }
      setError(null);
      void sendTurn({
        ...baseTurn(),
        query: request.displayText,
        operatorAction: parsed.data,
        onDispatchError: (message) => setError(message),
      });
    },
    [adAccountId, baseTurn, messages.length, sendTurn],
  );

  const decide = useCallback(
    (next: 'approve' | 'deny') => {
      const approval = state.approval;
      if (!approval || decision) return;
      setDecision(next);
      void sendTurn({
        ...baseTurn(),
        // The Backend reads the typed field; the schema requires a non-empty query.
        query: next === 'approve' ? 'Approved.' : 'Declined.',
        silent: true,
        toolAction: {
          decision: next,
          approval_id: approval.approvalId,
          tool_call_id: approval.toolCallId,
        },
        onDispatchError: (message) => {
          // Roll the optimistic decision back: a card reading "Approved" for a decision that
          // never arrived is the exact silence the gate exists to prevent.
          setDecision(null);
          setError(message);
        },
      });
    },
    [baseTurn, decision, sendTurn, state.approval],
  );

  const reset = useCallback(() => {
    setFirstMessage(null);
    setDecision(null);
    setError(null);
  }, []);

  return { state, isStreaming, run, decide, reset };
}
