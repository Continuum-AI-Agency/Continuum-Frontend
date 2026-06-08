import { beforeEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { UnfurlMediaItem, UnfurlMediaResponse } from "@continuum/contracts";

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});
global.getComputedStyle = global.window.getComputedStyle.bind(global.window);
global.requestAnimationFrame = (callback: FrameRequestCallback) =>
  window.setTimeout(() => callback(Date.now()), 0) as unknown as number;
global.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
(global as { MutationObserver?: unknown }).MutationObserver = window.MutationObserver;
(global as { NodeFilter?: unknown }).NodeFilter = window.NodeFilter;

const unfurlMock = mock(async (_url: string): Promise<UnfurlMediaResponse> => ({
  source: { requestedUrl: "https://x", via: "direct" },
  items: [],
  partial: false,
}));

mock.module("@/lib/api/aiStudioUnfurl.client", () => ({
  unfurlMediaFromUrl: unfurlMock,
}));

import { ImportFromLinkDialog } from "./ImportFromLinkDialog";

const twoImages: UnfurlMediaResponse = {
  source: { requestedUrl: "https://www.linkedin.com/posts/x", via: "direct", provider: "linkedin" },
  items: [
    { kind: "image", url: "https://cdn.example.com/a.jpg" },
    { kind: "image", url: "https://cdn.example.com/b.jpg" },
  ],
  partial: false,
};

const renderDialog = (
  onPlace = mock((_items: UnfurlMediaItem[]) => {}),
  onOpenChange = mock((_open: boolean) => {}),
) => {
  render(<ImportFromLinkDialog open onOpenChange={onOpenChange} onPlace={onPlace} />);
  return { onPlace, onOpenChange };
};

const fetchUrl = async (url: string) => {
  const input = screen.getByLabelText(/link url/i);
  fireEvent.change(input, { target: { value: url } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /fetch/i }));
  });
};

describe("ImportFromLinkDialog", () => {
  beforeEach(() => {
    cleanup();
    unfurlMock.mockReset();
  });

  it("fetches and renders the extracted media items", async () => {
    unfurlMock.mockResolvedValue(twoImages);
    renderDialog();
    await fetchUrl("https://www.linkedin.com/posts/x");

    expect(unfurlMock).toHaveBeenCalledWith("https://www.linkedin.com/posts/x");
    const imgs = await screen.findAllByRole("img");
    expect(imgs).toHaveLength(2);
  });

  it("shows the partial-extraction notice when present", async () => {
    unfurlMock.mockResolvedValue({
      ...twoImages,
      items: [twoImages.items[0]],
      partial: true,
      notice: "This looks like a multi-image post, but only one image could be extracted.",
    });
    renderDialog();
    await fetchUrl("https://www.linkedin.com/posts/x");

    expect(await screen.findByText(/only one image could be extracted/i)).toBeDefined();
  });

  it("places the selected items and closes on confirm", async () => {
    unfurlMock.mockResolvedValue(twoImages);
    const { onPlace, onOpenChange } = renderDialog();
    await fetchUrl("https://www.linkedin.com/posts/x");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /add .*to canvas/i }));
    });

    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(onPlace.mock.calls[0][0]).toHaveLength(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("excludes a deselected item from the placed set", async () => {
    unfurlMock.mockResolvedValue(twoImages);
    const { onPlace } = renderDialog();
    await fetchUrl("https://www.linkedin.com/posts/x");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /toggle media 1/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /add .*to canvas/i }));
    });

    expect(onPlace.mock.calls[0][0]).toHaveLength(1);
  });

  it("shows an error message when the fetch fails", async () => {
    unfurlMock.mockRejectedValue(new Error("network"));
    renderDialog();
    await fetchUrl("https://broken.example.com");

    await waitFor(() => {
      expect(screen.getByText(/couldn.?t|could not|failed/i)).toBeDefined();
    });
  });

  it("shows an empty state when no media is found", async () => {
    unfurlMock.mockResolvedValue({
      source: { requestedUrl: "https://x", via: "direct" },
      items: [],
      partial: false,
    });
    renderDialog();
    await fetchUrl("https://nothing.example.com");

    expect(await screen.findByText(/no media/i)).toBeDefined();
  });
});
