import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// happy-dom does not expose SyntaxError on its window object, which causes
// @testing-library/dom's querySelectorAll internals to crash. Polyfill it.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Radix context menus do not open under fireEvent in happy-dom. What this file
// owns is the WIRING — that each right-click action hands the cell's day/platform
// payload to onCreatePost — so stub the menu primitives to render inline, the same
// way CalendarDraftCard.test does.
mock.module('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuSeparator: () => <hr />,
  ContextMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

import { AddPostContextMenu } from './AddPostContextMenu';
import { AI_ONE_SHOT_ACTION, MANUAL_ADD_POST_ACTIONS } from './add-post-actions';
import type { PlannerPlatformKey } from './planner-platforms';

function renderMenu(props?: { platformKey?: PlannerPlatformKey; platformLabel?: string }) {
  const onCreatePost = mock();
  render(
    <AddPostContextMenu dayId="2026-02-23" onCreatePost={onCreatePost} {...props}>
      <div>cell surface</div>
    </AddPostContextMenu>,
  );
  return onCreatePost;
}

describe('AddPostContextMenu', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders every shared add-post action so the right-click menu cannot drift from the "+" menu', () => {
    renderMenu();

    for (const action of [...MANUAL_ADD_POST_ACTIONS, AI_ONE_SHOT_ACTION]) {
      expect(screen.getByText(action.label)).toBeTruthy();
    }
    expect(screen.getByText('Mon, Feb 23')).toBeTruthy();
  });

  it('labels the menu with the platform when the cell implies one', () => {
    renderMenu({ platformKey: 'linkedin', platformLabel: 'LinkedIn' });

    expect(screen.getByText('Mon, Feb 23 · LinkedIn')).toBeTruthy();
  });

  it('seeds a manual draft preset to the cell day and platform', () => {
    const onCreatePost = renderMenu({ platformKey: 'linkedin', platformLabel: 'LinkedIn' });

    fireEvent.click(screen.getByText('New post'));

    expect(onCreatePost).toHaveBeenCalledWith({
      dayId: '2026-02-23',
      platformKey: 'linkedin',
      status: 'draft',
      mode: 'manual',
      format: 'Post',
    });
  });

  it('threads the chosen manual format through (carousel)', () => {
    const onCreatePost = renderMenu();

    fireEvent.click(screen.getByText('New carousel'));

    expect(onCreatePost).toHaveBeenCalledWith({
      dayId: '2026-02-23',
      platformKey: undefined,
      status: 'draft',
      mode: 'manual',
      format: 'Carousel',
    });
  });

  it('routes the AI one-shot action to the composer path (mode ai, placeholder status)', () => {
    const onCreatePost = renderMenu({ platformKey: 'instagram', platformLabel: 'Instagram' });

    fireEvent.click(screen.getByText('AI one-shot post'));

    expect(onCreatePost).toHaveBeenCalledWith({
      dayId: '2026-02-23',
      platformKey: 'instagram',
      status: 'placeholder',
      mode: 'ai',
    });
  });
});
