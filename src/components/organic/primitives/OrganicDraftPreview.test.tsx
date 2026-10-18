import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { MediaAsset, PublishAccountCandidate } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEffect, useReducer, useState } from 'react';
import { ApiError } from '@/lib/api/errors';
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

// The dry run answers who the post goes out as. Unset, it never answers — the panel then
// shows the brand and keeps the account blocker hidden, which is the loading state.
type HttpOptions = { path: string; method?: string; body?: Record<string, unknown> };
const httpCalls: HttpOptions[] = [];
const fanOutCalls = () => httpCalls.filter((call) => call.path.endsWith('/fan-out'));
let dryRunResponse: unknown = null;
// The brand's posting accounts, every platform: what the identity row and the selector read.
let publishAccounts: PublishAccountCandidate[] = [];
// Set, field writes wait on it: a save still in flight.
let heldSave: Promise<unknown> | null = null;
// Set, the membership route refuses.
let fanOutFails = false;
// Set, adapt-caption answers 409 reapproval_required (the row is approved or scheduled).
let adaptNeedsReapproval = false;
const httpRequest = mock((opts: HttpOptions) => {
  httpCalls.push(opts);
  if (opts.path.includes('/publish-plan')) {
    return dryRunResponse ? Promise.resolve(dryRunResponse) : new Promise(() => {});
  }
  if (opts.path.startsWith('/api/organic/publish-accounts')) {
    return Promise.resolve({ accounts: publishAccounts });
  }
  if (heldSave && opts.path.endsWith('/fields')) return heldSave;
  if (opts.path.endsWith('/fan-out')) {
    if (fanOutFails) return Promise.reject(new Error('fan-out refused'));
    // The server answers with the group it now holds: one member per requested platform.
    const platforms = (opts.body?.platforms ?? []) as string[];
    return Promise.resolve({
      sourceId: 'be-add',
      sourcePlatform: platforms[0],
      groupId: '00000000-0000-4000-8000-00000000f001',
      members: platforms.map((platform, index) => ({
        id: index === 0 ? 'be-add' : `be-${platform}`,
        platform,
        clientKey: `ck::${platform}`,
        platformAccountId: null,
        status: 'draft',
        isSource: index === 0,
        created: index > 0,
      })),
      removed: [],
      retained: [],
    });
  }
  if (opts.path.endsWith('/adapt-caption')) {
    if (adaptNeedsReapproval) {
      return Promise.reject(
        new ApiError('Move this post back to draft before changing its caption.', 409, undefined, {
          error: 'reapproval_required',
          message: 'Move this post back to draft before changing its caption.',
        }),
      );
    }
    return Promise.resolve({
      memberId: 'be-tt',
      platform: 'tiktok',
      caption: 'Adapted for TikTok',
      previousCaption: 'TikTok copy',
      updatedAt: 'T-adapted',
    });
  }
  return Promise.resolve({ updated_at: 'T1' });
});
mock.module('@/lib/api/http', () => ({ request: httpRequest, http: { request: httpRequest } }));

