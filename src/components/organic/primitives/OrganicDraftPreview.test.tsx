import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  act,
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEffect, useReducer } from 'react';
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

// Edit mode is store state (a hover card in another component tree raises the
// intent), so the stub has to be STATEFUL and has to re-render its subscribers. A
// fixed-value stub would leave `isEditing` false forever and every edit-mode
// assertion below would silently measure the read-only tree instead.
let editingDraftId: string | null = null;
const storeSubscribers = new Set<() => void>();
const notifyStore = () => {
  for (const subscriber of storeSubscribers) subscriber();
};

const resetEditingDraftId = () => {
  editingDraftId = null;
};

const calendarStoreStub = createCalendarStoreStub({
  updateDraft: mock(),
  bulkDeleteDrafts: mock(),
  accountContext: { accountIds: {}, accountOptions: {}, brandId: null },
  get editingDraftId() {
    return editingDraftId;
  },
  setEditingDraftId: (id: string | null) => {
    editingDraftId = id;
    notifyStore();
  },
  beginEditingDraft: (id: string) => {
    editingDraftId = id;
    notifyStore();
  },
});

const calendarStoreState = calendarStoreStub.useCalendarStore.getState() as Record<string, unknown>;

calendarStoreStub.useCalendarStore.mockImplementation((selector: (state: unknown) => unknown) => {
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);
  useEffect(() => {
    storeSubscribers.add(forceRender);
    return () => {
      storeSubscribers.delete(forceRender);
    };
  }, []);
  return selector(calendarStoreState);
});

mock.module('@/lib/organic/store', () => calendarStoreStub);

mock.module('./AiStudioHandoffContext', () => ({
  useOpenDraftInAiStudio: () => undefined,
}));

// Controllable signing mocks: the re-sign tests flip the resolved URL per test
// and assert the exact durable pair each leg signs with.
const signMediaAssetMock = mock((_args: { brandId: string; assetId: string }) =>
  Promise.resolve<string | null>(null),
);
const signOrganicMediaAssetMock = mock((_args: { brandId: string; bucket: string; path: string }) =>
  Promise.resolve<string | null>(null),
);

mock.module('@/lib/organic/hyperframeSign', () => ({
  signMediaAsset: signMediaAssetMock,
  signOrganicMediaAsset: signOrganicMediaAssetMock,
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
    platforms,
    format,
    timeLabel,
    actions,
  }: {
    platforms: string[];
    format: string;
    timeLabel: string;
    actions?: ReactNode;
  }) => (
    <div data-testid="meta-chips">
      {platforms.map((platform) => (
        <span key={platform}>{platform}</span>
      ))}
      <span>{format}</span>
      <span>{timeLabel}</span>
      {actions}
    </div>
  ),
}));

