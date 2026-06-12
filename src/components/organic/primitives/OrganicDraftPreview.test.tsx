import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type { OrganicCalendarDraft } from "./types"

// happy-dom does not expose SyntaxError on its window object, which causes
// @testing-library/dom's querySelectorAll internals to crash. Polyfill it.
;(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError = SyntaxError

// next/image uses querySelectorAll internally in this happy-dom version.
// Replace with a plain <img> so the test environment doesn't crash.
mock.module("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

mock.module("./HyperFramePlayer", () => ({
  HyperFramePlayer: () => <div data-testid="hyperframe-player" />,
}))

mock.module("@/components/organic/hooks/usePublishDraft", () => ({
  usePublishDraft: mock(() => ({
    publish: mock(),
    isPublishing: false,
    stage: null,
    pollingAttempt: 0,
    tokenExpired: false,
  })),
}))

mock.module("@/lib/organic/store", () => ({
  useCalendarStore: mock((selector: (s: unknown) => unknown) =>
    selector({ updateDraft: mock() }),
  ),
}))

mock.module("@/lib/organic/hyperframeSign", () => ({
  signMediaAsset: mock(() => Promise.resolve(null)),
  signOrganicMediaAsset: mock(() => Promise.resolve(null)),
}))

mock.module("./LibraryPlacementRail", () => ({
  LibraryPlacementRail: () => <div data-testid="library-rail" />,
}))

mock.module("./CarouselSlideStrip", () => ({
  CarouselSlideStrip: () => <div data-testid="carousel-strip" />,
}))

mock.module("./OrganicCreativesPicker", () => ({
  OrganicCreativesPicker: () => <div data-testid="creatives-picker" />,
}))

mock.module("@/components/organic/hooks/useGenerateDraftMedia", () => ({
  useGenerateDraftMedia: mock(() => ({
    generateDraftMedia: mock(),
    isGenerating: false,
  })),
}))

mock.module("@dnd-kit/core", () => ({
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
}))

mock.module("@dnd-kit/sortable", () => ({
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
}))

mock.module("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" }, Translate: { toString: () => "" } },
}))

// useDraftMediaPlacement is NOT mocked here — the real hook runs against the
// mocked @/lib/organic/store above. OrganicDraftPreview tests only assert on
// badge text and button visibility (driven by draft props), so the real hook is
// sufficient and avoids poisoning the module registry for sibling test files.

mock.module("motion/react", () => ({
  motion: {
    span: ({ children, ...props }: { children: ReactNode }) => <span {...props}>{children}</span>,
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

mock.module("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

mock.module("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

mock.module("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

mock.module("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}))

mock.module("@/lib/organic/platforms", () => ({
  isOrganicPlatformKey: () => true,
}))

mock.module("./social-preview-utils", () => ({
  resolvePreviewAspectRatio: () => 1,
  resolvePreviewMaxWidth: () => 480,
}))

mock.module("./PreviewMediaDropZone", () => ({
  PreviewMediaDropZone: ({ children }: { children?: ReactNode }) => (
    <div data-testid="drop-zone">{children}</div>
  ),
  UseOwnCreativeCta: () => <div data-testid="use-own-cta" />,
}))

// Restore all mock.module stubs after this file's tests complete so sibling
// source modules are not polluted when bun runs multiple test files in the
// same process. Note: bun hoists mock.module() to collection time regardless
// of where they appear, so afterAll here cleans up what was registered at start.
afterAll(() => mock.restore())

// OrganicDraftPreview is imported after all mocks are declared so bun's module
// resolution picks up the mocked dependencies.
import { OrganicDraftPreview } from "./OrganicDraftPreview"

function baseDraft(overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: "draft-1",
    title: "Test post",
    summary: "A summary",
    timeLabel: "9:00 AM",
    dateLabel: "Mon, Jan 1",
    status: "draft",
    platforms: ["instagram"],
    format: "Post",
    objective: "engagement",
    captionPreview: "Test caption",
    tags: [],
    mediaCount: 0,
    ...overrides,
  }
}

describe("OrganicDraftPreview — MediaStatusBadge", () => {
  beforeEach(() => cleanup())

  it("shows 'Your creative' when mediaStatus is user_supplied", () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ mediaSuggestion: { mediaStatus: "user_supplied" } })}
        brandProfileId="brand-1"
      />,
    )
    expect(screen.getByText("Your creative")).toBeTruthy()
  })

  it("shows 'Generating…' when mediaStatus is generating", () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ mediaSuggestion: { mediaStatus: "generating" } })}
        brandProfileId="brand-1"
      />,
    )
    expect(screen.getByText("Generating…")).toBeTruthy()
  })

  it("shows 'Ready' when mediaStatus is ready", () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ mediaSuggestion: { mediaStatus: "ready" } })}
        brandProfileId="brand-1"
      />,
    )
    expect(screen.getByText("Ready")).toBeTruthy()
  })

  it("shows 'Preparing media…' when pending + blueprintReady=true", () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ mediaSuggestion: { mediaStatus: "pending", blueprintReady: true } })}
        brandProfileId="brand-1"
      />,
    )
    expect(screen.getByText("Preparing media…")).toBeTruthy()
  })

  it("shows 'Pending' when mediaStatus is pending without blueprint", () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ mediaSuggestion: { mediaStatus: "pending", blueprintReady: false } })}
        brandProfileId="brand-1"
      />,
    )
    expect(screen.getByText("Pending")).toBeTruthy()
  })
})