const publishMock = mock();
mock.module('@/components/organic/hooks/usePublishDraft', () => ({
  usePublishDraft: mock(() => ({
    publish: publishMock,
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
  duplicateDraft: mock(),
  accountContext: { accountIds: { tiktok: 'acct-tt' }, accountOptions: {}, brandId: null },
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
// media Popover renders its anchor (so the media zone + storyboard still render)
// and, only while open, one library pick; the chips echo their props, the command
// menu is a marker.
const PICKED_ASSET: MediaAsset = {
  id: 'picked-1',
  brandId: 'brand-1',
  kind: 'image',
  bucket: 'media-library',
  storagePath: 'brands/brand-1/picked.jpg',
  fileName: 'picked.jpg',
  mimeType: 'image/jpeg',
  source: 'upload',
  status: 'ready',
  tags: [],
  detectedObjects: [],
  hasImageEmbedding: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  signedUrl: 'https://cdn/picked.jpg',
};

mock.module('./MediaSelectPopover', () => ({
  MediaSelectPopover: ({
    anchor,
    open,
    onAttachAssets,
  }: {
    anchor: ReactNode;
    open?: boolean;
    onAttachAssets: (assets: MediaAsset[]) => void;
  }) => (
    <div data-testid="media-select" data-open={String(Boolean(open))}>
      {anchor}
      {open && (
        <button type="button" onClick={() => onAttachAssets([PICKED_ASSET])}>
          Pick library image
        </button>
      )}
    </div>
  ),
}));

const formatChipClick = mock(() => {});
mock.module('./PostMetaChips', () => ({
  PostMetaChips: ({
    platforms,
    platformControl,
    format,
    formatLabel,
    timeLabel,
    actions,
  }: {
    platforms: string[];
    platformControl?: ReactNode;
    format: string;
    formatLabel?: string;
    timeLabel: string;
    actions?: ReactNode;
  }) => {
    return (
      <div data-testid="meta-chips">
        {platformControl}
        {platforms.map((platform) => (
          <span key={platform}>{platform}</span>
        ))}
        <button type="button" aria-label="Change format" onClick={formatChipClick}>
          {formatLabel ?? format}
        </button>
        <span data-testid="meta-format">{formatLabel ?? format}</span>
        <span>{timeLabel}</span>
        {actions}
      </div>
    );
  },
}));

// The menu is tested in its own file; here it records what the panel hands it.
type MenuAction = { label: string; onSelect: () => void; disabledReason?: string | null };
let menuProps: {
  mediaAction?: MenuAction;
  renderAction?: MenuAction;
  onShowDetails?: () => void;
  onPlatformOptions?: () => void;
  onMoveBackToDraft?: () => void;
} = {};
mock.module('./PostCommandMenu', () => ({
  PostCommandMenu: (props: typeof menuProps) => {
    menuProps = props;
    return <button type="button" aria-label="Post actions" />;
  },
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
// same context the (post-auth) layout wraps the whole app in; the brand's accounts are a query.
function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
const render = (ui: ReactNode) => rtlRender(ui, { wrapper: Providers });

// The store's updateDraft is a mock, so a media write is observed by replaying its
// last mutator onto the draft the test rendered.
const applyLastMediaWrite = (draft: OrganicCalendarDraft): OrganicCalendarDraft => {
  const calls = (calendarStoreState.updateDraft as ReturnType<typeof mock>).mock.calls;
  const mutate = calls.at(-1)?.[1] as
    | ((current: OrganicCalendarDraft) => OrganicCalendarDraft)
    | undefined;
  if (!mutate) throw new Error('no media write reached the store');
  return mutate(draft);
};

const renderPreview = () =>
  render(<OrganicDraftPreview draft={baseDraft()} brandProfileId="brand-1" />);

// Edit intent outlives a render, so every test starts without one.
beforeEach(() => {
  cleanup();
  resetEditingDraftId();
  dryRunResponse = null;
  publishAccounts = [];
  httpCalls.length = 0;
  heldSave = null;
  fanOutFails = false;
  adaptNeedsReapproval = false;
  menuProps = {};
});

const candidate = (
  id: string,
  platform: PublishAccountCandidate['platform'],
  handle: string,
): PublishAccountCandidate => ({
  id,
  platform,
  handle,
  displayName: null,
  avatarUrl: null,
  needsReauth: false,
  isDefault: false,
});

const clip = (storagePath = 'library/clip.mp4') => ({
  role: 'primary',
  kind: 'video' as const,
  slideIndex: 0,
  storagePath,
  storageUrl: `https://cdn.example/${storagePath}`,
  mimeType: 'video/mp4',
});

const image = (storagePath = 'library/img.png') => ({
  role: 'primary',
  kind: 'image' as const,
  slideIndex: 0,
  storagePath,
  storageUrl: `https://cdn.example/${storagePath}`,
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
  it('names the post in one identity row: account, format, time, one ⋯ menu and close', () => {
    const onClose = mock();
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft()}
        brandName="Pink Elephant"
        brandProfileId="brand-1"
        onClose={onClose}
      />,
    );
    // The account is the row's own stamp, never the brand standing in for it (A4).
    expect(container.querySelector('[data-review-account]')?.textContent).not.toContain(
      'Pink Elephant',
    );
    expect(container.querySelector('[data-review-when]')?.textContent).toBe('Post · Not scheduled');
    expect(screen.getAllByLabelText('Post actions')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Close preview'));
    expect(onClose).toHaveBeenCalledTimes(1);
    // The schedule chips sit with the primary action, not in a second header.
    expect(screen.getByTestId('meta-chips').textContent).toContain('9:00 AM');
  });

  it('keeps the inspiration source in Details and rejects unsafe links', () => {
    const { rerender } = render(
      <OrganicDraftPreview
        draft={baseDraft({ inspirationSourceUrl: 'https://www.instagram.com/p/original/' })}
      />,
    );
    expect(screen.queryByText('Inspiration source · View original post')).toBeNull();
    act(() => menuProps.onShowDetails?.());
    expect(screen.getByText('Inspiration source · View original post').getAttribute('href')).toBe(
      'https://www.instagram.com/p/original/',
    );
    rerender(
      <OrganicDraftPreview draft={baseDraft({ inspirationSourceUrl: 'javascript:alert(1)' })} />,
    );
    expect(screen.queryByText('Inspiration source · View original post')).toBeNull();
  });

  it('edits the caption in place, with no edit mode to enter first', () => {
    renderPreview();
    const readout = screen.getByLabelText('Edit Instagram caption');
    expect(readout.tagName).toBe('BUTTON');
    expect(readout.textContent).toContain('Test caption');
    expect(screen.queryByLabelText('Edit post')).toBeNull();

    fireEvent.click(readout);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Test caption');
  });

  // Opening the caption switches the slot to scrolling; if that remounts the caption, Escape
  // drops focus to <body> and the next Escape cannot close the panel (wave-1 U7).
  it('returns focus to the caption it opened from on Escape', async () => {
    renderPreview();
    fireEvent.click(screen.getByLabelText('Edit Instagram caption'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Edit Instagram caption')),
    );
  });

  it('locks a published post: no caption editor, no media picker', () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ status: 'published', publishingAssets: [image()] })}
        brandProfileId="brand-1"
      />,
    );
    expect(screen.queryByLabelText('Edit Instagram caption')).toBeNull();
    expect(screen.getByText('Test caption')).toBeTruthy();
    expect(screen.queryByTestId('media-select')).toBeNull();
  });

  // #233b: the hover card's Edit raises the intent from another component tree; this panel
  // answers it by opening the caption, then hands the intent back.
  it('opens the caption when the store carries an edit intent for this draft, then clears it', () => {
    (calendarStoreState.beginEditingDraft as (id: string) => void)('draft-1');
    renderPreview();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Test caption');
    expect(calendarStoreState.editingDraftId).toBeNull();
  });

  it('ignores an edit intent that belongs to a different draft', () => {
    (calendarStoreState.beginEditingDraft as (id: string) => void)('some-other-draft');
    renderPreview();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(calendarStoreState.editingDraftId).toBe('some-other-draft');
  });
});

describe('OrganicDraftPreview — media state', () => {
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
    // The media zone is live without an edit mode: the storyboard and its next step show.
    expect(screen.getAllByText('Blueprint ready').length).toBeGreaterThan(0);
    expect(screen.getByAltText('Test post — storyboard frame 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generate final media' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use your own creative' })).toBeTruthy();
  });

  it('offers Generate media and Enrich in the empty media zone after a text preview revision', () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          backendDraftId: 'be-1',
          mediaSuggestion: { mediaStatus: 'pending', previewRevision: 'revision-1' },
        })}
        brandProfileId="brand-1"
      />,
    );
    expect(screen.getByRole('button', { name: 'Generate media' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enrich (sketch first)' })).toBeTruthy();
  });

  it('offers no stage actions in the empty media zone for a draft without a persisted backend id', () => {
    render(<OrganicDraftPreview draft={baseDraft()} brandProfileId="brand-1" />);
    expect(screen.getByTestId('drop-zone')).toBeTruthy();
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

  // Gating #3: a one-image post could not grow; its "+" lives on the same strip as a carousel's.
  it('shows the slide strip on a one-image post so it can grow into a carousel', () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ publishingAssets: [image()] })}
        brandProfileId="brand-1"
      />,
    );
    expect(screen.getByTestId('carousel-strip')).toBeTruthy();
  });

  it('shows no slide strip on a one-image post for a platform without carousels', () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ platforms: ['youtube'], format: 'Reel', publishingAssets: [image()] })}
        brandProfileId="brand-1"
      />,
    );
    expect(screen.queryByTestId('carousel-strip')).toBeNull();
  });
});

