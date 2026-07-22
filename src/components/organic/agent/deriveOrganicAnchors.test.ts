import { describe, expect, it } from 'bun:test';
import { deriveOrganicAnchors, milestonesForMessage } from './deriveOrganicAnchors';
import type { ConversationMessage, PipelineCardState } from './types';

function assistant(id: string, overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return { id, role: 'assistant', content: 'ok', ...overrides };
}

function pipelineCard(overrides: Partial<PipelineCardState> = {}): PipelineCardState {
  return { jobId: 'job-1', stages: [], status: 'running', ...overrides };
}

describe('milestonesForMessage', () => {
  it('finds no milestones on a user turn', () => {
    expect(milestonesForMessage({ id: 'u1', role: 'user', content: 'hi' }, {})).toEqual([]);
  });

  it('marks a plan card as a milestone', () => {
    const message = assistant('a1', {
      uiCards: [
        { type: 'plan_card', data: { planId: 'p1' } },
      ] as unknown as ConversationMessage['uiCards'],
    });

    expect(milestonesForMessage(message, {})).toEqual([{ id: 'a1::plan', label: 'Plan ready' }]);
  });

  it('reads pipeline checkpoints through the tool call that dispatched the card', () => {
    const message = assistant('a1', {
      toolCalls: [{ toolCallId: 'tc-1', toolName: 'generateDraft' }],
    });
    const pipeline = {
      'job-1': pipelineCard({
        toolCallId: 'tc-1',
        checkpoint: { textReady: true, blueprintReady: true, mediaStatus: 'ready' },
      }),
    };

    expect(milestonesForMessage(message, pipeline)).toEqual([
      { id: 'a1::content', label: 'Content ready' },
      { id: 'a1::media', label: 'Media ready' },
    ]);
  });

  it('keeps a single copy marker when only text is ready', () => {
    const message = assistant('a1', {
      toolCalls: [{ toolCallId: 'tc-1', toolName: 'generateDraft' }],
    });
    const pipeline = {
      'job-1': pipelineCard({ toolCallId: 'tc-1', checkpoint: { textReady: true } }),
    };

    expect(milestonesForMessage(message, pipeline)).toEqual([
      { id: 'a1::copy', label: 'Copy ready' },
    ]);
  });

  it('ignores a pipeline card belonging to a different turn', () => {
    const message = assistant('a1', {
      toolCalls: [{ toolCallId: 'tc-1', toolName: 'generateDraft' }],
    });
    const pipeline = {
      'job-2': pipelineCard({ toolCallId: 'tc-OTHER', checkpoint: { textReady: true } }),
    };

    expect(milestonesForMessage(message, pipeline)).toEqual([]);
  });

  it('prefers the awaiting-choice milestone over a ready one', () => {
    const message = assistant('a1', {
      toolCalls: [{ toolCallId: 'tc-1', toolName: 'generateDraft' }],
    });
    const pipeline = {
      'job-1': pipelineCard({
        toolCallId: 'tc-1',
        checkpoint: { mediaStatus: 'ready', awaitingMediaChoice: true },
      }),
    };

    expect(milestonesForMessage(message, pipeline)).toEqual([
      { id: 'a1::media-choice', label: 'Awaiting media choice' },
    ]);
  });
});

describe('deriveOrganicAnchors', () => {
  it('emits one anchor per turn, with milestones interleaved after their turn', () => {
    const messages: ConversationMessage[] = [
      { id: 'u1', role: 'user', content: 'plan my week' },
      assistant('a1', {
        toolCalls: [{ toolCallId: 'tc-1', toolName: 'generateDraft' }],
        uiCards: [
          { type: 'plan_card', data: { planId: 'p1' } },
        ] as unknown as ConversationMessage['uiCards'],
      }),
      { id: 'u2', role: 'user', content: 'thanks' },
    ];
    const pipeline = {
      'job-1': pipelineCard({ toolCallId: 'tc-1', checkpoint: { blueprintReady: true } }),
    };

    expect(deriveOrganicAnchors(messages, pipeline)).toEqual([
      { id: 'u1', kind: 'user' },
      { id: 'a1', kind: 'assistant' },
      { id: 'a1::plan', kind: 'milestone', label: 'Plan ready' },
      { id: 'a1::blueprint', kind: 'milestone', label: 'Blueprint ready' },
      { id: 'u2', kind: 'user' },
    ]);
  });

  it('returns nothing for an empty transcript', () => {
    expect(deriveOrganicAnchors([], {})).toEqual([]);
  });
});
