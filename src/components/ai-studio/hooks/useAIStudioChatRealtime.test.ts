import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useAIStudioChatRealtime } from "./useAIStudioChatRealtime";

type RealtimePayload = { new: any };

let subscribeStatuses: string[] = [];
let realtimeInsertHandler: ((payload: RealtimePayload) => void) | null = null;
let messageLoadResponses: any[][] = [];
let insertResponse: any = null;

const mockChannel = {
  on: mock((event: string, _filter: any, callback: (payload: RealtimePayload) => void) => {
    if (event === "postgres_changes") {
      realtimeInsertHandler = callback;
    }
    return mockChannel;
  }),
  subscribe: mock((callback?: (status: string) => void) => {
    if (callback) {
      subscribeStatuses.forEach((status) => callback(status));
    }
    return mockChannel;
  }),
};

const insertQueryBuilder: any = {
  select: mock(() => insertQueryBuilder),
  single: mock(() => Promise.resolve({ data: insertResponse, error: null })),
};

const queryBuilder: any = {
  select: mock(() => queryBuilder),
  eq: mock(() => queryBuilder),
  order: mock(() => queryBuilder),
  limit: mock(() =>
    Promise.resolve({ data: messageLoadResponses.shift() ?? [], error: null })
  ),
  insert: mock(() => insertQueryBuilder),
};

const mockSupabase: any = {
  channel: mock(() => mockChannel),
  removeChannel: mock(() => {}),
  schema: mock(() => mockSupabase),
  from: mock(() => queryBuilder),
};

const mockToastError = mock(() => {});

mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => mockSupabase,
}));

mock.module("@/hooks/useSession", () => ({
  useSession: () => ({
    user: {
      id: "user-1",
      email: "test@example.com",
      user_metadata: { full_name: "Test User", avatar_url: "avatar.png" },
    },
  }),
}));

mock.module("sonner", () => ({
  toast: {
    error: mockToastError,
  },
}));

describe("useAIStudioChatRealtime", () => {
  beforeEach(() => {
    subscribeStatuses = [];
    realtimeInsertHandler = null;
    messageLoadResponses = [[]];
    insertResponse = null;

    mockChannel.on.mockClear();
    mockChannel.subscribe.mockClear();
    mockSupabase.channel.mockClear();
    mockSupabase.removeChannel.mockClear();
    mockSupabase.from.mockClear();

    queryBuilder.select.mockClear();
    queryBuilder.eq.mockClear();
    queryBuilder.order.mockClear();
    queryBuilder.limit.mockClear();
    queryBuilder.insert.mockClear();

    insertQueryBuilder.select.mockClear();
    insertQueryBuilder.single.mockClear();
    mockToastError.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps a sent message when channel is still connecting", async () => {
    insertResponse = {
      id: "msg-1",
      brand_profile_id: "brand-1",
      user_id: "user-1",
      room_id: "room-1",
      content: "hello",
      created_at: "2026-02-18T10:00:00.000Z",
    };
    messageLoadResponses = [[], []];

    const { result } = renderHook(() => useAIStudioChatRealtime("brand-1", "room-1"));

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.id).toBe("msg-1");
  });

  it("dedupes local insert and realtime insert events", async () => {
    subscribeStatuses = ["SUBSCRIBED"];
    insertResponse = {
      id: "msg-2",
      brand_profile_id: "brand-1",
      user_id: "user-1",
      room_id: "room-1",
      content: "dedupe",
      created_at: "2026-02-18T10:01:00.000Z",
    };
    messageLoadResponses = [[], []];

    const { result } = renderHook(() => useAIStudioChatRealtime("brand-1", "room-1"));

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.sendMessage("dedupe");
    });

    await act(async () => {
      realtimeInsertHandler?.({ new: insertResponse });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.id).toBe("msg-2");
  });

  it("runs a catch-up load when channel subscribes", async () => {
    subscribeStatuses = ["SUBSCRIBED"];
    messageLoadResponses = [
      [],
      [
        {
          id: "msg-3",
          brand_profile_id: "brand-1",
          user_id: "user-2",
          room_id: "room-1",
          content: "missed while connecting",
          created_at: "2026-02-18T10:02:00.000Z",
        },
      ],
    ];

    const { result } = renderHook(() => useAIStudioChatRealtime("brand-1", "room-1"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.id).toBe("msg-3");
  });
});
