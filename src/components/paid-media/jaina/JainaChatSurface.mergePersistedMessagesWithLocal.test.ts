import { describe, expect, it } from 'bun:test';
import { mergePersistedMessagesWithLocal } from './JainaChatSurface';
import type { JainaChatMessage } from './types';

const baseUserMessage: JainaChatMessage = {
  id: 'persisted-user',
  role: 'user',
  content: 'Give me a 7-day campaign health brief.',
  createdAt: '2026-04-17T09:20:00.000Z',
};

describe('mergePersistedMessagesWithLocal', () => {
  it('keeps a completed local answer while persistence is still empty', () => {
    const local: JainaChatMessage[] = [
      {
        ...baseUserMessage,
        id: 'local-user',
      },
      {
        id: 'local-assistant',
        role: 'assistant',
        content: 'Completed Diana analysis with a downloadable report.',
        createdAt: '2026-04-17T09:20:05.000Z',
        status: 'done',
        renderAsReport: true,
      },
    ];

    expect(mergePersistedMessagesWithLocal([], local)).toEqual(local);
  });

  it('preserves pending local assistant when only the user message is persisted', () => {
    const persisted: JainaChatMessage[] = [
      {
        id: 'persisted-user-old',
        role: 'user',
        content: 'How did campaigns perform last week?',
        createdAt: '2026-04-17T09:19:00.000Z',
      },
      {
        id: 'persisted-assistant-old',
        role: 'assistant',
        content: 'Campaign performance looked stable.',
        createdAt: '2026-04-17T09:19:03.000Z',
      },
      {
        id: 'persisted-user-new',
        role: 'user',
        content: 'Give me a 7-day campaign health brief.',
        createdAt: '2026-04-17T09:20:00.000Z',
      },
    ];

    const local: JainaChatMessage[] = [
      {
        ...persisted[0],
      },
      {
        ...persisted[1],
      },
      {
        id: 'local-user-new',
        role: 'user',
        content: 'Give me a 7-day campaign health brief.',
        createdAt: '2026-04-17T09:20:00.000Z',
      },
      {
        id: 'local-assistant-new',
        role: 'assistant',
        content: 'Plan is ready with campaign-level actions.',
        createdAt: '2026-04-17T09:20:04.000Z',
        plan: {
          id: 'fallback_uqc00d',
          title: 'Recommend Budget Reallocations For This Week BY Campaign',
          description: 'Scope: last_7d',
          status: 'pending',
          steps: [
            {
              title: 'Resolve campaign IDs and collect evidence',
              status: 'pending',
            },
          ],
        },
        reasoning: [
          {
            stage: 'thinking',
            at: '2026-04-17T09:20:02.000Z',
            detail: 'Gathering campaign evidence',
            data: { stage: 'thinking' },
          },
        ],
      },
    ];

    const merged = mergePersistedMessagesWithLocal(persisted, local);
    const lastMessage = merged[merged.length - 1];

    expect(lastMessage.id).toBe('local-assistant-new');
    expect(lastMessage.role).toBe('assistant');
    expect(lastMessage.plan?.id).toBe('fallback_uqc00d');
    expect(lastMessage.reasoning?.length).toBe(1);
  });

  it('does not mistake the previous turn assistant for the current plain-text answer', () => {
    const persisted: JainaChatMessage[] = [
      {
        id: 'persisted-user-old',
        role: 'user',
        content: 'How did campaigns perform last week?',
        createdAt: '2026-04-17T09:19:00.000Z',
      },
      {
        id: 'persisted-assistant-old',
        role: 'assistant',
        content: 'Campaign performance looked stable.',
        createdAt: '2026-04-17T09:19:03.000Z',
      },
      {
        id: 'persisted-user-new',
        role: 'user',
        content: 'What creative elements are driving the low cost?',
        createdAt: '2026-04-17T09:20:00.000Z',
      },
    ];

    const local: JainaChatMessage[] = [
      persisted[0],
      persisted[1],
      {
        id: 'local-user-new',
        role: 'user',
        content: 'What creative elements are driving the low cost?',
        createdAt: '2026-04-17T09:20:00.000Z',
      },
      {
        id: 'local-assistant-new',
        role: 'assistant',
        content: 'The low cost is driven by a focused day-pass value proposition.',
        createdAt: '2026-04-17T09:20:04.000Z',
        status: 'done',
      },
    ];

    const merged = mergePersistedMessagesWithLocal(persisted, local);

    expect(merged.at(-1)?.id).toBe('local-assistant-new');
    expect(merged.at(-1)?.content).toContain('focused day-pass value proposition');
  });

  it('replaces a projected response only with the persisted assistant from the same run', () => {
    const persisted: JainaChatMessage[] = [
      baseUserMessage,
      {
        id: 'persisted-assistant',
        runId: 'run-1',
        role: 'assistant',
        content: 'Final persisted analysis.',
        createdAt: '2026-04-17T09:20:05.000Z',
        status: 'done',
      },
    ];
    const local: JainaChatMessage[] = [
      baseUserMessage,
      {
        id: 'projected-run-1',
        runId: 'run-1',
        role: 'assistant',
        content: 'Final streamed analysis.',
        createdAt: '2026-04-17T09:20:04.000Z',
        status: 'streaming',
      },
    ];

    const merged = mergePersistedMessagesWithLocal(persisted, local);

    expect(merged).toHaveLength(2);
    expect(merged.at(-1)?.id).toBe('persisted-assistant');
    expect(merged.at(-1)?.content).toBe('Final persisted analysis.');
  });

  it('keeps richer local assistant state when persisted assistant is plan-only', () => {
    const persisted: JainaChatMessage[] = [
      baseUserMessage,
      {
        id: 'persisted-assistant',
        role: 'assistant',
        content: '',
        createdAt: '2026-04-17T09:20:05.000Z',
        plan: {
          id: 'fallback_plan',
          title: 'Campaign Health Brief',
          description: 'Review this execution plan.',
          status: 'pending',
          steps: [],
        },
      },
    ];

    const local: JainaChatMessage[] = [
      {
        ...baseUserMessage,
        id: 'local-user',
      },
      {
        id: 'local-assistant',
        role: 'assistant',
        content: 'Campaign health brief plan ready.',
        createdAt: '2026-04-17T09:20:05.000Z',
        plan: {
          id: 'fallback_plan',
          title: 'Campaign Health Brief',
          description: 'Scope: last_7d',
          status: 'pending',
          steps: [
            {
              title: 'Assess campaign risk and opportunity.',
              status: 'pending',
            },
          ],
        },
        reasoning: [
          {
            stage: 'analysis',
            at: '2026-04-17T09:20:04.000Z',
            detail: 'Gathering context',
            data: { stage: 'analysis' },
          },
        ],
      },
    ];

    const merged = mergePersistedMessagesWithLocal(persisted, local);
    const assistant = merged[merged.length - 1];

    expect(assistant.content).toBe('Campaign health brief plan ready.');
    expect(assistant.plan?.description).toBe('Scope: last_7d');
    expect(assistant.plan?.steps).toHaveLength(1);
    expect(assistant.reasoning?.length).toBe(1);
  });

  it('keeps persisted assistant when it already has meaningful content', () => {
    const persisted: JainaChatMessage[] = [
      baseUserMessage,
      {
        id: 'persisted-assistant',
        role: 'assistant',
        content: 'Final analysis summary from persisted history.',
        createdAt: '2026-04-17T09:20:05.000Z',
      },
    ];

    const local: JainaChatMessage[] = [
      {
        ...baseUserMessage,
        id: 'local-user',
      },
      {
        id: 'local-assistant',
        role: 'assistant',
        content: 'Temporary local content.',
        createdAt: '2026-04-17T09:20:05.000Z',
      },
    ];

    const merged = mergePersistedMessagesWithLocal(persisted, local);
    const assistant = merged[merged.length - 1];

    expect(assistant.content).toBe('Final analysis summary from persisted history.');
  });

  it('keeps streamed V2 blocks when the persisted V2 shell is empty', () => {
    const emptyReport = {
      language: 'en' as const,
      executive_summary: 'DayPass sin costo summary',
      follow_up_questions: [],
      media_map: {},
      _meta: {
        schema_version: '2' as const,
        block_count: 0,
        has_charts: false,
        has_media: false,
        primary_scope: 'campaign' as const,
      },
      blocks: [],
    };
    const persisted: JainaChatMessage[] = [
      baseUserMessage,
      {
        id: 'persisted-assistant',
        role: 'assistant',
        content: 'DayPass sin costo summary',
        createdAt: '2026-04-17T09:20:05.000Z',
        status: 'done',
        reportV2: emptyReport,
      },
    ];
    const local: JainaChatMessage[] = [
      { ...baseUserMessage, id: 'local-user' },
      {
        id: 'local-assistant',
        role: 'assistant',
        content: 'DayPass sin costo summary',
        createdAt: '2026-04-17T09:20:05.000Z',
        status: 'done',
        reportV2: {
          ...emptyReport,
          _meta: { ...emptyReport._meta, block_count: 1 },
          blocks: [
            {
              block_id: 'creative_elements',
              category: 'narrative',
              scope: 'campaign',
              title: 'Creative elements driving low cost',
              priority: 0,
              body: 'The day-pass value proposition and direct CTA drive conversion.',
              highlights: [],
            },
          ],
        },
      },
    ];

    const assistant = mergePersistedMessagesWithLocal(persisted, local).at(-1);

    expect(assistant?.reportV2?.blocks).toHaveLength(1);
    expect(assistant?.reportV2?.blocks[0]?.block_id).toBe('creative_elements');
  });

  it('does not downgrade completed local objectives during persisted refresh', () => {
    const persisted: JainaChatMessage[] = [
      baseUserMessage,
      {
        id: 'persisted-assistant',
        role: 'assistant',
        content: 'Final analysis summary from persisted history.',
        createdAt: '2026-04-17T09:20:05.000Z',
        objectives: [
          {
            id: 'collect-metrics',
            title: 'Collect metrics',
            status: 'pending',
          },
        ],
      },
    ];

    const local: JainaChatMessage[] = [
      {
        ...baseUserMessage,
        id: 'local-user',
      },
      {
        id: 'local-assistant',
        role: 'assistant',
        content: 'Final analysis summary from persisted history.',
        createdAt: '2026-04-17T09:20:05.000Z',
        objectives: [
          {
            id: 'collect-metrics',
            title: 'Collect metrics',
            status: 'completed',
          },
        ],
      },
    ];

    const merged = mergePersistedMessagesWithLocal(persisted, local);
    const assistant = merged[merged.length - 1];

    expect(assistant.content).toBe('Final analysis summary from persisted history.');
    expect(assistant.objectives?.[0]?.status).toBe('completed');
  });
});