// Gating #2: the picker mounted only in edit mode, so these buttons did nothing in view mode.
describe('OrganicDraftPreview — the picker opens from every entry point, without an edit mode', () => {
  const pickerOpen = () => screen.getAllByTestId('media-select')[0]?.getAttribute('data-open');

  it("opens from the storyboard's Use your own creative", () => {
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
    expect(pickerOpen()).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Use your own creative' }));
    expect(pickerOpen()).toBe('true');
  });

  it("opens from Details' Reuse from library", async () => {
    render(<OrganicDraftPreview draft={baseDraft()} brandProfileId="brand-1" />);
    act(() => menuProps.onShowDetails?.());
    // The library entry lives in the media summary's hover card, as the user reaches it.
    const trigger = screen.getByLabelText('Media enrichment details');
    fireEvent.pointerEnter(trigger);
    fireEvent.mouseEnter(trigger);
    fireEvent.focus(trigger);
    fireEvent.click(await screen.findByRole('button', { name: /Reuse from library/ }));
    expect(pickerOpen()).toBe('true');
  });

  it("opens from the full-screen creative's Replace", () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ publishingAssets: [image()] })}
        brandProfileId="brand-1"
      />,
    );
    fireEvent.click(screen.getByLabelText('Enlarge creative'));
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(pickerOpen()).toBe('true');
  });
});

describe('OrganicDraftPreview — readiness and the primary action', () => {
  // Gating #6/#11: approve and publish read the row, so typing still coalescing must land first.
  const typeCaption = (value: string) => {
    fireEvent.click(screen.getByLabelText('Edit Instagram caption'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  };
  const fieldsSent = (id: string) =>
    httpCalls.filter((call) => call.path.endsWith(`/${id}/fields`)).map((call) => call.body);

  it('sends the caption still being typed before it approves', async () => {
    let sentBeforeApprove: unknown[] = [];
    const onApprove = mock(() => {
      sentBeforeApprove = fieldsSent('be-order');
      return Promise.resolve(true);
    });
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          backendDraftId: 'be-order',
          updatedAt: 'T0',
          publishingAssets: [image()],
        })}
        brandProfileId="brand-1"
        onApprove={onApprove}
      />,
    );
    typeCaption('Typed just now');
    fireEvent.click(screen.getByRole('button', { name: 'Approve & schedule' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(sentBeforeApprove).toEqual([
      expect.objectContaining({ caption: 'Typed just now', expected_updated_at: 'T0' }),
    ]);
  });

  it('waits for a media save in flight before it approves', async () => {
    let releaseSave: (value: unknown) => void = () => {};
    heldSave = new Promise((resolve) => {
      releaseSave = resolve;
    });
    const draft = baseDraft({
      backendDraftId: 'be-media',
      updatedAt: 'T0',
      format: 'Carousel',
      publishingAssets: [
        { ...image('a.png'), slideIndex: 0 },
        { ...image('b.png'), slideIndex: 1 },
        { ...image('c.png'), slideIndex: 2 },
      ],
    });
    const updateDraft = calendarStoreState.updateDraft as ReturnType<typeof mock>;
    updateDraft.mockImplementation(
      (_id: string, mutate: (current: OrganicCalendarDraft) => OrganicCalendarDraft) =>
        mutate(draft),
    );
    const onApprove = mock(() => Promise.resolve(true));
    render(<OrganicDraftPreview draft={draft} brandProfileId="brand-1" onApprove={onApprove} />);

    fireEvent.click(screen.getAllByLabelText('Enlarge creative')[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(httpCalls.some((call) => call.path.endsWith('/be-media/fields'))).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve & schedule' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onApprove).not.toHaveBeenCalled();

    releaseSave({ updated_at: 'T1' });
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    updateDraft.mockReset();
  });

  it('waits for an account pick already on the wire before it approves', async () => {
    let releaseSave: (value: unknown) => void = () => {};
    heldSave = new Promise((resolve) => {
      releaseSave = resolve;
    });
    publishAccounts = [
      candidate('acct-a', 'instagram', 'acme_a'),
      candidate('acct-b', 'instagram', 'acme_b'),
    ];
    const onApprove = mock(() => Promise.resolve(true));
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          backendDraftId: 'be-moving',
          updatedAt: 'T0',
          targetAccountId: 'acct-a',
          publishingAssets: [image()],
        })}
        brandProfileId="brand-1"
        onApprove={onApprove}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Instagram account: @acme_a' }));
    const other = within(screen.getByRole('radiogroup', { name: 'Instagram account' })).getByRole(
      'radio',
      { name: '@acme_b' },
    );
    fireEvent.pointerDown(other);
    fireEvent.click(other);
    await waitFor(() =>
      expect(httpCalls.some((call) => call.path.endsWith('/be-moving/fields'))).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve & schedule' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onApprove).not.toHaveBeenCalled();

    releaseSave({ updated_at: 'T1' });
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
  });

  it('sends the caption still being typed before it publishes now', async () => {
    publishMock.mockClear();
    let sentBeforePublish: unknown[] = [];
    publishMock.mockImplementation(() => {
      sentBeforePublish = fieldsSent('be-pub-order');
    });
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          backendDraftId: 'be-pub-order',
          updatedAt: 'T0',
          publishingAssets: [image()],
        })}
        brandProfileId="brand-1"
      />,
    );
    typeCaption('Typed then published');
    fireEvent.click(screen.getByRole('button', { name: 'Publish now' }));
    await waitFor(() => expect(publishMock).toHaveBeenCalledTimes(1));
    expect(sentBeforePublish).toEqual([
      expect.objectContaining({ caption: 'Typed then published' }),
    ]);
    publishMock.mockImplementation(() => {});
  });

  // Gating #4/#5/#13: the reason reads as text, each blocker is a numbered jump to its fix.
  it('lists each blocker as a numbered fix and disables approve with the count as text', () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({ captionPreview: '' })}
        brandProfileId="brand-1"
        onApprove={mock()}
      />,
    );
    const fixes = Array.from(container.querySelectorAll('[data-readiness-fix]'));
    expect(fixes.map((fix) => fix.getAttribute('data-readiness-fix')).sort()).toEqual([
      'caption',
      'media',
    ]);
    expect(fixes[0]?.textContent?.startsWith('1. ')).toBe(true);
    const approve = screen.getByRole('button', { name: 'Approve & schedule' });
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('2 to fix')).toBeTruthy();
  });

  it('jumps to the caption from its fix', () => {
    const { container } = render(
      <OrganicDraftPreview draft={baseDraft({ captionPreview: '' })} brandProfileId="brand-1" />,
    );
    fireEvent.click(container.querySelector('[data-readiness-fix="caption"]') as HTMLElement);
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('opens the media picker from the media fix', () => {
    const { container } = render(
      <OrganicDraftPreview draft={baseDraft({ captionPreview: '' })} brandProfileId="brand-1" />,
    );
    const openPickers = () =>
      screen
        .getAllByTestId('media-select')
        .filter((node) => node.getAttribute('data-open') === 'true');
    expect(openPickers()).toHaveLength(0);
    fireEvent.click(container.querySelector('[data-readiness-fix="media"]') as HTMLElement);
    expect(openPickers()).toHaveLength(1);
  });

  it('opens the format chip from the format fix', () => {
    formatChipClick.mockClear();
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({ platforms: ['linkedin'], format: 'Story', publishingAssets: [image()] })}
        brandProfileId="brand-1"
      />,
    );
    fireEvent.click(container.querySelector('[data-readiness-fix="format"]') as HTMLElement);
    expect(formatChipClick).toHaveBeenCalledTimes(1);
  });

  it('says it is ready once nothing blocks it', () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ captionPreview: 'Ready caption', publishingAssets: [image()] })}
        brandProfileId="brand-1"
        onApprove={mock()}
      />,
    );
    expect(screen.getByText('Ready to schedule')).toBeTruthy();
    const approve = screen.getByRole('button', { name: 'Approve & schedule' });
    expect(approve.getAttribute('aria-disabled')).not.toBe('true');
  });

  // Gating #14: one approve in flight, one busy button.
  it('approves once while the approval is in flight and shows it busy', async () => {
    let finish: (value: boolean) => void = () => {};
    const onApprove = mock(() => new Promise<boolean>((resolve) => (finish = resolve)));
    render(
      <OrganicDraftPreview
        draft={baseDraft({ publishingAssets: [image()] })}
        brandProfileId="brand-1"
        onApprove={onApprove}
      />,
    );
    const approve = screen.getByRole('button', { name: 'Approve & schedule' });
    fireEvent.click(approve);
    fireEvent.click(approve);
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Approving…' })).toBeTruthy();
    await act(async () => finish(true));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('shows a scheduled post as scheduled, with no approve and a way back to draft', () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({ status: 'scheduled', publishingAssets: [image()] })}
        brandProfileId="brand-1"
        onApprove={mock()}
      />,
    );
    expect(container.querySelector('[data-review-status="scheduled"]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
    expect(menuProps.onMoveBackToDraft).toBeDefined();
  });

  // Gating #12: a published post offers neither approve nor publish.
  it('shows a published post as published, with nothing to approve or publish', () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({ status: 'published', publishingAssets: [image()] })}
        brandProfileId="brand-1"
        onApprove={mock()}
      />,
    );
    expect(container.querySelector('[data-review-status="published"]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish now' })).toBeNull();
  });

  // Gating #11: Publish now is the gated secondary, never an ungated menu item.
  it('hides Publish now while anything blocks the post, and publishes once it is clear', async () => {
    publishMock.mockClear();
    render(
      <OrganicDraftPreview draft={baseDraft({ captionPreview: '' })} brandProfileId="brand-1" />,
    );
    expect(screen.queryByRole('button', { name: 'Publish now' })).toBeNull();
    cleanup();

    render(
      <OrganicDraftPreview
        draft={baseDraft({ publishingAssets: [image()] })}
        brandProfileId="brand-1"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Publish now' }));
    await waitFor(() => expect(publishMock).toHaveBeenCalledTimes(1));
  });

  it('keeps the media inventory in Details and hands the next media step to the ⋯ menu', () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ backendDraftId: 'be-1' })}
        brandProfileId="brand-1"
      />,
    );
    expect(menuProps.mediaAction?.label).toBe('Generate copy');
    expect(screen.queryByText('No media yet')).toBeNull();
    act(() => menuProps.onShowDetails?.());
    expect(screen.getByText('No media yet')).toBeTruthy();
  });

  it('offers Render video in the menu only for an unrendered composition', () => {
    const onStitch = mock();
    const reel = (generated: boolean) =>
      baseDraft({
        format: 'Reel',
        mediaSuggestion: {
          mediaStatus: 'ready',
          reel: { generated, composition: { clips: [] } } as never,
        },
      });
    const { rerender } = render(
      <OrganicDraftPreview draft={reel(false)} brandProfileId="brand-1" onStitch={onStitch} />,
    );
    expect(menuProps.renderAction?.label).toBe('Render video');
    act(() => menuProps.renderAction?.onSelect());
    expect(onStitch).toHaveBeenCalledWith('draft-1');
    rerender(
      <OrganicDraftPreview draft={reel(true)} brandProfileId="brand-1" onStitch={onStitch} />,
    );
    expect(menuProps.renderAction).toBeUndefined();
  });
});

