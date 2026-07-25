import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

mock.module('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

mock.module('@/lib/organic/store', () => createCalendarStoreStub({}));

mock.module('./DraftDeletionConfirmation', () => ({
  useDraftDeletionConfirmation: () => ({ requestDraftDeletion: mock() }),
}));

mock.module('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuSeparator: () => <hr />,
  ContextMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Radix's ScrollArea needs layout APIs happy-dom does not provide. The primitive
// is untouched by this fix and forwards className straight to its Root, so the
// call-site class list is what the assertion needs to see.
mock.module('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ className, children }: { className?: string; children: ReactNode }) => (
    <div data-testid="list-scroll-area" className={className}>
      {children}
    </div>
  ),
}));

// Positioning props are the whole #225 fix, so they are surfaced as attributes.
// happy-dom performs no layout, so where the card actually LANDS is a Playwright
// assertion, never this one.
mock.module('@/components/ui/hover-card', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({
    children,
    className,
    side,
    align,
    collisionPadding,
  }: {
    children: ReactNode;
    className?: string;
    side?: string;
    align?: string;
    collisionPadding?: number;
  }) => (
    <div
      data-testid="hover-card-content"
      data-side={side}
      data-align={align}
      data-collision-padding={String(collisionPadding)}
      className={className}
    >
      {children}
    </div>
  ),
}));

mock.module('./DraftHoverCardContent', () => ({
  DraftHoverCardContent: () => <div data-testid="hover-preview" />,
}));

import { OrganicListView } from './OrganicListView';
import type { OrganicCalendarDay, OrganicCalendarDraft } from './types';

function makeDraft(overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'draft-1',
    title: 'Draft title',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Jan 1',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Engagement',
    captionPreview: 'Caption text',
    tags: [],
    mediaCount: 1,
    ...overrides,
  };
}

function makeDay(slots: OrganicCalendarDraft[]): OrganicCalendarDay {
  return {
    id: '2026-07-25',
    label: 'Sat',
    dateLabel: 'Sat, Jul 25',
    suggestedTimes: [],
    slots,
  };
}

const NOOP = () => undefined;

function renderList(options: {
  days?: OrganicCalendarDay[];
  backlogDrafts?: OrganicCalendarDraft[];
  selectedDraftIds?: string[];
}) {
  return render(
    <OrganicListView
      days={options.days ?? []}
      platforms={[]}
      selectedDraftId={null}
      selectedDraftIds={options.selectedDraftIds ?? []}
      onSelectDraft={NOOP}
      onToggleSelection={NOOP}
      onRegenerate={NOOP}
      onCreatePost={NOOP}
      backlogDrafts={options.backlogDrafts ?? []}
      onAddBacklogDraft={NOOP}
      onDeleteBacklogDraft={NOOP}
      onPromoteBacklogDraft={NOOP}
    />,
  );
}

describe('OrganicListView', () => {
  afterEach(() => {
    cleanup();
  });

  // #227: `flex-1` alone leaves min-height:auto, the root grows to its intrinsic
  // content height, and the viewport never overflows — the list simply cannot scroll.
  it('bounds the scroll container so the viewport can overflow', () => {
    renderList({ days: [makeDay([makeDraft()])] });
    const scrollArea = screen.getByTestId('list-scroll-area');
    expect(scrollArea.className).toContain('min-h-0');
    expect(scrollArea.className).toContain('flex-1');
  });

  // The bulk bar is `fixed bottom-8` outside the panel group: it takes no layout
  // space, so without clearance the last rows are unreachable even once scrolling works.
  it('adds bottom clearance only while the bulk toolbar is shown', () => {
    renderList({ days: [makeDay([makeDraft()])] });
    expect(screen.queryByTestId('bulk-toolbar-clearance')).toBeNull();

    cleanup();
    renderList({ days: [makeDay([makeDraft()])], selectedDraftIds: ['draft-1'] });
    expect(screen.getByTestId('bulk-toolbar-clearance')).toBeTruthy();
  });

  it('renders an image draft thumbnail through the shared media primitive', () => {
    renderList({
      days: [
        makeDay([
          makeDraft({
            publishingAssets: [
              {
                role: 'primary',
                kind: 'image',
                storagePath: 'brand/img.png',
                storageUrl: 'https://cdn.test/img.png',
              },
            ],
          }),
        ]),
      ],
    });

    const thumbnail = screen.getByTestId('draft-row-thumbnail');
    const image = thumbnail.querySelector('img');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('https://cdn.test/img.png');
  });

  // #225 (blank squares): the row used to hand an image-only resolver to a raw
  // <img>, so a video draft painted an empty bg-muted box.
  it('renders a video draft as a real video with its poster, not a blank square', () => {
    renderList({
      days: [
        makeDay([
          makeDraft({
            format: 'Reel',
            mediaSuggestion: {
              reel: {
                generated: true,
                signedUrl: 'https://cdn.test/reel.mp4',
                thumbnailUrl: 'https://cdn.test/reel-poster.jpg',
              },
            },
          }),
        ]),
      ],
    });

    const thumbnail = screen.getByTestId('draft-row-thumbnail');
    const video = thumbnail.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe('https://cdn.test/reel.mp4');
    expect(video?.getAttribute('poster')).toBe('https://cdn.test/reel-poster.jpg');
  });

  // #225 (missing affordance): the tester was looking at BACKLOG, which had
  // neither a thumbnail nor a hover preview at all.
  it('gives backlog rows the same thumbnail and hover preview as draft rows', () => {
    renderList({
      backlogDrafts: [
        makeDraft({
          id: 'backlog-1',
          title: 'Backlog idea',
          publishingAssets: [
            {
              role: 'primary',
              kind: 'image',
              storagePath: 'brand/backlog.png',
              storageUrl: 'https://cdn.test/backlog.png',
            },
          ],
        }),
      ],
    });

    expect(screen.getByText('Backlog idea')).toBeTruthy();
    const thumbnail = screen.getByTestId('draft-row-thumbnail');
    expect(thumbnail.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/backlog.png',
    );
    expect(screen.getAllByTestId('hover-preview').length).toBe(1);
  });

  // #225 (off-screen card): `side="right"` on a full-width row flipped to `left`
  // and landed off the viewport, and the primitive's baked-in w-80 made the
  // collision box 48px wider than the 272px card the user actually sees.
  it('anchors the hover preview on the shift-correctable axis at the card width', () => {
    renderList({ days: [makeDay([makeDraft()])] });

    const content = screen.getByTestId('hover-card-content');
    expect(content.getAttribute('data-side')).toBe('bottom');
    expect(content.getAttribute('data-align')).toBe('start');
    expect(content.getAttribute('data-collision-padding')).toBe('12');
    expect(content.className).toContain('w-[272px]');
    expect(content.className).not.toContain('w-80');
  });

  it('keeps every clickable row reachable from the keyboard', () => {
    renderList({ days: [makeDay([makeDraft()])], backlogDrafts: [makeDraft({ id: 'backlog-1' })] });

    const rows = screen.getAllByRole('button').filter((el) => el.tagName === 'DIV');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.getAttribute('tabindex')).toBe('0');
    }
  });
});
