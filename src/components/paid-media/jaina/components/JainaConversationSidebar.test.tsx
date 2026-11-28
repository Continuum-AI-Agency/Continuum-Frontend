import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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

  const row = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title}`) });

  it('reads as titles and times: no role label, the current chat marked, actions on hover', () => {
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
    expect(row('Chat current').getAttribute('aria-current')).toBe('page');
    expect(row('Chat other').getAttribute('aria-current')).toBeNull();

    const menu = screen.getByRole('button', { name: 'Actions for Chat other' });
    expect(menu.className).toContain('opacity-0');
    expect(menu.className).toContain('group-hover:opacity-100');
    const tag = screen.getByRole('button', { name: 'Edit tags for conversation other' });
    expect(tag.className).toContain('opacity-0');
    expect(tag.className).toContain('group-focus-within:opacity-100');
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

    expect(row('Chat from-organic').textContent).toContain('Organic');
    expect(row('Chat mine').textContent).not.toContain('AI');
  });

  it('shows the chat’s tags on the meta line under its title', () => {
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        sessions={[session('tagged', { tags: ['launch', 'q4'] })]}
      />,
    );

    const time = screen.getByTestId('jaina-conversation-time-tagged');
    const meta = time.parentElement as HTMLElement;
    expect(meta.textContent).toContain('#launch #q4');
    expect(meta.previousElementSibling?.textContent).toBe('Chat tagged');
  });

  it('marks a chat the agent is still answering as working', () => {
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        generatingSessionIds={new Set(['busy'])}
        sessions={[session('busy'), session('idle')]}
      />,
    );

    expect(within(row('Chat busy')).getByRole('status').textContent).toBe('Agent working');
    expect(within(row('Chat idle')).queryByRole('status')).toBeNull();
  });

  it('opens another chat, but not the open one or while the list is locked', () => {
    const onSelectConversation = mock(() => {});
    const { rerender } = render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        activeSessionId="current"
        onSelectConversation={onSelectConversation}
        sessions={[session('current'), session('other')]}
      />,
    );

    fireEvent.click(row('Chat current'));
    expect(onSelectConversation).not.toHaveBeenCalled();
    fireEvent.click(row('Chat other'));
    expect(onSelectConversation).toHaveBeenCalledWith('other');

    rerender(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        activeSessionId="current"
        isInteractionDisabled
        onSelectConversation={onSelectConversation}
        sessions={[session('current'), session('other')]}
      />,
    );
    fireEvent.click(row('Chat other'));
    expect(onSelectConversation).toHaveBeenCalledTimes(1);
  });

  it('starts a new chat from New', () => {
    const onCreateConversation = mock(() => {});
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        onCreateConversation={onCreateConversation}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create new conversation' }));
    expect(onCreateConversation).toHaveBeenCalledTimes(1);
  });
});

describe('JainaConversationSidebar row menu', () => {
  const session = {
    sessionId: 'session-2',
    brandId: null,
    adAccountId: null,
    title: 'Weekly recap',
    lastMessageRole: 'assistant' as const,
    lastMessagePreview: null,
    lastMessageAt: '2026-10-31T12:00:00.000Z',
    createdAt: '2026-10-31T11:00:00.000Z',
    updatedAt: '2026-10-31T12:00:00.000Z',
  };

  const openMenu = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Weekly recap' }));
    return screen.findByRole('menu');
  };

  it('offers Delete only: Jaina chats have no rename, pin or archive endpoint', async () => {
    render(<JainaConversationSidebar {...props} goalsAccessEnabled sessions={[session]} />);

    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Delete']);
  });

  it('deletes at once through the existing delete handler, with no undo window', async () => {
    const onDeleteConversation = mock(() => {});
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        sessions={[session]}
        onDeleteConversation={onDeleteConversation}
      />,
    );

    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Delete' }));
    expect(onDeleteConversation).toHaveBeenCalledTimes(1);
    expect(onDeleteConversation).toHaveBeenCalledWith('session-2');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('does not delete a chat that is already being deleted', async () => {
    const onDeleteConversation = mock(() => {});
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        sessions={[session]}
        deletingSessionId="session-2"
        onDeleteConversation={onDeleteConversation}
      />,
    );

    expect(
      screen.getByTestId('jaina-conversation-time-session-2').parentElement?.textContent,
    ).toContain('Deleting…');
    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Delete' }));
    expect(onDeleteConversation).not.toHaveBeenCalled();
  });
});

describe('JainaConversationSidebar search and facets', () => {
  const sessions = [
    {
      sessionId: 'budget',
      brandId: null,
      adAccountId: null,
      title: 'Budget shift',
      lastMessageRole: 'assistant' as const,
      lastMessagePreview: null,
      lastMessageAt: '2026-10-31T12:00:00.000Z',
      createdAt: '2026-10-31T11:00:00.000Z',
      updatedAt: '2026-10-31T12:00:00.000Z',
      tags: ['budget'],
    },
    {
      sessionId: 'creative',
      brandId: null,
      adAccountId: null,
      title: 'Creative fatigue',
      lastMessageRole: 'assistant' as const,
      lastMessagePreview: null,
      lastMessageAt: '2026-10-30T12:00:00.000Z',
      createdAt: '2026-10-30T11:00:00.000Z',
      updatedAt: '2026-10-30T12:00:00.000Z',
      tags: [],
    },
  ];

  it('has a single search box, and it asks the server', async () => {
    const onSearchConversations = mock(async () => [sessions[1]]);
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        sessions={sessions}
        onSearchConversations={onSearchConversations}
      />,
    );

    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'fatigue' } });
    await waitFor(() => expect(onSearchConversations).toHaveBeenCalled());
    expect(onSearchConversations.mock.calls.at(-1)?.[0]).toMatchObject({ q: 'fatigue' });
    await waitFor(() => expect(screen.queryByText('Budget shift')).toBeNull());
    expect(screen.getByText('Creative fatigue')).not.toBeNull();
  });

  it('filters by who started the chat', async () => {
    const onSearchConversations = mock(async () => [sessions[0]]);
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        sessions={sessions}
        onSearchConversations={onSearchConversations}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Human' }));
    await waitFor(() => expect(screen.queryByText('Creative fatigue')).toBeNull());
    expect(onSearchConversations.mock.calls.at(-1)?.[0]).toMatchObject({ initiator: 'user' });
  });

  it('filters by a tag chip', async () => {
    const onSearchConversations = mock(async () => [sessions[0]]);
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        sessions={sessions}
        onSearchConversations={onSearchConversations}
      />,
    );

    const chip = screen.getByRole('button', { name: '#budget' });
    fireEvent.click(chip);
    await waitFor(() => expect(chip.getAttribute('aria-pressed')).toBe('true'));
    expect(onSearchConversations.mock.calls.at(-1)?.[0]).toMatchObject({ tags: ['budget'] });
    await waitFor(() => expect(screen.queryByText('Creative fatigue')).toBeNull());
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

// PP-DT-C-jaina-401-reads-as-no-conversations: the search hook kept the error, but the sidebar
// only looked at the result count, so a failed filter — a 401 after the session was revoked, a
// 500, a dropped connection — read "No conversations match these filters.", which a person can
// take for lost history.
describe('JainaConversationSidebar when a filter fails', () => {
  const session = {
    sessionId: 'session-2',
    brandId: null,
    adAccountId: null,
    title: 'Weekly recap',
    lastMessageRole: 'assistant' as const,
    lastMessagePreview: 'Spend held steady.',
    lastMessageAt: '2026-10-31T12:00:00.000Z',
    createdAt: '2026-10-31T11:00:00.000Z',
    updatedAt: '2026-10-31T12:00:00.000Z',
  };

  it('says the session ended and offers sign-in, never "no conversations match"', async () => {
    const onSearchConversations = mock(() =>
      Promise.reject(Object.assign(new Error('Failed to search conversations.'), { status: 401 })),
    );
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        sessions={[session]}
        onSearchConversations={onSearchConversations}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Human' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/session ended/i);
    expect(
      within(alert)
        .getByRole('link', { name: /sign in/i })
        .getAttribute('href'),
    ).toMatch(/^\/login\?redirectTo=/);
    expect(screen.queryByText('No conversations match these filters.')).toBeNull();
  });

  it('names any other failure in words, with Retry that runs the filter again', async () => {
    let calls = 0;
    const onSearchConversations = mock(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve([]);
    });
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        sessions={[session]}
        onSearchConversations={onSearchConversations}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Human' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('no connection to the server');
    expect(alert.textContent).not.toContain('Failed to fetch');
    expect(screen.queryByText('No conversations match these filters.')).toBeNull();

    fireEvent.click(within(alert).getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(onSearchConversations).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No conversations match these filters.')).toBeTruthy();
  });
});

// PP-DT-C-jaina-delete-conversation-target-21px: the row's icon buttons were size-6 (21.75 px at
// the 14.5 px root) without the shared 24 px hit pad. Delete now lives in the row menu; the tag
// editor still sits on the row and keeps the pad.
describe('JainaConversationSidebar row actions', () => {
  it('give the tag editor the 24 px hit pad and save the tags it returns', async () => {
    const onUpdateConversationTags = mock(async (_sessionId: string, tags: string[]) => tags);
    render(
      <JainaConversationSidebar
        {...props}
        goalsAccessEnabled
        sessions={[
          {
            sessionId: 'session-2',
            brandId: null,
            adAccountId: null,
            title: 'Weekly recap',
            lastMessageRole: 'assistant',
            lastMessagePreview: 'Spend held steady.',
            lastMessageAt: '2026-10-31T12:00:00.000Z',
            createdAt: '2026-10-31T11:00:00.000Z',
            updatedAt: '2026-10-31T12:00:00.000Z',
            tags: ['recap'],
          },
        ]}
        onUpdateConversationTags={onUpdateConversationTags}
      />,
    );
    const tag = screen.getByRole('button', { name: /^Edit tags for conversation/ });
    expect(tag.className.split(/\s+/)).toContain('hit-area');

    fireEvent.click(tag);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove tag recap' }));
    await waitFor(() => expect(onUpdateConversationTags).toHaveBeenCalledWith('session-2', []));
    await waitFor(() =>
      expect(
        screen.getByTestId('jaina-conversation-time-session-2').parentElement?.textContent,
      ).not.toContain('#recap'),
    );
  });
});