const fanOutAndApproveMock = mock(() => Promise.resolve(true));
mock.module('@/components/organic/hooks/useFanOutDraft', () => ({
  useFanOutDraft: () => ({ fanOutAndApprove: fanOutAndApproveMock, isFanningOut: false }),
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

// Edit intent outlives a render, so every test starts in read-only mode.
beforeEach(() => {
  cleanup();
  resetEditingDraftId();
});

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

  // #233b: the hover card's Edit button raises the intent from a different component
  // tree, so the panel has to read edit mode off the store rather than local state.
  it('enters edit mode when the store carries an edit intent for this draft', () => {
    (calendarStoreState.beginEditingDraft as (id: string) => void)('draft-1');
    renderPreview();
    expect(screen.getByLabelText('Edit instagram caption')).toBeTruthy();
    expect(screen.getByLabelText('Done editing post')).toBeTruthy();
  });

  it('ignores an edit intent that belongs to a different draft', () => {
    (calendarStoreState.beginEditingDraft as (id: string) => void)('some-other-draft');
    renderPreview();
    expect(screen.queryByLabelText('Edit instagram caption')).toBeNull();
  });

  it('clears the store edit intent when editing is toggled off', () => {
    (calendarStoreState.beginEditingDraft as (id: string) => void)('draft-1');
    renderPreview();
    fireEvent.click(screen.getByLabelText('Done editing post'));
    expect(calendarStoreState.editingDraftId).toBeNull();
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

// Single-image drafts persist their durable pair on mediaSuggestion itself
// (bucket + url as a storage path) with no publishingAssets/reel/hyperframe row
// claiming it — the preview must re-sign that pair too, or the image 404s once
// the upload-time signed URL expires (~1h).
describe('OrganicDraftPreview — single-image re-sign', () => {
  beforeEach(() => {
    cleanup();
    signOrganicMediaAssetMock.mockClear();
    signOrganicMediaAssetMock.mockImplementation(() => Promise.resolve<string | null>(null));
  });

  it('re-signs the durable single-image pair and swaps in the fresh URL', async () => {
    signOrganicMediaAssetMock.mockImplementation(() =>
      Promise.resolve<string | null>('https://fresh.example/img.png'),
    );
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          mediaSuggestion: {
            mediaStatus: 'ready',
            bucket: 'brand-profile-assets',
            url: 'organic/d/img.png',
            assetUrl: 'https://expired.example/img.png',
          },
        })}
        brandProfileId="brand-1"
      />,
    );

    await waitFor(() => {
      expect(signOrganicMediaAssetMock).toHaveBeenCalledWith({
        brandId: 'brand-1',
        bucket: 'brand-profile-assets',
        path: 'organic/d/img.png',
      });
      const img = screen.getByAltText('Test post — slide 1');
      expect(img.getAttribute('src')).toBe('https://fresh.example/img.png');
    });
  });

  it('never signs a user-supplied plain https URL', async () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          mediaSuggestion: {
            mediaStatus: 'user_supplied',
            bucket: 'brand-profile-assets',
            url: 'https://cdn.example/user.png',
            assetUrl: 'https://cdn.example/user.png',
          },
        })}
        brandProfileId="brand-1"
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(signOrganicMediaAssetMock).not.toHaveBeenCalled();
  });

  it('signs a restored publishing asset whose storageUrl is empty once a bucket is threaded', async () => {
    signOrganicMediaAssetMock.mockImplementation(() =>
      Promise.resolve<string | null>('https://fresh.example/asset.png'),
    );
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          publishingAssets: [
            {
              role: 'primary',
              kind: 'image',
              slideIndex: 0,
              bucket: 'brand-profile-assets',
              storagePath: 'organic/d/final.png',
              storageUrl: '',
            },
          ],
        })}
        brandProfileId="brand-1"
      />,
    );

    await waitFor(() => {
      expect(signOrganicMediaAssetMock).toHaveBeenCalledWith({
        brandId: 'brand-1',
        bucket: 'brand-profile-assets',
        path: 'organic/d/final.png',
      });
    });
  });
});

// #231 — the attach persists, but the preview could not render video at all: both
// media areas were next/image only and the resolvers filtered to kind === 'image',
// so an attached video resolved to nothing and the phone preview showed the empty
// "Select from library / Upload from your computer" split instead.
describe('OrganicDraftPreview — attached video renders', () => {
  beforeEach(() => cleanup());

  const videoDraft = (poster: string | null) =>
    baseDraft({
      publishingAssets: [
        {
          role: 'primary',
          kind: 'video',
          storagePath: 'library/clip.mp4',
          storageUrl: 'https://cdn.example/clip.mp4',
        },
      ],
      mediaSuggestion: {
        kind: 'reel',
        mediaStatus: 'user_supplied',
        url: null,
        assetUrl: null,
        signedUrl: null,
        assets: null,
        reel: {
          generated: true,
          url: 'library/clip.mp4',
          bucket: 'brand-profile-assets',
          signedUrl: 'https://cdn.example/clip.mp4',
          thumbnailUrl: poster,
          durationSec: 12,
        },
      },
    });

  const videoIn = (container: HTMLElement) => container.querySelector('video');

  it('renders a <video> with its poster in the read-only media area', () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={videoDraft('https://cdn.example/clip-poster.jpg')}
        brandProfileId="brand-1"
      />,
    );
    const video = videoIn(container);
    expect(video).toBeTruthy();
    expect(video?.getAttribute('poster')).toBe('https://cdn.example/clip-poster.jpg');
    expect(video?.getAttribute('src')).toBe('https://cdn.example/clip.mp4');
  });

  it('renders a <video> with its poster in the editable media area', () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={videoDraft('https://cdn.example/clip-poster.jpg')}
        brandProfileId="brand-1"
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit post'));
    const video = videoIn(container);
    expect(video).toBeTruthy();
    expect(video?.getAttribute('poster')).toBe('https://cdn.example/clip-poster.jpg');
  });

  it('never renders the empty library/upload fallback for a draft that has a video', () => {
    render(
      <OrganicDraftPreview
        draft={videoDraft('https://cdn.example/clip-poster.jpg')}
        brandProfileId="brand-1"
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit post'));
    // The stubbed drop zone renders only the fallback ACTIONS; the real
    // library/upload split is gated on the same empty-media state, which a video
    // draft must no longer reach.
    expect(screen.queryByText('No media')).toBeNull();
  });

  it('falls back to a first-frame seek when the library asset has no poster', () => {
    const { container } = render(
      <OrganicDraftPreview draft={videoDraft(null)} brandProfileId="brand-1" />,
    );
    const video = videoIn(container);
    expect(video).toBeTruthy();
    expect(video?.getAttribute('poster')).toBeNull();
    expect(video?.getAttribute('src')).toBe('https://cdn.example/clip.mp4#t=0.01');
  });

  it('still renders an image draft as an image, not a video', () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({
          publishingAssets: [
            {
              role: 'primary',
              kind: 'image',
              slideIndex: 0,
              storagePath: 'library/img.png',
              storageUrl: 'https://cdn.example/img.png',
            },
          ],
        })}
        brandProfileId="brand-1"
      />,
    );
    expect(videoIn(container)).toBeNull();
    expect(screen.getByAltText('Test post — slide 1')).toBeTruthy();
  });
});

