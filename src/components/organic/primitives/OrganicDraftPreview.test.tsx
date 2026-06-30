import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type { OrganicCalendarDraft } from "./types"

// happy-dom does not expose SyntaxError on its window object, which causes
// @testing-library/dom's querySelectorAll internals to crash. Polyfill it.
;(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError = SyntaxError

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
    selector({ updateDraft: mock(), bulkDeleteDrafts: mock() }),
  ),
}))

mock.module("./AiStudioHandoffContext", () => ({
  useOpenDraftInAiStudio: () => undefined,
}))

mock.module("@/lib/organic/hyperframeSign", () => ({
  signMediaAsset: mock(() => Promise.resolve(null)),
  signOrganicMediaAsset: mock(() => Promise.resolve(null)),
}))

mock.module("./CarouselSlideStrip", () => ({
  CarouselSlideStrip: () => <div data-testid="carousel-strip" />,
}))

mock.module("@/components/organic/hooks/useGenerateDraftMedia", () => ({
  useGenerateDraftMedia: mock(() => ({ generateDraftMedia: mock(), isGenerating: false })),
}))

// The contextual children are tested in their own files. Stub them here: the
// media Popover simply renders its anchor (so the media zone + storyboard still
// render), the chips echo their props, the command menu is a marker.
mock.module("./MediaSelectPopover", () => ({
  MediaSelectPopover: ({ anchor }: { anchor: ReactNode }) => (
    <div data-testid="media-select">{anchor}</div>
  ),
}))

mock.module("./PostMetaChips", () => ({
  PostMetaChips: ({
    platform,
    format,
    timeLabel,
    actions,
  }: {
    platform: string
    format: string
    timeLabel: string
    actions?: ReactNode
  }) => (
    <div data-testid="meta-chips">
      <span>{platform}</span>
      <span>{format}</span>
      <span>{timeLabel}</span>
      {actions}
    </div>
  ),
}))

mock.module("./PostCommandMenu", () => ({
  PostCommandMenu: () => <button type="button" aria-label="Post actions" />,
}))

mock.module("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  useDroppable: mock(() => ({ setNodeRef: mock(), isOver: false })),
  useDraggable: mock(() => ({ setNodeRef: mock(), attributes: {}, listeners: {}, transform: null, isDragging: false })),
  useSensor: mock(() => ({})),
  useSensors: mock((...sensors: unknown[]) => sensors),
  PointerSensor: class {},
  KeyboardSensor: class {},
  closestCenter: mock(),
}))

mock.module("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSortable: mock(() => ({ setNodeRef: mock(), attributes: {}, listeners: {}, transform: null, transition: undefined, isDragging: false })),
  sortableKeyboardCoordinates: {},
  horizontalListSortingStrategy: {},
}))

mock.module("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" }, Translate: { toString: () => "" } },
}))

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
  PreviewMediaDropZone: ({ children }: { children?: ReactNode }) => <div data-testid="drop-zone">{children}</div>,
}))

afterAll(() => mock.restore())

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

describe("OrganicDraftPreview — contextual shell", () => {
  beforeEach(() => cleanup())

  it("renders the glanceable metadata chips and the ⋯ command menu", () => {
    render(<OrganicDraftPreview draft={baseDraft()} brandProfileId="brand-1" />)
    expect(screen.getByTestId("meta-chips")).toBeTruthy()
    expect(screen.getByText("instagram")).toBeTruthy()
    expect(screen.getByText("Post")).toBeTruthy()
    expect(screen.getByText("9:00 AM")).toBeTruthy()
    expect(screen.getByLabelText("Post actions")).toBeTruthy()
  })

  it("renders the caption as click-to-edit text (no always-on textarea)", () => {
    render(<OrganicDraftPreview draft={baseDraft()} brandProfileId="brand-1" />)
    // EditableCaption read mode = a button labelled for editing carrying the text.
    const caption = screen.getByLabelText("Edit instagram caption")
    expect(caption.tagName).toBe("BUTTON")
    expect(caption.textContent).toContain("Test caption")
  })
})

describe("OrganicDraftPreview — media state", () => {
  beforeEach(() => cleanup())

  it("shows the persisted storyboard 'Blueprint ready' state for a pending text-only draft", () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          backendDraftId: "be-1",
          mediaSuggestion: {
            mediaStatus: "pending",
            storyboard: [
              {
                role: "primary",
                bucket: "brand-profile-assets",
                storagePath: "organic/d/preview/1.png",
                storageUrl: "https://signed.example.com/1.png",
              },
            ],
          },
        })}
        brandProfileId="brand-1"
      />,
    )
    // "Blueprint ready" now appears both as the header enrichment pill (media_stage
    // = storyboard_ready) and the detailed media-section label, hence getAllByText.
    expect(screen.getAllByText("Blueprint ready").length).toBeGreaterThan(0)
    expect(screen.getByAltText("Test post — storyboard frame 1")).toBeTruthy()
    expect(screen.getByText("Generate final media or use your own creative")).toBeTruthy()
  })

  it("suppresses the storyboard state once real media is attached", () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          format: "Carousel",
          mediaSuggestion: { mediaStatus: "user_supplied", kind: "carousel" },
          publishingAssets: [
            { role: "primary", kind: "image", slideIndex: 0, storagePath: "p0.jpg", storageUrl: "https://cdn/p0.jpg" },
            { role: "primary", kind: "image", slideIndex: 1, storagePath: "p1.jpg", storageUrl: "https://cdn/p1.jpg" },
          ],
        })}
        brandProfileId="brand-1"
      />,
    )
    expect(screen.queryByText("Blueprint ready")).toBeNull()
  })
})

describe("OrganicDraftPreview — schedule readiness", () => {
  beforeEach(() => cleanup())

  it("surfaces the schedule-requirements hint and gates Approve & Schedule when not ready", () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({ captionPreview: "" })}
        brandProfileId="brand-1"
        onApprove={mock()}
      />,
    )
    // The checklist moved out of the footer into a hover popover on this chip;
    // the chip itself is what proves the unready state is surfaced.
    expect(screen.getByLabelText("Why this draft can't be scheduled yet")).toBeTruthy()
    const approve = screen.getByText("Approve & Schedule").closest("button") as HTMLButtonElement
    expect(approve.disabled).toBe(true)
  })

  it("hides the schedule-requirements hint once the draft is ready", () => {
    render(
      <OrganicDraftPreview
        draft={baseDraft({
          captionPreview: "Ready caption",
          publishingAssets: [
            { role: "primary", kind: "image", slideIndex: 0, storagePath: "p0.jpg", storageUrl: "https://cdn/p0.jpg" },
          ],
        })}
        brandProfileId="brand-1"
        onApprove={mock()}
      />,
    )
    expect(screen.queryByLabelText("Why this draft can't be scheduled yet")).toBeNull()
  })

  it("renders the media-enrichment inventory label in the header", () => {
    render(<OrganicDraftPreview draft={baseDraft()} brandProfileId="brand-1" />)
    expect(screen.getByText("No media yet")).toBeTruthy()
  })
})
