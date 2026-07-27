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

    const goalsTab = screen.getByRole('radio', { name: 'Goals' }) as HTMLButtonElement;
    expect(goalsTab.disabled).toBe(false);
    fireEvent.click(goalsTab);
    expect(screen.getByText('Goal list')).not.toBeNull();
    expect(screen.getByText('Create campaign Goal')).not.toBeNull();
  });
});