describe('OrganicDraftPreview — the publish plan', () => {
  const account = {
    id: 'acct-1',
    handle: 'pinkelephant',
    displayName: 'Pink Elephant',
    avatarUrl: null,
  };
  const dryRun = (accounts: (typeof account)[], boundAccountId: string | null) => ({
    plan: null,
    publishable: true,
    blockers: [],
    warnings: [],
    accounts,
    boundAccountId,
    wire: null,
  });

  // Gating #10: the account is known before the click, not discovered by a failed publish.
  it('names the real account handle the post goes out as', async () => {
    dryRunResponse = dryRun([account], 'acct-1');
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({
          backendDraftId: 'be-handle',
          targetAccountId: 'acct-1',
          publishingAssets: [image()],
        })}
        brandName="Brand"
        brandProfileId="brand-1"
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-review-account]')?.textContent).toBe('@pinkelephant'),
    );
    expect(
      httpCalls.some((call) => call.path.includes('/be-handle/publish-plan?platform=instagram')),
    ).toBe(true);
  });

  it('says no account is connected and makes it a fix', async () => {
    dryRunResponse = dryRun([], null);
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({ backendDraftId: 'be-noacct', publishingAssets: [image()] })}
        brandProfileId="brand-1"
        onApprove={mock()}
      />,
    );
    await waitFor(() => expect(screen.getByText('No account connected')).toBeTruthy());
    expect(container.querySelector('[data-readiness-fix="account"]')).toBeTruthy();
  });

  it('asks again on return from connecting an account, and the blocker clears', async () => {
    dryRunResponse = dryRun([], 'acct-1');
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({
          backendDraftId: 'be-connect',
          targetAccountId: 'acct-1',
          publishingAssets: [image()],
        })}
        brandProfileId="brand-1"
        onApprove={mock()}
      />,
    );
    await waitFor(() => expect(screen.getByText('No account connected')).toBeTruthy());

    dryRunResponse = dryRun([account], 'acct-1');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() =>
      expect(container.querySelector('[data-review-account]')?.textContent).toBe('@pinkelephant'),
    );
    expect(container.querySelector('[data-readiness-fix="account"]')).toBeNull();
    expect(httpCalls.filter((call) => call.path.includes('/be-connect/publish-plan'))).toHaveLength(
      2,
    );
  });

  it('has its notices region in place before the first notice, so that notice is announced', () => {
    const { container, rerender } = render(
      <OrganicDraftPreview
        draft={baseDraft({ format: 'Post', publishingAssets: [image('feed.png')] })}
        brandProfileId="brand-1"
      />,
    );
    const region = container.querySelector('[data-plan-notices]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.querySelector('[data-plan-notice]')).toBeNull();

    rerender(
      <OrganicDraftPreview
        draft={baseDraft({ format: 'Story', publishingAssets: [image('feed.png')] })}
        brandProfileId="brand-1"
      />,
    );
    expect(container.querySelector('[data-plan-notices]')).toBe(region);
    expect(region?.querySelector('[data-plan-notice="caption_not_sent"]')).toBeTruthy();
    expect(region?.className).not.toContain('sr-only');
  });

  it('notices every way what is sent differs from what was typed', () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({ format: 'Story', publishingAssets: [image('story.png')] })}
        brandProfileId="brand-1"
      />,
    );
    expect(container.querySelector('[data-plan-notice="caption_not_sent"]')).toBeTruthy();
    // The frame shows what goes out: a story sends no caption.
    expect(screen.queryByText('Test caption')).toBeNull();
  });

  // The selection is the group's rows: ticking hands the full set to the membership route,
  // and nothing writes a platform list from the browser (K1, C2).
  const openSelector = async () => {
    // Shut while the brand's accounts load: an unloaded list would read "Connect … first".
    const trigger = await screen.findByRole('button', { name: /^Change platforms/ });
    await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
    fireEvent.click(trigger);
    return screen.getByRole('menu');
  };

  it('ticks a platform through the membership route, with the whole card', async () => {
    publishAccounts = [candidate('acct-fb', 'facebook', 'acme_fb')];
    const draft = baseDraft({ backendDraftId: 'be-add', publishingAssets: [image()] });
    render(<OrganicDraftPreview draft={draft} brandProfileId="brand-1" />);
    const menu = await openSelector();
    await waitFor(() =>
      expect(
        within(menu)
          .getByRole('menuitemcheckbox', { name: 'Facebook' })
          .getAttribute('aria-disabled'),
      ).not.toBe('true'),
    );
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Facebook' }));
    await waitFor(() => expect(fanOutCalls()).toHaveLength(1));
    expect(fanOutCalls()[0]).toMatchObject({
      path: '/api/organic/calendar/drafts/be-add/fan-out',
      method: 'POST',
      body: { platforms: ['instagram', 'facebook'] },
    });
    expect(httpCalls.some((call) => call.path.endsWith('/fields'))).toBe(false);
  });

  it('keeps the selector shut, saying why, until the draft has a row', () => {
    render(<OrganicDraftPreview draft={baseDraft()} brandProfileId="brand-1" />);
    expect(screen.getByRole('button', { name: /^Change platforms/ }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByText('Saving…')).toBeTruthy();
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
        draft={{ ...videoDraft('https://cdn.example/clip-poster.jpg'), status: 'published' }}
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
    // The stubbed drop zone renders only the fallback ACTIONS; the real
    // library/upload split is gated on the same empty-media state, which a video
    // draft must no longer reach.
    expect(screen.queryByText('No media')).toBeNull();
  });

  // The preview is the post: a poster-less video paints its first frame (the chat tile, which
  // loads no bytes before hover, would leave it a blank tile — planner:preview #231).
  it('renders a poster-less library video with a first-frame seek, loading its metadata', () => {
    const { container } = render(
      <OrganicDraftPreview draft={videoDraft(null)} brandProfileId="brand-1" />,
    );
    const video = videoIn(container);
    expect(video).toBeTruthy();
    expect(video?.getAttribute('poster')).toBeNull();
    expect(video?.getAttribute('src')).toBe('https://cdn.example/clip.mp4#t=0.01');
    expect(video?.getAttribute('preload')).toBe('metadata');
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
  it('offers a platform-neutral publish action for a multi-platform draft', () => {
    cleanup();
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          platforms: ['instagram', 'facebook', 'linkedin'],
          publishingAssets: [image()],
        })}
        brandProfileId="brand-1"
      />,
    );
    expect(screen.getByRole('button', { name: 'Publish now' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish to Instagram' })).toBeNull();
  });
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
  });

  it('renders no frame switcher for a single-platform draft', () => {
    renderPreview();
    expect(screen.queryByText('See it on')).toBeNull();
  });

  it('renders a frame switcher for every selected platform when there is more than one', () => {
    render(<OrganicDraftPreview draft={multiPlatformDraft()} brandProfileId="brand-1" />);

    expect(screen.getByText('See it on')).toBeTruthy();
    // Named by the contracts label, never an abbreviation.
    expect(screen.getByRole('button', { name: 'Instagram' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Facebook' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'LinkedIn' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  // THE regression this guards: "look at it on LinkedIn" must not quietly drop
  // Facebook and Instagram from the post.
  it('switches the rendered frame without mutating draft.platforms', () => {
    render(<OrganicDraftPreview draft={multiPlatformDraft()} brandProfileId="brand-1" />);
    expect(screen.getByLabelText('Edit Instagram caption')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'LinkedIn' }));

    // The frame — and the caption's enforced char limit — follow the selector.
    expect(screen.getByLabelText('Edit LinkedIn post copy')).toBeTruthy();
    expect(screen.queryByLabelText('Edit Instagram caption')).toBeNull();
    expect(screen.getByRole('button', { name: 'LinkedIn' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    // The post itself is untouched: no store write, and all three chips remain.
    expect(calendarStoreState.updateDraft as ReturnType<typeof mock>).not.toHaveBeenCalled();
    const chips = screen.getByTestId('meta-chips');
    expect(chips.textContent).toContain('instagram');
    expect(chips.textContent).toContain('facebook');
    expect(chips.textContent).toContain('linkedin');
  });

  it('approves every platform at once, in one call for the whole post', async () => {
    const onApprove = mock(() => Promise.resolve(true));
    render(
      <OrganicDraftPreview
        draft={multiPlatformDraft()}
        brandProfileId="brand-1"
        onApprove={onApprove}
      />,
    );

    const cta = screen.getByRole('button', { name: 'Approve for 3 platforms' });
    fireEvent.click(cta);

    // The rows already exist; the workspace approves every member of the group.
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove).toHaveBeenCalledWith('draft-1');
  });

  it('keeps the single-platform CTA and the single-draft approve path intact', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Approve & schedule' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('draft-1'));
  });
});

// TikTok and YouTube used to fall through to "Preview for tiktok is coming soon", which never
// mounted the media: no video, no drop zone, no library picker, and a disabled Publish button
// labelled "Instagram". The vertical platforms must also avoid Instagram feed chrome.
describe('OrganicDraftPreview — every publishable platform previews and posts', () => {
  beforeEach(() => {
    cleanup();
    resetEditingDraftId();
  });

  const reelDraft = (platform: string) =>
    baseDraft({
      platforms: [platform as OrganicCalendarDraft['platforms'][number]],
      format: 'Reel',
      publishingAssets: [
        {
          role: 'primary',
          kind: 'video',
          storagePath: 'library/clip.mp4',
          storageUrl: 'https://cdn.example/clip.mp4',
        },
      ],
    });

  it('holds the TikTok frame open with the live media zone until it has creative', () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({ platforms: ['tiktok'], format: 'Reel' })}
        brandProfileId="brand-1"
      />,
    );

    const frame = container.querySelector('[data-preview-frame="tiktok"]');
    expect(frame?.getAttribute('data-frame-kind')).toBe('vertical');
    expect(frame?.querySelector('[data-frame-media] [data-testid="drop-zone"]')).toBeTruthy();
    expect(screen.getByText('Test caption')).toBeTruthy();
  });

  it('holds a frame with no picker open on a Needs media placeholder', () => {
    render(<OrganicDraftPreview draft={baseDraft({ platforms: ['tiktok'], format: 'Reel' })} />);
    // Dark in both themes, so the neutral-50 overlay chrome stays legible on it.
    expect(screen.getByText('Needs media').parentElement?.className).toContain('bg-neutral-900');
    expect(screen.getByRole('button', { name: 'Add media' })).toBeTruthy();
  });

  it('renders a text-only Facebook post with no media box at all', () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({ platforms: ['facebook'], format: 'Post' })}
        brandProfileId="brand-1"
      />,
    );

    const frame = container.querySelector('[data-preview-frame="facebook"]');
    expect(frame?.getAttribute('data-frame-kind')).toBe('feed');
    expect(frame?.querySelector('[data-frame-media]')).toBeNull();
    expect(screen.queryByText('Needs media')).toBeNull();
    expect(screen.queryByText('No media')).toBeNull();
    expect(screen.getByText('Test caption')).toBeTruthy();
    // The header names the draft's own slot, never a made-up "Just now".
    expect(frame?.textContent).toContain('9:00 AM');
    expect(frame?.textContent).not.toContain('Just now');
    // Media is still one click away, from under the frame rather than inside it.
    expect(screen.getByRole('button', { name: 'Add photo or video' })).toBeTruthy();
  });

  it('previews a published Instagram story with story chrome and no caption overlay', () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({
          status: 'published',
          format: 'Story',
          publishingAssets: [
            {
              role: 'primary',
              kind: 'image',
              storagePath: 'library/story.png',
              storageUrl: 'https://cdn.example/story.png',
            },
          ],
        })}
        brandProfileId="brand-1"
      />,
    );

    const frame = container.querySelector('[data-preview-frame="instagram"]');
    expect(frame?.getAttribute('data-frame-kind')).toBe('story');
    expect(frame?.querySelector('[data-story-progress]')).toBeTruthy();
    expect(screen.getByText('Send message')).toBeTruthy();
    expect(screen.queryByText('Test caption')).toBeNull();
    expect(screen.getByText('Stories post without a caption')).toBeTruthy();
  });

  it('previews a 16:9 YouTube video on the long-form watch page, titled by its first line', () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({
          platforms: ['youtube'],
          format: 'Reel',
          captionPreview: '\n  How we brew it  \nThe full walkthrough.',
          publishingAssets: [
            {
              role: 'primary',
              kind: 'video',
              storagePath: 'library/long.mp4',
              storageUrl: 'https://cdn.example/long.mp4',
              width: 1920,
              height: 1080,
            },
          ],
        })}
        brandProfileId="brand-1"
      />,
    );

    const frame = container.querySelector('[data-preview-frame="youtube"]');
    expect(frame?.getAttribute('data-frame-kind')).toBe('landscape');
    // The title is the first line; the description is the whole caption, as the publisher
    // sends it (youtubePublisher), so the first line reads in both.
    expect(frame?.textContent?.split('How we brew it').length).toBe(3);
    expect(screen.getByText(/The full walkthrough\./)).toBeTruthy();
    // Never-sent decoration is gone while the post is editable.
    expect(screen.queryByText('Subscribe')).toBeNull();
    expect(screen.queryByText('Shorts')).toBeNull();
    expect(screen.getByTestId('meta-format').textContent).toBe('Video');
  });

  for (const [platform, format, label, railIcon] of [
    ['instagram', 'Reel', 'Reel', 'lucide-send'],
    ['facebook', 'Reel', 'Reel', 'lucide-forward'],
    ['youtube', 'Reel', 'Short', 'lucide-thumbs-down'],
    ['tiktok', 'Reel', 'Video', 'lucide-bookmark'],
  ] as const) {
    it(`calls a ${platform} vertical video a ${label}, with its action rail only once posted`, () => {
      const { container, rerender } = render(
        <OrganicDraftPreview draft={{ ...reelDraft(platform), format }} brandProfileId="brand-1" />,
      );

      expect(screen.getByTestId('meta-format').textContent).toBe(label);
      expect(
        container.querySelector('[data-review-when]')?.textContent?.startsWith(`${label} · `),
      ).toBe(true);
      const frame = () => container.querySelector(`[data-preview-frame="${platform}"]`);
      expect(frame()?.getAttribute('data-frame-kind')).toBe('vertical');
      expect(frame()?.querySelector(`svg.${railIcon}`)).toBeNull();

      rerender(
        <OrganicDraftPreview
          draft={{ ...reelDraft(platform), format, status: 'published' }}
          brandProfileId="brand-1"
        />,
      );
      expect(frame()?.querySelector(`svg.${railIcon}`)).toBeTruthy();
    });
  }

  it('shows story chrome only on a story', () => {
    const { container } = render(
      <OrganicDraftPreview draft={baseDraft()} brandProfileId="brand-1" />,
    );

    expect(container.querySelector('[data-frame-kind]')?.getAttribute('data-frame-kind')).toBe(
      'feed',
    );
    expect(container.querySelector('[data-story-progress]')).toBeNull();
    expect(screen.queryByText('Send message')).toBeNull();
  });

  for (const [platform, label] of [
    ['tiktok', 'TikTok'],
    ['youtube', 'YouTube'],
  ] as const) {
    it(`mounts the ${label} media and offers to publish it now`, () => {
      const { container } = render(
        <OrganicDraftPreview draft={reelDraft(platform)} brandProfileId="brand-1" />,
      );

      expect(screen.queryAllByText(/coming soon/i).length).toBe(0);
      expect(container.querySelector('video')?.getAttribute('src')).toContain(
        'https://cdn.example/clip.mp4',
      );
      // A vertical clip with no stored size previews as a Short; TikTok carries no label.
      expect(
        container
          .querySelector(`[data-preview-frame="${platform}"]`)
          ?.getAttribute('data-frame-kind'),
      ).toBe('vertical');
      expect(screen.queryAllByText('Shorts').length).toBe(0);
      expect(screen.queryByText('Sponsored')).toBeNull();
      const publish = screen.getByRole('button', { name: 'Publish now' });
      expect(publish.getAttribute('aria-disabled')).not.toBe('true');
    });

    it(`offers the ${label} media zone and caption editor without an edit mode`, () => {
      render(
        <OrganicDraftPreview
          draft={baseDraft({ platforms: [platform] })}
          brandProfileId="brand-1"
        />,
      );

      expect(screen.getByTestId('media-select')).toBeTruthy();
      expect(screen.getByTestId('drop-zone')).toBeTruthy();
      expect(screen.getByLabelText(`Edit ${label} caption`)).toBeTruthy();
    });
  }
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
    rerender(<OrganicDraftPreview draft={shrunk} brandProfileId="brand-1" />);

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
      <OrganicDraftPreview draft={sparseCarousel({ id: 'draft-2' })} brandProfileId="brand-1" />,
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

  // #402: Replace swaps the slide on screen and keeps the others.
  it('replaces only the enlarged slide from the read-only preview', () => {
    const draft = sparseCarousel();
    render(<OrganicDraftPreview draft={draft} brandProfileId="brand-1" />);

    fireEvent.click(screen.getByLabelText('Next slide'));
    fireEvent.click(screen.getByLabelText('Enlarge creative'));
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    fireEvent.click(screen.getByText('Pick library image'));

    const paths = applyLastMediaWrite(draft).publishingAssets?.map((asset) => asset.storagePath);
    expect(paths).toContain(PICKED_ASSET.storagePath);
    expect(paths).toContain('a.jpg');
    expect(paths).toContain('b.jpg');
    expect(paths).not.toContain('c.jpg');
  });
});