// #235: one editable draft, N destinations. The frame selector is the payoff of
// multi-select — check how ONE copy lands on each surface before committing.
describe('OrganicDraftPreview — multi-platform frame selector', () => {
  const multiPlatformDraft = () =>
    baseDraft({
      platforms: ['instagram', 'facebook', 'linkedin'],
      publishingAssets: [
        {
          role: 'primary',
          kind: 'image',
          slideIndex: 0,
          storagePath: 'library/img.png',
          storageUrl: 'https://cdn.example/img.png',
        },
      ],
    });

  beforeEach(() => {
    cleanup();
    resetEditingDraftId();
    (calendarStoreState.updateDraft as ReturnType<typeof mock>).mockClear();
    fanOutAndApproveMock.mockClear();
  });

  it('renders no frame switcher for a single-platform draft', () => {
    renderPreview();
    expect(screen.queryByText('See it on')).toBeNull();
  });

  it('renders a frame switcher for every selected platform when there is more than one', () => {
    render(<OrganicDraftPreview draft={multiPlatformDraft()} brandProfileId="brand-1" />);

    expect(screen.getByText('See it on')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'IG' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'FB' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'LI' }).getAttribute('aria-pressed')).toBe('false');
  });

  // THE regression this guards: "look at it on LinkedIn" must not quietly drop
  // Facebook and Instagram from the post.
  it('switches the rendered frame without mutating draft.platforms', () => {
    render(<OrganicDraftPreview draft={multiPlatformDraft()} brandProfileId="brand-1" />);
    fireEvent.click(screen.getByLabelText('Edit post'));
    expect(screen.getByLabelText('Edit instagram caption')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'LI' }));

    // The frame — and the caption's enforced char limit — follow the selector.
    expect(screen.getByLabelText('Edit linkedin post copy')).toBeTruthy();
    expect(screen.queryByLabelText('Edit instagram caption')).toBeNull();
    expect(screen.getByRole('button', { name: 'LI' }).getAttribute('aria-pressed')).toBe('true');

    // The post itself is untouched: no store write, and all three chips remain.
    expect(calendarStoreState.updateDraft as ReturnType<typeof mock>).not.toHaveBeenCalled();
    const chips = screen.getByTestId('meta-chips');
    expect(chips.textContent).toContain('instagram');
    expect(chips.textContent).toContain('facebook');
    expect(chips.textContent).toContain('linkedin');
  });

  it('offers to approve every platform at once and fans out instead of approving one row', () => {
    const onApprove = mock();
    render(
      <OrganicDraftPreview
        draft={multiPlatformDraft()}
        brandProfileId="brand-1"
        onApprove={onApprove}
      />,
    );

    const cta = screen.getByRole('button', { name: 'Approve for 3 platforms' });
    fireEvent.click(cta);

    // Fan-out is a backend row-copy: a browser-cloned sibling would fail the publish
    // gate, which reads media and caption exclusively from content_json.
    expect(fanOutAndApproveMock).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('keeps the single-platform CTA and the single-draft approve path intact', () => {
    const onApprove = mock();
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          publishingAssets: [
            {
              role: 'primary',
              kind: 'image',
              slideIndex: 0,
              storagePath: 'library/img.png',
              storageUrl: 'https://cdn.example/img.png',
            },
          ],
        })}
        brandProfileId="brand-1"
        onApprove={onApprove}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve & Schedule' }));
    expect(onApprove).toHaveBeenCalledWith('draft-1');
    expect(fanOutAndApproveMock).not.toHaveBeenCalled();
  });
});

