import { describe, expect, it } from "bun:test";

import {
  enqueueMessage,
  removeQueuedMessage,
  shouldQueueSubmission,
  takeNextQueuedMessage,
  updateQueuedMessageContent,
  type QueuedJainaMessage,
} from "./queueing";

function buildQueuedMessage(
  id: string,
  content: string,
  overrides?: Partial<QueuedJainaMessage>
): QueuedJainaMessage {
  return {
    id,
    content,
    createdAt: "2026-03-10T00:00:00.000Z",
    canvas: false,
    ...overrides,
  };
}

describe("queueing", () => {
  it("queues submissions whenever streaming or an active response exists", () => {
    expect(
      shouldQueueSubmission({ isStreaming: true, activeResponseId: null })
    ).toBe(true);
    expect(
      shouldQueueSubmission({ isStreaming: false, activeResponseId: "assistant-1" })
    ).toBe(true);
    expect(
      shouldQueueSubmission({ isStreaming: false, activeResponseId: null })
    ).toBe(false);
  });

  it("appends queued messages in order", () => {
    const first = buildQueuedMessage("q1", "first");
    const second = buildQueuedMessage("q2", "second");

    const queued = enqueueMessage(enqueueMessage([], first), second);

    expect(queued.map((entry) => entry.id)).toEqual(["q1", "q2"]);
    expect(queued[1]?.content).toBe("second");
  });

  it("updates only the targeted queued message content", () => {
    const queued = [
      buildQueuedMessage("q1", "first"),
      buildQueuedMessage("q2", "second"),
    ];

    const updated = updateQueuedMessageContent(queued, "q2", "edited");

    expect(updated[0]?.content).toBe("first");
    expect(updated[1]?.content).toBe("edited");
  });

  it("removes queued messages by id", () => {
    const queued = [
      buildQueuedMessage("q1", "first"),
      buildQueuedMessage("q2", "second"),
      buildQueuedMessage("q3", "third"),
    ];

    const remaining = removeQueuedMessage(queued, "q2");

    expect(remaining.map((entry) => entry.id)).toEqual(["q1", "q3"]);
  });

  it("returns next queued message and remaining queue", () => {
    const queued = [
      buildQueuedMessage("q1", "first"),
      buildQueuedMessage("q2", "second"),
    ];

    const { next, remaining } = takeNextQueuedMessage(queued);

    expect(next?.id).toBe("q1");
    expect(remaining.map((entry) => entry.id)).toEqual(["q2"]);
  });

  it("returns null next message for an empty queue", () => {
    const { next, remaining } = takeNextQueuedMessage([]);

    expect(next).toBeNull();
    expect(remaining).toEqual([]);
  });
});