describe("OrganicDraftPreview — Generate button visibility", () => {
  beforeEach(() => cleanup())

  it("shows Generate button when media is pending", () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({ mediaSuggestion: { mediaStatus: "pending" } })}
        brandProfileId="brand-1"
      />,
    )
    expect(container.querySelector('[aria-label="Generate media for this post"]')).not.toBeNull()
  })

  it("hides Generate button when media is user_supplied", () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({ mediaSuggestion: { mediaStatus: "user_supplied" } })}
        brandProfileId="brand-1"
      />,
    )
    expect(container.querySelector('[aria-label="Generate media for this post"]')).toBeNull()
  })

  it("hides Generate button when media is ready", () => {
    const { container } = render(
      <OrganicDraftPreview
        draft={baseDraft({ mediaSuggestion: { mediaStatus: "ready" } })}
        brandProfileId="brand-1"
      />,
    )
    expect(container.querySelector('[aria-label="Generate media for this post"]')).toBeNull()
  })
})

describe("OrganicDraftPreview — user-supplied video render", () => {
  beforeEach(() => cleanup())

  it("renders reel draft with user_supplied badge and no Generate button", () => {
    const draft = baseDraft({
      format: "Reel",
      mediaSuggestion: {
        mediaStatus: "user_supplied",
        kind: "reel",
        reel: {
          generated: true,
          url: "brands/b/vid.mp4",
          bucket: "media-library",
          signedUrl: "https://cdn.example.com/vid.mp4",
        },
      },
      publishingAssets: [
        {
          role: "primary",
          kind: "video",
          storagePath: "brands/b/vid.mp4",
          storageUrl: "https://cdn.example.com/vid.mp4",
          bucket: "media-library",
        },
      ],
    })

    const { container } = render(<OrganicDraftPreview draft={draft} brandProfileId="brand-1" />)

    expect(screen.getByText("Your creative")).toBeTruthy()
    expect(container.querySelector('[aria-label="Generate media for this post"]')).toBeNull()
  })
})

describe("OrganicDraftPreview — carousel user-supplied render", () => {
  beforeEach(() => cleanup())

  it("renders carousel draft with user_supplied badge", () => {
    const draft = baseDraft({
      format: "Carousel",
      mediaSuggestion: {
        mediaStatus: "user_supplied",
        kind: "carousel",
      },
      publishingAssets: [
        {
          role: "primary",
          kind: "image",
          slideIndex: 0,
          storagePath: "p0.jpg",
          storageUrl: "https://cdn/p0.jpg",
        },
        {
          role: "primary",
          kind: "image",
          slideIndex: 1,
          storagePath: "p1.jpg",
          storageUrl: "https://cdn/p1.jpg",
        },
      ],
    })

    const { container } = render(<OrganicDraftPreview draft={draft} brandProfileId="brand-1" />)
    expect(screen.getByText("Your creative")).toBeTruthy()
    expect(container.querySelector('[aria-label="Generate media for this post"]')).toBeNull()
  })
})