// #402 — the lightbox Replace opened a library picker that only exists in edit mode,
// so from the default read-only preview the click closed the lightbox and did nothing.
describe('OrganicDraftPreview — replacing the creative (#402)', () => {
  beforeEach(() => cleanup());

  const singleImageDraft = () =>
    baseDraft({
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'single' },
      publishingAssets: [
        {
          role: 'primary',
          kind: 'image',
          slideIndex: 0,
          storagePath: 'old.jpg',
          storageUrl: 'https://cdn/old.jpg',
        },
      ],
    });

  it('opens the library picker from the read-only lightbox and swaps the photo', () => {
    const draft = singleImageDraft();
    render(<OrganicDraftPreview draft={draft} brandProfileId="brand-1" />);

    fireEvent.click(screen.getByLabelText('Enlarge creative'));
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    fireEvent.click(screen.getByText('Pick library image'));

    const paths = applyLastMediaWrite(draft).publishingAssets?.map((asset) => asset.storagePath);
    expect(paths).toEqual([PICKED_ASSET.storagePath]);
  });

  it('offers no Replace on a published post, where no picker is mounted', () => {
    render(
      <OrganicDraftPreview
        draft={{ ...singleImageDraft(), status: 'published' }}
        brandProfileId="brand-1"
      />,
    );

    fireEvent.click(screen.getByLabelText('Enlarge creative'));
    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull();
  });
});

