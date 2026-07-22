import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import type { OrganicCalendarDraft } from './types';

// happy-dom does not expose SyntaxError on its window object, which causes
// @testing-library/dom's querySelectorAll internals to crash. Polyfill it.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

mock.module('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

mock.module('./HyperFramePlayer', () => ({
  HyperFramePlayer: () => <div data-testid="hyperframe-player" />,
}));

mock.module('@/components/organic/hooks/usePublishDraft', () => ({
  usePublishDraft: mock(() => ({
    publish: mock(),
    isPublishing: false,
    stage: null,
    pollingAttempt: 0,
    tokenExpired: false,
  })),
}));

mock.module('@/lib/organic/store', () =>
  createCalendarStoreStub({ updateDraft: mock(), bulkDeleteDrafts: mock() }),
);

mock.module('./AiStudioHandoffContext', () => ({
  useOpenDraftInAiStudio: () => undefined,
}));

mock.module('@/lib/organic/hyperframeSign', () => ({
  signMediaAsset: mock(() => Promise.resolve(null)),
  signOrganicMediaAsset: mock(() => Promise.resolve(null)),
}));

mock.module('./CarouselSlideStrip', () => ({
  CarouselSlideStrip: () => <div data-testid="carousel-strip" />,
}));

mock.module('@/components/organic/hooks/useGenerateDraftMedia', () => ({
  useGenerateDraftMedia: mock(() => ({ generateDraftMedia: mock(), isGenerating: false })),
}));

// The contextual children are tested in their own files. Stub them here: the
// media Popover simply renders its anchor (so the media zone + storyboard still
// render), the chips echo their props, the command menu is a marker.
mock.module('./MediaSelectPopover', () => ({
  MediaSelectPopover: ({ anchor }: { anchor: ReactNode }) => (
    <div data-testid="media-select">{anchor}</div>
  ),
}));

mock.module('./PostMetaChips', () => ({
  PostMetaChips: ({
    platform,
    format,
    timeLabel,
    actions,
  }: {
    platform: string;
    format: string;
    timeLabel: string;
    actions?: ReactNode;
  }) => (
    <div data-testid="meta-chips">
      <span>{platform}</span>
      <span>{format}</span>
      <span>{timeLabel}</span>
      {actions}
    </div>
  ),
}));

mock.module('./PostCommandMenu', () => ({
  PostCommandMenu: () => <button type="button" aria-label="Post actions" />,
}));

mock.module('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  useDroppable: mock(() => ({ setNodeRef: mock(), isOver: false })),
  useDraggable: mock(() => ({
    setNodeRef: mock(),
    attributes: {},
    listeners: {},
    transform: null,
    isDragging: false,
  })),
  useSensor: mock(() => ({})),
  useSensors: mock((...sensors: unknown[]) => sensors),
  PointerSensor: class {},
  KeyboardSensor: class {},
  closestCenter: mock(),
}));

mock.module('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSortable: mock(() => ({
    setNodeRef: mock(),
    attributes: {},
    listeners: {},
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
  sortableKeyboardCoordinates: {},
  horizontalListSortingStrategy: {},
}));

mock.module('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' }, Translate: { toString: () => '' } },
}));

