import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

// happy-dom does not expose SyntaxError on its window object, which causes
// @testing-library/dom's querySelectorAll internals to crash. Polyfill it.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// next/image uses querySelectorAll internally in this happy-dom version.
// Replace with a plain <img> so the test environment doesn't crash.
mock.module('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { CalendarDraftCard } from './CalendarDraftCard';
import type { OrganicCalendarDraft } from './types';

const store = {
  updateDraft: mock(),
  bulkDeleteDrafts: mock(),
  duplicateDraft: mock(),
  beginEditingDraft: mock((_id: string) => undefined),
};

mock.module('@/lib/organic/store', () => createCalendarStoreStub(store));

mock.module('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuSeparator: () => <hr />,
  ContextMenuItem: ({
    children,
    onSelect,
    className,
    disabled,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    className?: string;
    disabled?: boolean;
  }) => (
    <button type="button" className={className} disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

mock.module('@/components/ui/hover-card', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

mock.module('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

mock.module('@/components/ui/progress', () => ({
  Progress: () => <div data-testid="progress" />,
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: mock() }),
  useToastContext: () => ({ show: mock() }),
}));

mock.module('@/components/organic/hooks/usePublishDraft', () => ({
  usePublishDraft: () => ({
    publish: mock(),
    retryPublish: mock(),
    isPublishing: false,
    stage: null,
    pollingAttempt: 0,
    tokenExpired: false,
    error: null,
  }),
}));

mock.module('@/components/organic/hooks/useProgressAnimation', () => ({
  useProgressAnimation: () => null,
}));

mock.module('./DraftHoverCardContent', () => ({
  DraftHoverCardContent: () => <div data-testid="hover-preview" />,
}));

const draft: OrganicCalendarDraft = {
  id: 'draft-1',
  title: 'Draft title',
  summary: 'Draft summary',
  timeLabel: '9:00 AM',
  dateLabel: 'Mon, Jan 1',
  status: 'draft',
  platforms: ['instagram'],
  format: 'Post',
  objective: 'Engagement',
  captionPreview: 'Caption text',
  tags: [],
  mediaCount: 1,
};

describe('CalendarDraftCard', () => {
  beforeEach(() => {
    // Reset only the store spies' call history between tests. A global
    // mock.restore() here would unregister the mock.module() stubs above,
    // letting real modules leak in and cross-contaminate sibling tests.
    store.updateDraft.mockClear();
    store.bulkDeleteDrafts.mockClear();
    store.beginEditingDraft.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('clicking the card focuses the side editor via onSelect', () => {
    const onSelect = mock();
    const { container } = render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={onSelect}
        onToggleSelection={mock()}
      />,
    );

    const cardButton = container.querySelector('button[aria-pressed]');
    expect(cardButton).toBeTruthy();
    if (!cardButton) return;

    fireEvent.click(cardButton);
    expect(onSelect).toHaveBeenCalledWith('draft-1');
  });

  // #233b: "Open in editor" used to be plain selection, which does nothing at all on
  // the card that is already selected — the normal case after one click.
  it('"Open in editor" raises the edit intent rather than merely selecting', () => {
    const onSelect = mock();
    render(
      <CalendarDraftCard
        draft={draft}
        isSelected
        isMultiSelected={false}
        onSelect={onSelect}
        onToggleSelection={mock()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));

    expect(store.beginEditingDraft).toHaveBeenCalledWith('draft-1');
  });

  // A quick edit should bring the card into the panel, not force it into edit mode.
  it('a quick edit selects without raising an edit intent', () => {
    render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={mock()}
        onToggleSelection={mock()}
      />,
    );

    fireEvent.click(screen.getAllByText('Platform: LinkedIn')[0]);

    expect(store.beginEditingDraft).not.toHaveBeenCalled();
  });

  it('quick platform edit updates draft and keeps editor focused', () => {
    const onSelect = mock();
    render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={onSelect}
        onToggleSelection={mock()}
      />,
    );

    fireEvent.click(screen.getAllByText('Platform: LinkedIn')[0]);

    expect(store.updateDraft).toHaveBeenCalledTimes(1);
    expect(store.updateDraft.mock.calls[0]?.[0]).toBe('draft-1');
    const updater = store.updateDraft.mock.calls[0]?.[1] as (
      currentDraft: OrganicCalendarDraft,
    ) => OrganicCalendarDraft;
    expect(updater(draft).platforms).toEqual(['linkedin']);
    expect(onSelect).toHaveBeenCalledWith('draft-1');
  });

  it('retry generation action calls onRegenerate', () => {
    const onSelect = mock();
    const onRegenerate = mock();
    render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={onSelect}
        onToggleSelection={mock()}
        onRegenerate={onRegenerate}
      />,
    );

    fireEvent.click(screen.getAllByText('Regenerate')[0]);

    expect(onRegenerate).toHaveBeenCalledWith('draft-1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('applies a quick time preset directly from the context menu', () => {
    const onSelect = mock();
    render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={onSelect}
        onToggleSelection={mock()}
      />,
    );

    fireEvent.click(screen.getAllByText('Time: 1:00 PM')[0]);

    expect(store.updateDraft).toHaveBeenCalledTimes(1);
    const updater = store.updateDraft.mock.calls[0]?.[1] as (
      currentDraft: OrganicCalendarDraft,
    ) => OrganicCalendarDraft;
    expect(updater(draft).timeLabel).toBe('1:00 PM');
    expect(onSelect).toHaveBeenCalledWith('draft-1');
  });

  it('exposes a custom time picker entry that defers mutation to the popover', () => {
    // The custom-time flow is deferred to the popover's Set button (not a direct
    // store mutation). Assert the entry is present; the popover itself is a Radix
    // portal exercised elsewhere.
    render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={mock()}
        onToggleSelection={mock()}
      />,
    );

    expect(screen.getAllByText('Time: Custom...')[0]).toBeTruthy();
    expect(store.updateDraft).not.toHaveBeenCalled();
  });

  it('only allows marking as scheduled when the time is valid', () => {
    const invalidTimeDraft: OrganicCalendarDraft = {
      ...draft,
      id: 'draft-2',
      timeLabel: '9 AM',
    };

    const { rerender } = render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={mock()}
        onToggleSelection={mock()}
      />,
    );

    fireEvent.click(screen.getAllByText('Approve & Schedule')[0]);
    expect(store.updateDraft).toHaveBeenCalledTimes(1);

    rerender(
      <CalendarDraftCard
        draft={invalidTimeDraft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={mock()}
        onToggleSelection={mock()}
      />,
    );

    fireEvent.click(screen.getAllByText('Approve & Schedule')[0]);
    expect(store.updateDraft).toHaveBeenCalledTimes(1);
  });

  it('clear failure button invokes onClearFailure for failed drafts', () => {
    const failedDraft: OrganicCalendarDraft = {
      ...draft,
      id: 'draft-failed',
      status: 'failed',
      generationError: 'Failed to generate post',
    };
    const onClearFailure = mock();

    render(
      <CalendarDraftCard
        draft={failedDraft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={mock()}
        onToggleSelection={mock()}
        onClearFailure={onClearFailure}
      />,
    );

    fireEvent.click(screen.getByText('Clear'));
    expect(onClearFailure).toHaveBeenCalledWith('draft-failed');
  });

  it('invokes the onMouseEnter hover callback for the preview surface', () => {
    const onMouseEnter = mock();
    const { container } = render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={mock()}
        onToggleSelection={mock()}
        onMouseEnter={onMouseEnter}
      />,
    );
    const cardButton = container.querySelector('button[aria-pressed]');
    expect(cardButton).toBeTruthy();
    if (!cardButton) return;

    fireEvent.mouseEnter(cardButton);
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
  });

  it("shows an explicit 'Text only' state for a pending draft with no media or storyboard", () => {
    const textOnly: OrganicCalendarDraft = {
      ...draft,
      id: 'draft-text-only',
      // mediaCount intentionally 1 to prove the chip no longer keys off it.
      mediaCount: 1,
      mediaSuggestion: { mediaStatus: 'pending' },
    };

    render(
      <CalendarDraftCard
        draft={textOnly}
        isSelected={false}
        isMultiSelected={false}
        onSelect={mock()}
        onToggleSelection={mock()}
      />,
    );

    expect(screen.getByText('Text only — no media yet')).toBeTruthy();
    expect(screen.queryByText('Blueprint ready')).toBeNull();
  });

  it("shows the storyboard + 'Blueprint ready' pill for a pending draft with a persisted storyboard", () => {
    const withStoryboard: OrganicCalendarDraft = {
      ...draft,
      id: 'draft-storyboard',
      mediaCount: 1,
      mediaSuggestion: {
        mediaStatus: 'pending',
        storyboard: [
          {
            role: 'primary',
            bucket: 'brand-profile-assets',
            storagePath: 'organic/d/preview/1.png',
            storageUrl: 'https://signed.example.com/1.png',
          },
        ],
      },
    };

    render(
      <CalendarDraftCard
        draft={withStoryboard}
        isSelected={false}
        isMultiSelected={false}
        onSelect={mock()}
        onToggleSelection={mock()}
      />,
    );

    expect(screen.getByText('Blueprint ready')).toBeTruthy();
    expect(screen.getByAltText('Storyboard frame 1')).toBeTruthy();
    expect(screen.queryByText('Text only — no media yet')).toBeNull();
  });

  it('offers both the render queue and AI Studio editing for prepared reel clips', () => {
    const preparedReel: OrganicCalendarDraft = {
      ...draft,
      id: 'draft-reel-ready',
      backendDraftId: 'backend-draft-1',
      mediaStage: 'storyboard_ready',
      mediaSuggestion: {
        mediaStatus: 'pending',
        reel: {
          generated: false,
          composition: {
            id: 'composition-1',
            brandId: 'brand-1',
            draftId: 'backend-draft-1',
            roomId: 'room-1',
            timelineNodeId: 'timeline-1',
            publishNodeId: 'publish-1',
            revision: 1,
            status: 'clips_ready',
            isCurrent: true,
            sourceFingerprint: 'sha256:abc',
            openHref: '/ai-studio?roomId=room-1&focusNodeId=timeline-1',
            returnHref: '/organic?tab=planner&draftId=backend-draft-1',
            createdAt: '2026-07-22T12:00:00.000Z',
            updatedAt: '2026-07-22T12:00:00.000Z',
          },
        },
      },
    };
    const onStitch = mock();
    const onRealize = mock();

    render(
      <CalendarDraftCard
        draft={preparedReel}
        isSelected={false}
        isMultiSelected={false}
        onSelect={mock()}
        onToggleSelection={mock()}
        onStitch={onStitch}
        onRealize={onRealize}
      />,
    );

    fireEvent.click(screen.getByText('Ready to render'));
    fireEvent.click(screen.getByText('Edit in AI Studio'));
    expect(onStitch).toHaveBeenCalledWith('draft-reel-ready');
    expect(onRealize).toHaveBeenCalledWith('draft-reel-ready');
  });

  it('shows a generating indicator while media is generating', () => {
    const generating: OrganicCalendarDraft = {
      ...draft,
      id: 'draft-generating',
      generationStage: 'Generating media…',
      mediaSuggestion: { mediaStatus: 'generating' },
    };

    render(
      <CalendarDraftCard
        draft={generating}
        isSelected={false}
        isMultiSelected={false}
        onSelect={mock()}
        onToggleSelection={mock()}
      />,
    );

    expect(screen.getByText('Generating media…')).toBeTruthy();
    expect(screen.queryByText('Text only — no media yet')).toBeNull();
  });

  it('does not render a text-only state when the draft has realized publishing assets', () => {
    const realized: OrganicCalendarDraft = {
      ...draft,
      id: 'draft-realized',
      mediaCount: 0,
      mediaSuggestion: { mediaStatus: 'ready' },
      publishingAssets: [
        {
          role: 'primary',
          kind: 'image',
          storagePath: 'p/1.png',
          storageUrl: 'https://signed.example.com/r.png',
        },
      ],
    };

    render(
      <CalendarDraftCard
        draft={realized}
        isSelected={false}
        isMultiSelected={false}
        onSelect={mock()}
        onToggleSelection={mock()}
      />,
    );

    expect(screen.queryByText('Text only — no media yet')).toBeNull();
    expect(screen.queryByText('Blueprint ready')).toBeNull();
  });
});
