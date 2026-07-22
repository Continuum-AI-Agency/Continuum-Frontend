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
    const { getByText, getByLabelText } = renderSidebar({ onToggleCollapsed: () => {} });
    expect(getByText('Chats')).toBeTruthy();
    expect(getByLabelText('Hide conversations')).toBeTruthy();
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
