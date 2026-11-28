import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { ForgeAgentFrame } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { applyForgeAgentFrame, type ForgeAgentTurn, ForgeSuggestions } from './ForgeAgentPanel';

const envelope = { eventId: 'e', seq: 0, ts: '2026-10-22T00:00:00.000Z' };
const turn: ForgeAgentTurn = {
  id: 't',
  prompt: 'Make the pill blue',
  text: '',
  tools: [],
  question: null,
  status: 'running',
  drafts: 0,
};
const fold = (frames: ForgeAgentFrame[]) => frames.reduce(applyForgeAgentFrame, turn);

describe('applyForgeAgentFrame', () => {
  test('a tool chip resolves on its result; each draft frame counts one undo step', () => {
    const folded = fold([
      { ...envelope, type: 'tool_start', data: { toolCallId: 'a', tool: 'apply_commands' } },
      { ...envelope, type: 'draft', data: { revision: 2, changedNodeIds: ['aep:7:4'], createdNodeIds: [], deletedNodeIds: [] } },
      {
        ...envelope,
        type: 'tool_result',
        data: { toolCallId: 'a', tool: 'apply_commands', ok: true, summary: 'CTA Pill (color)' },
      },
      { ...envelope, type: 'text_delta', data: { text: 'Done.' } },
      {
        ...envelope,
        type: 'done',
        data: { turnId: 'x', baseDraftRevision: 1, finalDraftRevision: 2, steps: 2, inputTokens: 1, outputTokens: 1 },
      },
    ]);
    expect(folded.tools).toEqual([{ toolCallId: 'a', tool: 'apply_commands', ok: true, summary: 'CTA Pill (color)' }]);
    expect(folded.drafts).toBe(1);
    expect(folded.text).toBe('Done.');
    expect(folded.status).toBe('done');
  });

  test('a question is kept for its option buttons; an aborted error reads as stopped', () => {
    const asked = fold([
      { ...envelope, type: 'question', data: { toolCallId: 'q', question: 'Which pill?', options: [{ label: 'CTA' }, { label: 'Badge' }] } },
    ]);
    expect(asked.question?.options.map((o) => o.label)).toEqual(['CTA', 'Badge']);
    expect(fold([{ ...envelope, type: 'error', data: { message: 'Stopped.', code: 'aborted' } }]).status).toBe('stopped');
  });
});

describe('ForgeSuggestions', () => {
  afterEach(cleanup);

  test('a chip sends its full prompt, not its label', () => {
    const onSend = mock();
    render(createElement(ForgeSuggestions, { disabled: false, onSend }));
    fireEvent.click(screen.getByRole('button', { name: 'Blue variant' }));
    expect(onSend).toHaveBeenCalledWith('Recolour the background blue; keep everything else.');
  });

  test('the chips are blocked while a turn runs', () => {
    render(createElement(ForgeSuggestions, { disabled: true, onSend: () => {} }));
    // happy-dom does not inherit disabled from a fieldset; browsers do, so assert the fieldset.
    const chip = screen.getByRole('button', { name: 'Bigger headline' });
    expect(chip.closest('fieldset')?.disabled).toBe(true);
  });
});