// A grouped card is one row per platform: the frame in view edits ITS row.
describe('OrganicDraftPreview — each frame is its own row', () => {
  const fieldCalls = () => httpCalls.filter((call) => call.path.endsWith('/fields'));
  const groupCard = () => {
    const tiktok = baseDraft({
      id: 'draft-1::tiktok',
      platforms: ['tiktok'],
      backendDraftId: 'be-tt',
      updatedAt: 'T-tt',
      captionPreview: 'TikTok copy',
      targetAccountId: 'acct-tt',
      groupId: 'group-1',
      publishingAssets: [image()],
    });
    return baseDraft({
      platforms: ['instagram', 'tiktok'],
      backendDraftId: 'be-ig',
      updatedAt: 'T-ig',
      captionPreview: 'Instagram copy',
      targetAccountId: 'acct-ig',
      groupId: 'group-1',
      groupMembers: [
        {
          backendDraftId: 'be-ig',
          platform: 'instagram',
          status: 'draft',
          clientKey: 'k',
          accountId: 'acct-ig',
        },
        {
          backendDraftId: 'be-tt',
          platform: 'tiktok',
          status: 'draft',
          clientKey: 'k::tiktok',
          accountId: 'acct-tt',
          draft: tiktok,
        },
      ],
      publishingAssets: [image()],
    });
  };

  it('(b) a caption typed on the TikTok frame PATCHes the TikTok row and never the Instagram one', async () => {
    render(<OrganicDraftPreview draft={groupCard()} brandProfileId="brand-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'TikTok' }));
    expect(screen.getByLabelText('Edit TikTok caption').textContent).toContain('TikTok copy');
    fireEvent.click(screen.getByLabelText('Edit TikTok caption'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Only for TikTok' } });
    await waitFor(() => expect(fieldCalls().length).toBe(1), { timeout: 2000 });
    expect(fieldCalls()[0]?.path).toBe('/api/organic/calendar/drafts/be-tt/fields');
    expect(fieldCalls()[0]?.body).toMatchObject({
      caption: 'Only for TikTok',
      expected_updated_at: 'T-tt',
    });
    expect(fieldCalls().some((call) => call.path.includes('/be-ig/'))).toBe(false);
  });

  // The platforms the store was told to show, one entry per write that changed them.
  const platformWrites = () =>
    (calendarStoreState.updateDraft as ReturnType<typeof mock>).mock.calls
      .map((call) =>
        (call[1] as (draft: OrganicCalendarDraft) => OrganicCalendarDraft)(baseDraft()),
      )
      .map((draft) => draft.platforms)
      .filter((platforms) => platforms.join() !== baseDraft().platforms.join());

  const tickTikTok = async () => {
    publishAccounts = [candidate('acct-tt', 'tiktok', 'acme_tt')];
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          backendDraftId: 'be-add',
          updatedAt: 'T0',
          format: 'Reel',
          publishingAssets: [clip()],
        })}
        brandProfileId="brand-1"
      />,
    );
    const trigger = screen.getByRole('button', { name: /^Change platforms/ });
    await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
    fireEvent.click(trigger);
    const tiktok = () =>
      within(screen.getByRole('menu')).getByRole('menuitemcheckbox', { name: 'TikTok' });
    await waitFor(() => expect(tiktok().getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(tiktok());
    await waitFor(() => expect(fanOutCalls()).toHaveLength(1));
    expect(fanOutCalls()[0]?.path).toBe('/api/organic/calendar/drafts/be-add/fan-out');
    expect(fanOutCalls()[0]?.body).toEqual({ platforms: ['instagram', 'tiktok'] });
  };

  it('(d) ticking TikTok asks the server for the member row; refused, the card never shows it', async () => {
    fanOutFails = true;
    await tickTikTok();
    await waitFor(() => expect(screen.getByText('Platforms not changed')).toBeTruthy());
    expect(platformWrites()).toEqual([]);
  });

  it("(d) the card shows the server's answer at once, so a second tick builds on it", async () => {
    await tickTikTok();
    await waitFor(() => expect(platformWrites()).toEqual([['instagram', 'tiktok']]));
  });

  it("(e) names each frame's stamped account before any dry run answers, never the brand", async () => {
    publishAccounts = [
      candidate('acct-ig', 'instagram', 'acme_ig'),
      candidate('acct-tt', 'tiktok', 'acme_tt'),
    ];
    const { container } = render(
      <OrganicDraftPreview
        draft={groupCard()}
        brandName="Pink Elephant"
        brandProfileId="brand-1"
      />,
    );
    const account = () => container.querySelector('[data-review-account]')?.textContent;
    await waitFor(() => expect(account()).toBe('@acme_ig'));
    fireEvent.click(screen.getByRole('button', { name: 'TikTok' }));
    expect(account()).toBe('@acme_tt');
    expect(container.querySelector('[data-review-identity]')?.textContent).not.toContain(
      'Pink Elephant',
    );
  });

  it('(f) picking an account PATCHes the frame row with that account alone', async () => {
    publishAccounts = [
      candidate('acct-tt', 'tiktok', 'acme_tt'),
      candidate('acct-tt2', 'tiktok', 'acme_tt2'),
    ];
    render(<OrganicDraftPreview draft={groupCard()} brandProfileId="brand-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'TikTok' }));
    fireEvent.click(await screen.findByRole('button', { name: 'TikTok account: @acme_tt' }));
    const pick = within(screen.getByRole('radiogroup', { name: 'TikTok account' })).getByRole(
      'radio',
      { name: '@acme_tt2' },
    );
    fireEvent.pointerDown(pick);
    fireEvent.click(pick);
    await waitFor(() => expect(fieldCalls()).toHaveLength(1));
    expect(fieldCalls()[0]?.path).toBe('/api/organic/calendar/drafts/be-tt/fields');
    expect(fieldCalls()[0]?.body).toEqual({ accountId: 'acct-tt2', expected_updated_at: 'T-tt' });
  });

  it("(g) Apply to all platforms PATCHes every other member with this frame's caption", async () => {
    render(<OrganicDraftPreview draft={groupCard()} brandProfileId="brand-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'TikTok' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all platforms' }));
    await waitFor(() => expect(fieldCalls()).toHaveLength(1));
    expect(fieldCalls()[0]?.path).toBe('/api/organic/calendar/drafts/be-ig/fields');
    expect(fieldCalls()[0]?.body).toMatchObject({
      caption: 'TikTok copy',
      expected_updated_at: 'T-ig',
    });
  });

  it('Adapt on a scheduled row says why and offers "Move back to draft"', async () => {
    adaptNeedsReapproval = true;
    render(<OrganicDraftPreview draft={groupCard()} brandProfileId="brand-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'TikTok' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adapt for TikTok' }));
    expect(
      await screen.findByText('Move this post back to draft before changing its caption.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move back to draft' })).toBeTruthy();
  });

  it('Adapt for TikTok asks the server to rewrite the TikTok row, and shows what it saved', async () => {
    const updateDraft = calendarStoreState.updateDraft as ReturnType<typeof mock>;
    updateDraft.mockClear();
    render(<OrganicDraftPreview draft={groupCard()} brandProfileId="brand-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'TikTok' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adapt for TikTok' }));
    await waitFor(() =>
      expect(httpCalls.find((call) => call.path.endsWith('/adapt-caption'))).toMatchObject({
        path: '/api/organic/calendar/drafts/be-tt/adapt-caption',
        method: 'POST',
        body: { platform: 'tiktok' },
      }),
    );
    await waitFor(() => expect(updateDraft).toHaveBeenCalled());
    const [draftId, mutate] = updateDraft.mock.calls.at(-1) as [
      string,
      (draft: OrganicCalendarDraft) => OrganicCalendarDraft,
    ];
    expect(draftId).toBe('draft-1::tiktok');
    expect(mutate(baseDraft())).toMatchObject({
      captionPreview: 'Adapted for TikTok',
      updatedAt: 'T-adapted',
    });
  });
});
