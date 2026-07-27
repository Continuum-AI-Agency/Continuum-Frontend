import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { OrganicSession } from '@/lib/organic/agent-sessions';
import { OrganicSessionSidebar } from './OrganicSessionSidebar';

afterEach(cleanup);

function renderSidebar(overrides: Partial<Parameters<typeof OrganicSessionSidebar>[0]> = {}) {
  const sessions: OrganicSession[] = [];
  return render(
    <OrganicSessionSidebar
      sessions={sessions}
      activeSessionId={null}
      isLoading={false}
      isInteractionDisabled={false}
      onNewSession={() => {}}
      onSelectSession={() => {}}
      onDeleteSession={() => {}}
      {...overrides}
    />,
  );
}

describe('OrganicSessionSidebar collapse', () => {
  it('shows the full list with a hide control when expanded', () => {
    const { getByText, getByLabelText, queryByText } = renderSidebar({
      onToggleCollapsed: () => {},
    });
    expect(getByText('Chats')).toBeTruthy();
    expect(getByLabelText('Hide conversations')).toBeTruthy();
    expect(queryByText('Automations')).toBeNull();
  });

  it('collapses to a rail (expand affordance only, no chats list) when collapsed', () => {
    const { queryByText, getByLabelText } = renderSidebar({
      isCollapsed: true,
      onToggleCollapsed: () => {},
    });
    expect(getByLabelText('Show conversations')).toBeTruthy();
    expect(queryByText('Chats')).toBeNull();
  });

  it('fires the toggle when the hide control is clicked', () => {
    const onToggleCollapsed = mock(() => {});
    const { getByLabelText } = renderSidebar({ onToggleCollapsed });
    fireEvent.click(getByLabelText('Hide conversations'));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });
});

describe('OrganicSessionSidebar working marker', () => {
  const sessions: OrganicSession[] = [
    {
      sessionId: 'session-running',
      lastMessageRole: 'assistant',
      lastMessageAt: '2026-07-22T10:00:00.000Z',
      createdAt: '2026-07-22T09:00:00.000Z',
    } as OrganicSession,
    {
      sessionId: 'session-idle',
      lastMessageRole: 'user',
      lastMessageAt: '2026-07-22T08:00:00.000Z',
      createdAt: '2026-07-22T07:00:00.000Z',
    } as OrganicSession,
  ];

  it('marks a session as Working when it is in streamingSessionIds', () => {
    const { getByText } = renderSidebar({
      sessions,
      streamingSessionIds: new Set(['session-running']),
    });
    expect(getByText('Working')).toBeTruthy();
  });

  it('shows no Working marker when no session is streaming', () => {
    const { queryByText } = renderSidebar({ sessions, streamingSessionIds: new Set() });
    expect(queryByText('Working')).toBeNull();
  });

  it('keeps session rows interactive while another session is streaming', () => {
    // isInteractionDisabled is false now that runs are detached; a live run elsewhere must not
    // freeze the sidebar. The delete controls carry an accessible name, so assert none are
    // disabled while a session streams.
    const { getAllByLabelText } = renderSidebar({
      sessions,
      streamingSessionIds: new Set(['session-running']),
    });
    const deleteButtons = getAllByLabelText('Delete conversation') as HTMLButtonElement[];
    expect(deleteButtons.length).toBe(2);
    expect(deleteButtons.every((button) => !button.disabled)).toBe(true);
  });
});