mock.module('motion/react', () => ({
  motion: {
    span: ({ children, ...props }: { children: ReactNode }) => <span {...props}>{children}</span>,
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

mock.module('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

mock.module('@/components/ui/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

mock.module('@/lib/organic/platforms', () => ({
  isOrganicPlatformKey: () => true,
}));

mock.module('./social-preview-utils', () => ({
  resolvePreviewAspectRatio: () => 1,
  resolvePreviewMaxWidth: () => 480,
}));

mock.module('./PreviewMediaDropZone', () => ({
  PreviewMediaDropZone: ({
    children,
    fallbackActions,
  }: {
    children?: ReactNode;
    fallbackActions?: Array<{ key: string; label: string; onSelect: () => void }>;
  }) => (
    <div data-testid="drop-zone">
      {fallbackActions?.map((action) => (
        <button key={action.key} type="button" onClick={action.onSelect}>
          {action.label}
        </button>
      ))}
      {children}
    </div>
  ),
}));

afterAll(() => mock.restore());

import { ToastProvider } from '@/components/ui/ToastProvider';
import { OrganicDraftPreview } from './OrganicDraftPreview';

// The preview's enrichment ladder surfaces enqueue failures as toasts, so it needs the
// same context the (post-auth) layout wraps the whole app in.
const render = (ui: ReactNode) => rtlRender(<ToastProvider>{ui}</ToastProvider>);

const renderPreview = () =>
  render(<OrganicDraftPreview draft={baseDraft()} brandProfileId="brand-1" />);

function baseDraft(overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'draft-1',
    title: 'Test post',
    summary: 'A summary',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Jan 1',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'engagement',
    captionPreview: 'Test caption',
    tags: [],
    mediaCount: 0,
    ...overrides,
  };
}

describe('OrganicDraftPreview — contextual shell', () => {
  beforeEach(() => cleanup());

  it('renders the glanceable metadata chips and the ⋯ command menu', () => {
    renderPreview();
    expect(screen.getByTestId('meta-chips')).toBeTruthy();
    expect(screen.getByText('instagram')).toBeTruthy();
    expect(screen.getByText('Post')).toBeTruthy();
    expect(screen.getByText('9:00 AM')).toBeTruthy();
    expect(screen.getByLabelText('Post actions')).toBeTruthy();
  });

  it('defaults to a locked read-only caption and reveals the editor only in edit mode', () => {
    renderPreview();
    // Read (default) mode: the caption text is shown, but there is no edit affordance.
    expect(screen.queryByLabelText('Edit instagram caption')).toBeNull();
    expect(screen.getByText('Test caption')).toBeTruthy();

    // The pencil toggle flips the whole preview into edit mode.
    fireEvent.click(screen.getByLabelText('Edit post'));
    const caption = screen.getByLabelText('Edit instagram caption');
    expect(caption.tagName).toBe('BUTTON');
    expect(caption.textContent).toContain('Test caption');

    // Toggling back locks the preview again.
    fireEvent.click(screen.getByLabelText('Done editing post'));
    expect(screen.queryByLabelText('Edit instagram caption')).toBeNull();
  });
});

describe('OrganicDraftPreview — media state', () => {
  beforeEach(() => cleanup());

  it("shows the persisted storyboard 'Blueprint ready' state for a pending text-only draft", () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          backendDraftId: 'be-1',
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
        })}
        brandProfileId="brand-1"
      />,
    );
    // "Blueprint ready" appears as the header enrichment pill regardless of mode.
    expect(screen.getAllByText('Blueprint ready').length).toBeGreaterThan(0);
    // The editable media slot (storyboard + generate/use-your-own CTAs) is gated
    // behind edit mode — the default locked preview never surfaces it.
    expect(screen.queryByAltText('Test post — storyboard frame 1')).toBeNull();
    fireEvent.click(screen.getByLabelText('Edit post'));
    expect(screen.getByAltText('Test post — storyboard frame 1')).toBeTruthy();
    // The blueprint state now exposes the durable next-step CTA directly (generate
    // final media) alongside the library fallback, instead of only opening the picker.
    expect(screen.getByRole('button', { name: 'Generate final media' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use your own creative' })).toBeTruthy();
  });

  it('surfaces the Generate media and Enrich stage actions after a text preview revision is ready', () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          backendDraftId: 'be-1',
          mediaSuggestion: { mediaStatus: 'pending', previewRevision: 'revision-1' },
        })}
        brandProfileId="brand-1"
      />,
    );

    // The generate/enrich stage actions live in the editable media slot, revealed
    // only after switching into edit mode.
    fireEvent.click(screen.getByLabelText('Edit post'));
    expect(screen.getByRole('button', { name: 'Generate media' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enrich (sketch first)' })).toBeTruthy();
  });

  it('offers no stage actions in the empty media slot for a draft without a persisted backend id', () => {
    render(<OrganicDraftPreview draft={baseDraft()} brandProfileId="brand-1" />);

    // Even inside the editable media slot, a draft with no persisted backend id
    // cannot headless-generate, so no stage actions are offered.
    fireEvent.click(screen.getByLabelText('Edit post'));
    expect(screen.queryByRole('button', { name: 'Generate media' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enrich (sketch first)' })).toBeNull();
  });

  it('suppresses the storyboard state once real media is attached', () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          format: 'Carousel',
          mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
          publishingAssets: [
            {
              role: 'primary',
              kind: 'image',
              slideIndex: 0,
              storagePath: 'p0.jpg',
              storageUrl: 'https://cdn/p0.jpg',
            },
            {
              role: 'primary',
              kind: 'image',
              slideIndex: 1,
              storagePath: 'p1.jpg',
              storageUrl: 'https://cdn/p1.jpg',
            },
          ],
        })}
        brandProfileId="brand-1"
      />,
    );
    expect(screen.queryByText('Blueprint ready')).toBeNull();
  });
});

describe('OrganicDraftPreview — schedule readiness', () => {
  beforeEach(() => cleanup());

  it('surfaces the schedule-requirements hint and gates Approve & Schedule when not ready', () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ captionPreview: '' })}
        brandProfileId="brand-1"
        onApprove={mock()}
      />,
    );
    // The checklist moved out of the footer into a hover popover on this chip;
    // the chip itself is what proves the unready state is surfaced.
    expect(screen.getByLabelText("Why this draft can't be scheduled yet")).toBeTruthy();
    const approve = screen.getByText('Approve & Schedule').closest('button') as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
  });

  it('hides the schedule-requirements hint once the draft is ready', () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          captionPreview: 'Ready caption',
          publishingAssets: [
            {
              role: 'primary',
              kind: 'image',
              slideIndex: 0,
              storagePath: 'p0.jpg',
              storageUrl: 'https://cdn/p0.jpg',
            },
          ],
        })}
        brandProfileId="brand-1"
        onApprove={mock()}
      />,
    );
    expect(screen.queryByLabelText("Why this draft can't be scheduled yet")).toBeNull();
  });

  it('renders the media-enrichment inventory label in the header', () => {
    renderPreview();
    expect(screen.getByText('No media yet')).toBeTruthy();
  });
});
