import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openSpeechRealtimeSession } from "./speechRealtime";

const getBrowserAccessTokenMock = vi.fn<() => Promise<string | null>>();

vi.mock("@/lib/auth/getBrowserAccessToken", () => ({
  getBrowserAccessToken: getBrowserAccessTokenMock,
}));

type SocketHandler = (event: unknown) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners = new Map<string, Set<SocketHandler>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open", new Event("open"));
    });
  }

  addEventListener(type: string, handler: SocketHandler) {
    const bucket = this.listeners.get(type) ?? new Set<SocketHandler>();
    bucket.add(handler);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, handler: SocketHandler) {
    this.listeners.get(type)?.delete(handler);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", new Event("close"));
  }

  emit(type: string, event: unknown) {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(event);
    }
  }
}

describe("openSpeechRealtimeSession", () => {
  const originalSocket = globalThis.WebSocket;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    getBrowserAccessTokenMock.mockReset();
    FakeWebSocket.instances = [];
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = FakeWebSocket as any;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    globalThis.WebSocket = originalSocket;
  });

  it("opens websocket, streams audio chunks, and handles transcript events", async () => {
    getBrowserAccessTokenMock.mockResolvedValue("jwt-token");

    const deltas: Array<{ delta: string; transcript?: string }> = [];
    const doneEvents: string[] = [];
    const errors: string[] = [];

    const session = await openSpeechRealtimeSession({
      languageCode: "en-US",
      model: "chirp_3",
      onDelta: (delta, transcript) => deltas.push({ delta, transcript }),
      onDone: (transcript) => doneEvents.push(transcript),
      onError: (message) => errors.push(message),
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toContain(
      "wss://example.supabase.co/functions/v1/jaina-speech-realtime?token=jwt-token"
    );
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "session.configure",
      data: {
        languageCode: "en-US",
        model: "chirp_3",
      },
    });

    await session.sendAudioChunk(new Blob(["chunk-1"]));
    await session.sendAudioChunk(new Blob(["chunk-2"]));

    expect(socket.sent).toHaveLength(3);
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      type: "audio.chunk",
      data: { sequence: 1 },
    });
    expect(JSON.parse(socket.sent[2])).toMatchObject({
      type: "audio.chunk",
      data: { sequence: 2 },
    });

    socket.emit("message", {
      data: JSON.stringify({
        type: "transcript.delta",
        data: { delta: "", transcript: "hello world" },
      }),
    });
    socket.emit("message", {
      data: JSON.stringify({
        type: "transcript.done",
        data: { transcript: "hello world final" },
      }),
    });
    socket.emit("message", {
      data: JSON.stringify({
        type: "error",
        data: { message: "service unavailable" },
      }),
    });

    expect(deltas).toEqual([{ delta: "", transcript: "hello world" }]);
    expect(doneEvents).toEqual(["hello world final"]);
    expect(errors).toEqual(["service unavailable"]);

    session.stop();
    expect(JSON.parse(socket.sent[3])).toEqual({ type: "session.stop" });

    session.close();
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("throws when browser access token is unavailable", async () => {
    getBrowserAccessTokenMock.mockResolvedValue(null);
    await expect(openSpeechRealtimeSession({})).rejects.toThrow(
      "Missing browser access token."
    );
  });
});
