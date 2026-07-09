import { describe, expect, it } from "bun:test";

import {
  resolveConnection,
  autoLayout,
  buildWorkflowGraph,
  applyOps,
  validateWorkflowGraph,
  mergeGraphs,
} from "./workflow-builder";

const node = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});

describe("resolveConnection", () => {
  it("routes a text source into a generator prompt", () => {
    const r = resolveConnection(node("t", "string"), node("n", "nanoGen"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sourceHandle).toBe("text");
      expect(r.targetHandle).toBe("prompt");
    }
  });

  it("routes an image source into a ref-image handle", () => {
    const r = resolveConnection(node("i", "image"), node("n", "nanoGen"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targetHandle).toBe("ref-image");
  });

  it("routes an image into a veo-fast first-frame (model gating)", () => {
    const r = resolveConnection(node("i", "image"), node("v", "veoFast"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targetHandle).toBe("first-frame");
  });

  it("honors a role hint when several handles are valid", () => {
    const r = resolveConnection(node("t", "string"), node("v", "videoGen", { model: "kling-omni" }), { roleHint: "negative" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targetHandle).toBe("negative");
  });

  it("fails when no compatible handle exists", () => {
    const r = resolveConnection(node("a", "audio"), node("n", "nanoGen"));
    expect(r.ok).toBe(false);
  });
});

describe("autoLayout", () => {
  it("places downstream nodes to the right of their sources", () => {
    const nodes = [node("a", "string"), node("b", "nanoGen"), node("c", "veoFast")];
    const edges = [
      { id: "e1", source: "a", target: "b", sourceHandle: "text", targetHandle: "prompt" },
      { id: "e2", source: "b", target: "c", sourceHandle: "image", targetHandle: "first-frame" },
    ];
    const laid = autoLayout(nodes, edges);
    const x = Object.fromEntries(laid.map((n) => [n.id, n.position.x]));
    expect(x.a).toBeLessThan(x.b);
    expect(x.b).toBeLessThan(x.c);
  });
});

describe("buildWorkflowGraph", () => {
  it("assembles a valid text → image → video pipeline with resolved handles", () => {
    const { graph, errors } = buildWorkflowGraph(
      [
        { ref: "prompt", type: "string", data: { value: "a red sneaker" } },
        { ref: "img", type: "nanoGen" },
        { ref: "vid", type: "veoFast" },
      ],
      [
        { from_ref: "prompt", to_ref: "img" },
        { from_ref: "img", to_ref: "vid" },
      ],
    );
    expect(errors).toHaveLength(0);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(validateWorkflowGraph(graph).ok).toBe(true);
  });

  it("reports an error for an impossible connection but still builds the nodes", () => {
    const { graph, errors } = buildWorkflowGraph(
      [
        { ref: "a", type: "audio" },
        { ref: "n", type: "nanoGen" },
      ],
      [{ from_ref: "a", to_ref: "n" }],
    );
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("applyOps", () => {
  const seed = () =>
    buildWorkflowGraph(
      [
        { ref: "prompt", type: "string", data: { value: "hi" } },
        { ref: "img", type: "nanoGen" },
      ],
      [{ from_ref: "prompt", to_ref: "img" }],
    ).graph;

  it("adds a node and connects it", () => {
    const { graph, errors } = applyOps(seed(), [
      { op: "add_node", ref: "vid", type: "veoFast" },
      { op: "connect", from: "img", to: "vid" },
    ]);
    expect(errors).toHaveLength(0);
    expect(graph.nodes.map((n) => n.id)).toContain("vid");
    expect(graph.edges.some((e) => e.source === "img" && e.target === "vid")).toBe(true);
  });

  it("rewires a node's output to a new target", () => {
    const base = applyOps(seed(), [
      { op: "add_node", ref: "img2", type: "nanoGen" },
      { op: "add_node", ref: "vid", type: "veoFast" },
      { op: "connect", from: "img", to: "vid" },
    ]).graph;
    const { graph } = applyOps(base, [{ op: "rewire", from: "img2", to: "vid", role: "last-frame" }]);
    const intoVid = graph.edges.filter((e) => e.target === "vid");
    expect(intoVid.some((e) => e.source === "img2")).toBe(true);
  });

  it("removes a node and its edges", () => {
    const { graph } = applyOps(seed(), [{ op: "remove_node", id: "img" }]);
    expect(graph.nodes.map((n) => n.id)).not.toContain("img");
    expect(graph.edges).toHaveLength(0);
  });

  it("attaches an image asset to an image node and rejects a video asset there", () => {
    const withImg = applyOps(seed(), [{ op: "add_node", ref: "ref", type: "image" }]).graph;
    const ok = applyOps(withImg, [
      { op: "attach_media", id: "ref", media: { bucket: "media-library", storagePath: "b/ref.png", fileName: "ref.png", mediaKind: "image" } },
    ]);
    expect(ok.errors).toHaveLength(0);
    const refNode = ok.graph.nodes.find((n) => n.id === "ref");
    expect((refNode?.data as Record<string, unknown>).sourcePath).toBe("b/ref.png");

    const bad = applyOps(withImg, [
      { op: "attach_media", id: "ref", media: { bucket: "media-library", storagePath: "b/clip.mp4", fileName: "clip.mp4", mediaKind: "video" } },
    ]);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it("merges node data on update_node", () => {
    const { graph } = applyOps(seed(), [{ op: "update_node", id: "img", data: { positivePrompt: "studio light" } }]);
    const img = graph.nodes.find((n) => n.id === "img");
    expect((img?.data as Record<string, unknown>).positivePrompt).toBe("studio light");
  });
});

describe("validateWorkflowGraph", () => {
  it("flags a dangling edge", () => {
    const result = validateWorkflowGraph({
      nodes: [node("a", "string")],
      edges: [{ id: "e1", source: "a", target: "ghost", sourceHandle: "text", targetHandle: "prompt" }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("flags an invalid handle pair", () => {
    const result = validateWorkflowGraph({
      nodes: [node("a", "audio"), node("n", "nanoGen")],
      edges: [{ id: "e1", source: "a", target: "n", sourceHandle: "audio", targetHandle: "prompt" }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("mergeGraphs", () => {
  const positioned = (id: string, type: string, x: number, y: number) => ({
    id,
    type,
    position: { x, y },
    data: {},
  });

  it("keeps every base node when incoming work is added", () => {
    const base = {
      nodes: [positioned("user-brief", "string", 0, 0), positioned("user-image", "nanoGen", 360, 0)],
      edges: [{ id: "ue", source: "user-brief", target: "user-image", sourceHandle: "text", targetHandle: "prompt" }],
    };
    const incoming = buildWorkflowGraph(
      [
        { ref: "agent-prompt", type: "string" },
        { ref: "agent-image", type: "nanoGen" },
      ],
      [{ from_ref: "agent-prompt", to_ref: "agent-image" }],
    ).graph;

    const graph = mergeGraphs(base, incoming);

    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      "agent-image",
      "agent-prompt",
      "user-brief",
      "user-image",
    ]);
    expect(graph.edges.map((e) => e.id).sort()).toEqual(["ue", ...incoming.edges.map((e) => e.id)].sort());
  });

  it("does not disturb the positions the user already arranged", () => {
    const base = { nodes: [positioned("user-brief", "string", 40, 90)], edges: [] };
    const incoming = buildWorkflowGraph([{ ref: "agent-prompt", type: "string" }]).graph;

    const graph = mergeGraphs(base, incoming);

    expect(graph.nodes.find((n) => n.id === "user-brief")?.position).toEqual({ x: 40, y: 90 });
  });

  it("drops incoming nodes clear of the base so nothing lands on top of the user's work", () => {
    const base = { nodes: [positioned("user-brief", "string", 0, 500)], edges: [] };
    const incoming = buildWorkflowGraph([{ ref: "agent-prompt", type: "string" }]).graph;

    const graph = mergeGraphs(base, incoming);
    const agent = graph.nodes.find((n) => n.id === "agent-prompt");

    expect(agent?.position.y).toBeGreaterThan(500);
  });

  it("updates a colliding node in place rather than duplicating or dropping it", () => {
    const base = { nodes: [positioned("prompt", "string", 12, 34)], edges: [] };
    const incoming = buildWorkflowGraph([{ ref: "prompt", type: "string", data: { value: "agent text" } }]).graph;

    const graph = mergeGraphs(base, incoming);

    expect(graph.nodes).toHaveLength(1);
    expect((graph.nodes[0]?.data as Record<string, unknown>).value).toBe("agent text");
    // Overwriting the node's data must not yank it out from under the user's cursor.
    expect(graph.nodes[0]?.position).toEqual({ x: 12, y: 34 });
  });

  it("merging an empty incoming graph is a no-op", () => {
    const base = { nodes: [positioned("user-brief", "string", 0, 0)], edges: [] };
    const graph = mergeGraphs(base, { nodes: [], edges: [] });
    expect(graph.nodes.map((n) => n.id)).toEqual(["user-brief"]);
  });

  it("merging into an empty canvas keeps the incoming layout untouched", () => {
    const incoming = buildWorkflowGraph(
      [
        { ref: "a", type: "string" },
        { ref: "b", type: "nanoGen" },
      ],
      [{ from_ref: "a", to_ref: "b" }],
    ).graph;

    const graph = mergeGraphs({ nodes: [], edges: [] }, incoming);

    expect(graph.nodes.map((n) => n.position)).toEqual(incoming.nodes.map((n) => n.position));
  });
});
