import { describe, expect, it } from "bun:test";

import { buildReferenceNodes } from "./buildReferenceNodes";

const idFactory = () => {
  let n = 0;
  return () => `node-${++n}`;
};

describe("buildReferenceNodes", () => {
  it("builds an unattached image reference node from an image item", () => {
    const [node] = buildReferenceNodes(
      [{ kind: "image", url: "https://cdn.example.com/photo.jpg" }],
      [{ x: 10, y: 20 }],
      idFactory(),
    );
    expect(node.type).toBe("image");
    expect(node.position).toEqual({ x: 10, y: 20 });
    expect(node.data.image).toBe("https://cdn.example.com/photo.jpg");
    expect(node.data.sourceUrl).toBe("https://cdn.example.com/photo.jpg");
    expect(node.data.fileName).toBe("photo.jpg");
    expect(node.style.width).toBeGreaterThan(0);
  });

  it("builds a video reference node from a video item", () => {
    const [node] = buildReferenceNodes(
      [{ kind: "video", url: "https://cdn.example.com/clip.mp4" }],
      [{ x: 0, y: 0 }],
      idFactory(),
    );
    expect(node.type).toBe("video");
    expect(node.data.video).toBe("https://cdn.example.com/clip.mp4");
    expect(node.data.sourceUrl).toBe("https://cdn.example.com/clip.mp4");
  });

  it("assigns unique ids and matches positions by index", () => {
    const nodes = buildReferenceNodes(
      [
        { kind: "image", url: "https://cdn.example.com/a.jpg" },
        { kind: "image", url: "https://cdn.example.com/b.jpg" },
      ],
      [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      idFactory(),
    );
    expect(nodes.map((n) => n.id)).toEqual(["node-1", "node-2"]);
    expect(nodes[1].position).toEqual({ x: 2, y: 2 });
  });

  it("falls back to a host-based file name when the url has no path segment", () => {
    const [node] = buildReferenceNodes(
      [{ kind: "image", url: "https://media.licdn.com/" }],
      [{ x: 0, y: 0 }],
      idFactory(),
    );
    expect(typeof node.data.fileName).toBe("string");
    expect((node.data.fileName as string).length).toBeGreaterThan(0);
  });
});
