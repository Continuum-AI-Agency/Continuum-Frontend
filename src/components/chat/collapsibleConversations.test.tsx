import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';

import {
  CollapsedConversationsRail,
  useCollapsibleConversations,
} from './collapsibleConversations';

afterEach(cleanup);

describe('useCollapsibleConversations', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to expanded', () => {
    const { result } = renderHook(() => useCollapsibleConversations('test:key'));
    expect(result.current.isCollapsed).toBe(false);
  });

  it('toggles and persists the collapsed state to localStorage', () => {
    const { result } = renderHook(() => useCollapsibleConversations('test:key'));

    act(() => result.current.toggle());

    expect(result.current.isCollapsed).toBe(true);
    expect(window.localStorage.getItem('test:key')).toBe('true');

    act(() => result.current.toggle());

    expect(result.current.isCollapsed).toBe(false);
    expect(window.localStorage.getItem('test:key')).toBe('false');
  });

  it('hydrates the persisted collapsed state on mount', () => {
    window.localStorage.setItem('test:key', 'true');
    const { result } = renderHook(() => useCollapsibleConversations('test:key'));
    expect(result.current.isCollapsed).toBe(true);
  });
});

describe('CollapsedConversationsRail', () => {
  it('exposes expand and new-conversation actions and fires their callbacks', () => {
    const onExpand = mock(() => {});
    const onNewSession = mock(() => {});
    const { getByLabelText } = render(
      <CollapsedConversationsRail onExpand={onExpand} onNewSession={onNewSession} />,
    );

    fireEvent.click(getByLabelText('Show conversations'));
    expect(onExpand).toHaveBeenCalledTimes(1);

    fireEvent.click(getByLabelText('New conversation'));
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });

  it('disables the new-conversation action while interaction is disabled', () => {
    const onNewSession = mock(() => {});
    const { getByLabelText } = render(
      <CollapsedConversationsRail
        onExpand={() => {}}
        onNewSession={onNewSession}
        isInteractionDisabled
      />,
    );

    fireEvent.click(getByLabelText('New conversation'));
    expect(onNewSession).not.toHaveBeenCalled();
  });
});
