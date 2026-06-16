import { describe, it, expect } from "bun:test";
import { nodeNeedsResign, resignKey } from "./canvasMediaResign";
import type { StudioNode } from "../types";

const node = (data: Record<string, unknown>): StudioNode =>
  ({ id: "n", type: "nanoGen", position: { x: 0, y: 0 }, data } as unknown as StudioNode);

describe("nodeNeedsResign", () => {
  it("returns true when a generated image has a durable pointer but no signed url", () => {
    expect(nodeNeedsResign(node({ generatedImageStoragePath: "p", generatedImageBucket: "b" }))).toBe(true);
  });

  it("returns false when the generated image signed url is already present", () => {
    expect(
      nodeNeedsResign(
        node({ generatedImageStoragePath: "p", generatedImageBucket: "b", generatedImageUrl: "https://x/p" })
      )
    ).toBe(false);
  });

  it("returns true when a generated video has a durable pointer but no signed url", () => {
    expect(nodeNeedsResign(node({ generatedVideoStoragePath: "p", generatedVideoBucket: "b" }))).toBe(true);
  });

  it("returns true when an uploaded reference has a durable pointer but no source url", () => {
    expect(nodeNeedsResign(node({ sourcePath: "p", bucket: "b" }))).toBe(true);
  });

  it("returns false when there is no durable pointer", () => {
    expect(nodeNeedsResign(node({ prompt: "hello" }))).toBe(false);
  });

  it("returns false when only a bucket is present without a path", () => {
    expect(nodeNeedsResign(node({ generatedImageBucket: "b" }))).toBe(false);
  });
});

describe("resignKey", () => {
  it("derives a stable key from the image durable pointer", () => {
    expect(resignKey(node({ generatedImageStoragePath: "p", generatedImageBucket: "b" }))).toBe("img:b\np");
  });

  it("returns null when there is no durable pointer", () => {
    expect(resignKey(node({ prompt: "hi" }))).toBeNull();
  });
});