// #255 — "if you pass the carousel very fast it shows the same image". Persisted
// slideIndex is sparse (and absent on assets the agent never numbered) while the
// preview counts array positions; mixing the two made the badge, the chevrons and
// the strip disagree about which slide was on screen.
describe('OrganicDraftPreview — carousel slide navigation', () => {
  beforeEach(() => cleanup());

  // Display order after sorting by slideIndex (absent sorts last): a, c, b.
  const sparseCarousel = (overrides: Partial<OrganicCalendarDraft> = {}) =>
    baseDraft({
      format: 'Carousel',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
      publishingAssets: [
        {
          role: 'primary',
          kind: 'image',
          slideIndex: 0,
          storagePath: 'a.jpg',
          storageUrl: 'https://cdn/a.jpg',
        },
        // No slideIndex at all — this is the asset that used to render as "1/3".
        {
          role: 'primary',
          kind: 'image',
          storagePath: 'b.jpg',
          storageUrl: 'https://cdn/b.jpg',
        },
        {
          role: 'primary',
          kind: 'image',
          slideIndex: 7,
          storagePath: 'c.jpg',
          storageUrl: 'https://cdn/c.jpg',
        },
      ],
      ...overrides,
    });

  const shownSlideSrc = () =>
    screen
      .getAllByRole('img')
      .map((img) => img.getAttribute('src'))
      .find((src) => src?.startsWith('https://cdn/'));

  it('advances one slide per Next click, and the badge counts positions not slideIndex', () => {
    render(<OrganicDraftPreview draft={sparseCarousel()} brandProfileId="brand-1" />);

    expect(screen.getByText('1/3')).toBeTruthy();
    expect(shownSlideSrc()).toBe('https://cdn/a.jpg');

    fireEvent.click(screen.getByLabelText('Next slide'));
    // c.jpg carries slideIndex 7 — the badge must still read 2/3.
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(shownSlideSrc()).toBe('https://cdn/c.jpg');
    expect(screen.getByAltText('Test post — slide 2')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Next slide'));
    expect(screen.getByText('3/3')).toBeTruthy();
    expect(shownSlideSrc()).toBe('https://cdn/b.jpg');
    // Last slide: no further Next.
    expect(screen.queryByLabelText('Next slide')).toBeNull();
  });

  it('lands on slide 3 when two Next clicks are batched into a single render', () => {
    render(<OrganicDraftPreview draft={sparseCarousel()} brandProfileId="brand-1" />);

    // Fast clicking: both handlers run before React re-renders. Value setters
    // (activeIndex + 1) both computed from the same captured 0 and netted +1 —
    // the screen stayed on the same image.
    const next = screen.getByLabelText('Next slide');
    act(() => {
      next.click();
      next.click();
    });

    expect(screen.getByText('3/3')).toBeTruthy();
    expect(shownSlideSrc()).toBe('https://cdn/b.jpg');
  });

  it('agrees between a dot and a chevron on the same slide', () => {
    render(<OrganicDraftPreview draft={sparseCarousel()} brandProfileId="brand-1" />);

    fireEvent.click(screen.getByLabelText('Slide 3'));
    expect(screen.getByText('3/3')).toBeTruthy();
    expect(shownSlideSrc()).toBe('https://cdn/b.jpg');

    fireEvent.click(screen.getByLabelText('Previous slide'));
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(shownSlideSrc()).toBe('https://cdn/c.jpg');
  });

  it('clamps the position when the slide array shrinks under it', () => {
    const { rerender } = render(
      <OrganicDraftPreview draft={sparseCarousel()} brandProfileId="brand-1" />,
    );
    fireEvent.click(screen.getByLabelText('Slide 3'));
    expect(screen.getByText('3/3')).toBeTruthy();

    // Drop c.jpg — the draft now has two slides while the position sits at 2.
    const shrunk = sparseCarousel();
    shrunk.publishingAssets = shrunk.publishingAssets?.slice(0, 2);
    rerender(
      <ToastProvider>
        <OrganicDraftPreview draft={shrunk} brandProfileId="brand-1" />
      </ToastProvider>,
    );

    expect(screen.getByText('2/2')).toBeTruthy();
    expect(shownSlideSrc()).toBe('https://cdn/b.jpg');
  });

  it('resets to the first slide when the panel switches drafts', () => {
    const { rerender } = render(
      <OrganicDraftPreview draft={sparseCarousel()} brandProfileId="brand-1" />,
    );
    fireEvent.click(screen.getByLabelText('Slide 3'));
    expect(screen.getByText('3/3')).toBeTruthy();

    rerender(
      <ToastProvider>
        <OrganicDraftPreview draft={sparseCarousel({ id: 'draft-2' })} brandProfileId="brand-1" />
      </ToastProvider>,
    );

    expect(screen.getByText('1/3')).toBeTruthy();
    expect(shownSlideSrc()).toBe('https://cdn/a.jpg');
  });

  it('opens the creative full screen from the preview itself', () => {
    render(<OrganicDraftPreview draft={sparseCarousel()} brandProfileId="brand-1" />);

    fireEvent.click(screen.getByLabelText('Next slide'));
    fireEvent.click(screen.getByLabelText('Enlarge creative'));

    // The lightbox opens on the slide that was on screen, not on slide 1.
    expect(screen.getByText('Slide 2 of 3')).toBeTruthy();
  });
});
