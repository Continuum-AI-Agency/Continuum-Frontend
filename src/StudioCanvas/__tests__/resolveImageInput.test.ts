import { describe, it, expect } from "bun:test";
import { resolveInputValue } from "../utils/buildNodePayload";
import type { StudioNode } from "../types";
import type { Edge } from "@xyflow/react";

const producerNode = { id: "producer", type: "nanoGen", position: { x: -100, y: 0 }, data: {} } as unknown as StudioNode;
const consumerNode = { id: "consumer", type: "nanoGen", position: { x: 0, y: 0 }, data: {} } as unknown as StudioNode;
const nodes = [producerNode, consumerNode];

const edgeFromProducer = (sourceHandle: string | undefined): Edge[] => [
  { id: "e", source: "producer", target: "consumer", targetHandle: "ref-image", sourceHandle } as Edge,
];

const imagesOutput = {
  type: "images" as const,
  items: [
    { base64: "IMG0", mimeType: "image/png" },
    { base64: "IMG1", mimeType: "image/png" },
    { base64: "IMG2", mimeType: "image/png" },
    { base64: "IMG3", mimeType: "image/png" },
  ],
};

describe("resolveInputValue images branch (variation handle routing)", () => {
  it("maps the legacy 'image' handle to the first variation", () => {
    const resolvedData = new Map([["producer", imagesOutput]]);
    const out = resolveInputValue("consumer", "ref-image", resolvedData, nodes, edgeFromProducer("image"));
    expect(out).toEqual({ image: "IMG0" });
  });

  it("maps a missing source handle to the first variation", () => {
    const resolvedData = new Map([["producer", imagesOutput]]);
    const out = resolveInputValue("consumer", "ref-image", resolvedData, nodes, edgeFromProducer(undefined));
    expect(out).toEqual({ image: "IMG0" });
  });

  it("maps 'image-2' to the third variation", () => {
    const resolvedData = new Map([["producer", imagesOutput]]);
    const out = resolveInputValue("consumer", "ref-image", resolvedData, nodes, edgeFromProducer("image-2"));
    expect(out).toEqual({ image: "IMG2" });
  });

  it("falls back to the first variation when the handle index is out of range", () => {
    const resolvedData = new Map([["producer", imagesOutput]]);
    const out = resolveInputValue("consumer", "ref-image", resolvedData, nodes, edgeFromProducer("image-9"));
    expect(out).toEqual({ image: "IMG0" });
  });

  it("returns undefined when the images output has no items", () => {
    const resolvedData = new Map([["producer", { type: "images" as const, items: [] }]]);
    const out = resolveInputValue("consumer", "ref-image", resolvedData, nodes, edgeFromProducer("image"));
    expect(out).toBeUndefined();
  });
});
