import { describe, expect, it, mock } from "bun:test";

import { inlineReferenceImageNodes } from "./inlineReferenceImageNodes";

const imageNode = (id: string, sourceUrl: string) => ({
  id,
  type: "image" as const,
  data: { image: sourceUrl, sourceUrl },
});

describe("inlineReferenceImageNodes", () => {
  it("marks an image node processing then ready with the inlined data url", async () => {
    const inline = mock().mockResolvedValue({
      dataUrl: "data:image/jpeg;base64,AQID",
      mimeType: "image/jpeg",
    });
    const updateNodeData = mock();

    await inlineReferenceImageNodes(
      [imageNode("n1", "https://scontent.cdninstagram.com/a.jpg")],
      { inline, updateNodeData },
    );

    expect(inline).toHaveBeenCalledWith("https://scontent.cdninstagram.com/a.jpg");
    expect(updateNodeData.mock.calls).toEqual([
      ["n1", { referenceStatus: "processing" }],
      ["n1", { image: "data:image/jpeg;base64,AQID", referenceStatus: "ready" }],
    ]);
  });

  it("marks an image node error when inlining throws (sourceUrl untouched)", async () => {
    const inline = mock().mockRejectedValue(new Error("boom"));
    const updateNodeData = mock();

    await inlineReferenceImageNodes(
      [imageNode("n1", "https://scontent.cdninstagram.com/a.jpg")],
      { inline, updateNodeData },
    );

    expect(updateNodeData.mock.calls).toEqual([
      ["n1", { referenceStatus: "processing" }],
      ["n1", { referenceStatus: "error" }],
    ]);
  });

  it("skips video nodes", async () => {
    const inline = mock();
    const updateNodeData = mock();

    await inlineReferenceImageNodes(
      [{ id: "v1", type: "video", data: { sourceUrl: "https://x/clip.mp4" } }],
      { inline, updateNodeData },
    );

    expect(inline).toHaveBeenCalledTimes(0);
    expect(updateNodeData).toHaveBeenCalledTimes(0);
  });

  it("skips image nodes without a sourceUrl", async () => {
    const inline = mock();
    const updateNodeData = mock();

    await inlineReferenceImageNodes([{ id: "n1", type: "image", data: {} }], {
      inline,
      updateNodeData,
    });

    expect(inline).toHaveBeenCalledTimes(0);
    expect(updateNodeData).toHaveBeenCalledTimes(0);
  });

  it("processes multiple image nodes", async () => {
    const inline = mock().mockResolvedValue({
      dataUrl: "data:image/png;base64,QQ==",
      mimeType: "image/png",
    });
    const updateNodeData = mock();

    await inlineReferenceImageNodes(
      [
        imageNode("n1", "https://scontent.cdninstagram.com/a.jpg"),
        imageNode("n2", "https://scontent.cdninstagram.com/b.jpg"),
      ],
      { inline, updateNodeData },
    );

    expect(inline).toHaveBeenCalledTimes(2);
    expect(updateNodeData).toHaveBeenCalledTimes(4);
  });
});
