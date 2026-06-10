import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DocumentPreviewCard } from "./DocumentPreviewCard";
import type { DocumentView } from "./types";

// happy-dom's selector parser constructs errors via window.SyntaxError, which it
// does not define out of the box; mirror the host constructors onto its window.
Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

// Radix popper/dismissable-layer (and @floating-ui) rely on a few browser
// globals/observers that happy-dom does not expose by default.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
const g = globalThis as unknown as Record<string, unknown>;
const hostWindow = global.window as unknown as Record<string, unknown>;
g.ResizeObserver = ObserverStub;
g.IntersectionObserver ??= ObserverStub;
g.Element ??= hostWindow.Element;
// Radix focus/tabbable walking uses NodeFilter via document.createTreeWalker.
g.NodeFilter ??= hostWindow.NodeFilter;
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => {};
proto.releasePointerCapture ??= () => {};
proto.scrollIntoView ??= () => {};

function makeDoc(overrides: Partial<DocumentView> = {}): DocumentView {
  return {
    id: "doc-1",
    name: "Brand Guidelines.pdf",
    source: "upload",
    createdAt: "2026-01-15T10:00:00.000Z",
    status: "ready",
    kind: "pdf",
    size: 245_760,
    pageCount: 12,
    storagePath: "brand/doc-1.pdf",
    ...overrides,
  };
}

type Handlers = {
  onPinnedChange: ReturnType<typeof mock>;
  onOpenInline: ReturnType<typeof mock>;
  onDownload: ReturnType<typeof mock>;
  onRemove: ReturnType<typeof mock>;
};

function renderCard(doc: DocumentView, isPinned: boolean): Handlers {
  const handlers: Handlers = {
    onPinnedChange: mock(() => {}),
    onOpenInline: mock(() => {}),
    onDownload: mock(() => {}),
    onRemove: mock(() => {}),
  };
  render(
    <DocumentPreviewCard
      doc={doc}
      isPinned={isPinned}
      onPinnedChange={handlers.onPinnedChange}
      onOpenInline={handlers.onOpenInline}
      onDownload={handlers.onDownload}
      onRemove={handlers.onRemove}
    >
      <button type="button">Trigger</button>
    </DocumentPreviewCard>,
  );
  return handlers;
}

afterEach(cleanup);

describe("DocumentPreviewCard", () => {
  it("does not render the pinned card while unpinned", () => {
    renderCard(makeDoc(), false);
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    expect(screen.queryByText("Text preview")).toBeNull();
  });

  it("pins when the trigger is clicked", () => {
    const handlers = renderCard(makeDoc(), false);
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(handlers.onPinnedChange).toHaveBeenCalledWith(true);
  });

  it("renders metadata and actions in the pinned card", () => {
    renderCard(makeDoc({ textExcerpt: "Our brand voice is warm and direct." }), true);
    expect(screen.getByText("Brand Guidelines.pdf")).toBeTruthy();
    // metadata grid
    expect(screen.getByText("Pages")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("240 KB")).toBeTruthy();
    // excerpt
    expect(screen.getByText("Text preview")).toBeTruthy();
    expect(screen.getByText("Our brand voice is warm and direct.")).toBeTruthy();
    // actions
    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it("shows the empty state when there is no text excerpt", () => {
    renderCard(makeDoc({ textExcerpt: undefined }), true);
    expect(
      screen.getByText("No text preview has been extracted for this document yet."),
    ).toBeTruthy();
    expect(screen.queryByText("Text preview")).toBeNull();
  });

  it("wires the pinned actions to their handlers", () => {
    const doc = makeDoc();
    const handlers = renderCard(doc, true);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(handlers.onOpenInline).toHaveBeenCalledWith(doc.storagePath);

    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(handlers.onDownload).toHaveBeenCalledWith(doc.storagePath);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(handlers.onRemove).toHaveBeenCalledWith(doc.id);

    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(handlers.onPinnedChange).toHaveBeenCalledWith(false);
  });

  it("hides Open/Download when the document has no storage path", () => {
    renderCard(makeDoc({ storagePath: undefined }), true);
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  // The hover peek is opened by Radix HoverCard's internal pointer timer, which
  // happy-dom cannot exercise deterministically via synthetic pointer events.
  // The peek's content (PeekBody) and its suppression while pinned are covered
  // by the pinned-state tests above; hover open/close is upstream Radix behavior.
});
