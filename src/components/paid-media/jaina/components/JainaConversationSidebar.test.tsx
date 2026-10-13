import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

mock.module('./JainaGoalsSidebarPanel', () => ({
  JainaGoalsSidebarPanel: () => <div>Goal list</div>,
}));

mock.module('@/components/goals/CreateCampaignGoalDialog', () => ({
  CreateCampaignGoalDialog: () => <button type="button">Create campaign Goal</button>,
}));

import { JainaConversationSidebar } from './JainaConversationSidebar';

afterEach(cleanup);

const props = {
  sessions: [],
  activeSessionId: 'session-1',
  isLoading: false,
  isInteractionDisabled: false,
  brandId: '22222222-2222-4222-a222-222222222222',
  onCreateConversation: () => undefined,
  onSelectConversation: () => undefined,
  onDeleteConversation: () => undefined,
};

describe('JainaConversationSidebar', () => {
  it('renders Goals as a disabled Coming Soon tab without a Goal creator', () => {
    render(<JainaConversationSidebar {...props} goalsAccessEnabled={false} />);

    expect((screen.getByLabelText('Goals (Coming Soon)') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Start a shared Goal')).toBeNull();
    expect(screen.getByText('Chats')).not.toBeNull();
    expect(screen.queryByText('Automations')).toBeNull();
  });

  it('allows the Goals tab in an enabled environment', () => {
    render(<JainaConversationSidebar {...props} goalsAccessEnabled />);

    const goalsTab = screen.getByRole('button', { name: 'Goals' }) as HTMLButtonElement;
    expect(goalsTab.disabled).toBe(false);
    fireEvent.click(goalsTab);
    expect(screen.getByText('Goal list')).not.toBeNull();
    expect(screen.getByText('Create campaign Goal')).not.toBeNull();
  });
});

describe('JainaConversationSidebar activity time', () => {
  it('shows when the chat was last active even when last_message_at came back null', () => {
    const updatedAt = new Date();
    updatedAt.setHours(14, 32, 0, 0);
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        sessions={[
          {
            sessionId: 'session-2',
            brandId: null,
            adAccountId: null,
            title: 'Budget question',
            lastMessageRole: 'assistant',
            lastMessagePreview: null,
            lastMessageAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: updatedAt.toISOString(),
            initiator: 'user',
            initiatorAgent: null,
            callerRunId: null,
            callerSessionId: null,
            crossCallId: null,
            tags: [],
            preview: null,
          },
        ]}
      />,
    );

    const time = screen.getByTestId('jaina-conversation-time-session-2');
    expect(time.textContent).toBe('14:32');
    expect(screen.queryByText('No activity')).toBeNull();
  });
});

describe('JainaConversationSidebar list rows', () => {
  const session = (sessionId: string, overrides: Record<string, unknown> = {}) => ({
    sessionId,
    brandId: null,
    adAccountId: null,
    title: `Chat ${sessionId}`,
    lastMessageRole: 'user' as const,
    lastMessagePreview: null,
    lastMessageAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
    initiator: 'user' as const,
    initiatorAgent: null,
    callerRunId: null,
    callerSessionId: null,
    crossCallId: null,
    tags: [],
    preview: null,
    ...overrides,
  });

  it('reads as titles and times: no role label, the current chat tinted, actions on hover', () => {
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        activeSessionId="current"
        onUpdateConversationTags={async (_id, tags) => tags}
        sessions={[session('current'), session('other', { lastMessageRole: 'assistant' })]}
      />,
    );

    expect(screen.queryByText(/^(user|assistant|session)$/i)).toBeNull();

    const current = screen.getByTestId('jaina-conversation-current');
    expect(current.getAttribute('aria-current')).toBe('true');
    expect(current.parentElement?.className).toContain('bg-primary/10');
    expect(current.parentElement?.className).not.toMatch(/\bborder\b/);
    expect(screen.getByText('Chat current').className).toContain('text-primary-ink');

    const other = screen.getByTestId('jaina-conversation-other');
    expect(other.getAttribute('aria-current')).toBeNull();
    expect(screen.getByText('Chat other').className).toContain('text-foreground');

    const remove = screen.getByLabelText('Delete conversation Chat other');
    expect(remove.className).toContain('opacity-0');
    expect(remove.className).toContain('group-hover/conversation:opacity-100');
    expect(remove.className).toContain('group-focus-within/conversation:opacity-100');
  });

  it('marks a chat another agent started with a muted word, and none on a person’s chat', () => {
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        sessions={[
          session('from-organic', { initiator: 'agent', initiatorAgent: 'organic' }),
          session('mine', { tags: ['q4'] }),
        ]}
      />,
    );

    const agentRow = screen.getByTestId('jaina-conversation-from-organic');
    expect(agentRow.textContent).toContain('Organic');
    const personRow = screen.getByTestId('jaina-conversation-mine');
    expect(personRow.textContent).not.toContain('AI');
    expect(personRow.textContent).toContain('#q4');
  });
});

describe('JainaConversationSidebar when the list could not be read', () => {
  it('names the failure in place of "Loading conversations…" and offers Retry', () => {
    const onRetryLoad = mock(() => {});
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled={false}
        loadError="Couldn't load conversations — the server didn't answer in time."
        onRetryLoad={onRetryLoad}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain("Couldn't load conversations");
    expect(screen.queryByText('Loading conversations…')).toBeNull();
    expect(screen.queryByText('Start a chat to create your first conversation.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
  });

  it('gives Retry an invisible 24px hit area on its text line', () => {
    // PP-L1V tap-target: the inline Retry painted 15px tall.
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled={false}
        loadError="Couldn't load conversations."
        onRetryLoad={mock(() => {})}
      />,
    );
    expect(screen.getByRole('button', { name: 'Retry' }).className.split(' ')).toContain(
      'hit-area',
    );
  });

  it('keeps the list when a refresh failed after conversations were already read', () => {
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled={false}
        loadError="Couldn't load conversations."
        sessions={[
          {
            sessionId: 'session-2',
            brandId: null,
            adAccountId: null,
            title: 'Budget review',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastMessageAt: null,
            messageCount: 2,
          } as never,
        ]}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Budget review')).not.toBeNull();
  });
});
