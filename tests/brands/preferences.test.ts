import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockCreateSupabaseServerClient = mock(() => Promise.resolve({} as any));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

mock.module("server-only", () => ({}));

import { setActiveBrandPreference } from "@/lib/brands/preferences";

describe("setActiveBrandPreference", () => {
  beforeEach(() => {
    mockCreateSupabaseServerClient.mockReset();
  });

  it("throws when brand id is missing", async () => {
    await expect(setActiveBrandPreference("")).rejects.toThrow("Brand id is required");
  });

  it("throws when user is unauthenticated", async () => {
    const supabase = {
      auth: {
        getUser: mock(() => Promise.resolve({ data: { user: null }, error: null })),
      },
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    await expect(setActiveBrandPreference("brand-1")).rejects.toThrow("Not authenticated");
  });

  it("throws when membership lookup fails", async () => {
    const maybeSingle = mock(() => Promise.resolve({ data: null, error: new Error("membership failed") }));
    const permissionsQuery: any = {
      select: mock(() => permissionsQuery),
      eq: mock(() => permissionsQuery),
      maybeSingle,
    };

    const supabase = {
      auth: {
        getUser: mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null })),
      },
      schema: mock((_schema: string) => ({
        from: mock((_table: string) => permissionsQuery),
      })),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    await expect(setActiveBrandPreference("brand-1")).rejects.toThrow("membership failed");
  });

  it("throws when user does not have brand access", async () => {
    const maybeSingle = mock(() => Promise.resolve({ data: null, error: null }));
    const permissionsQuery: any = {
      select: mock(() => permissionsQuery),
      eq: mock(() => permissionsQuery),
      maybeSingle,
    };

    const supabase = {
      auth: {
        getUser: mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null })),
      },
      schema: mock((_schema: string) => ({
        from: mock((_table: string) => permissionsQuery),
      })),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    await expect(setActiveBrandPreference("brand-1")).rejects.toThrow("You do not have access to this brand");
  });

  it("upserts preference and updates user metadata when membership exists", async () => {
    const maybeSingle = mock(() => Promise.resolve({ data: { brand_profile_id: "brand-1" }, error: null }));
    const upsert = mock(() => Promise.resolve({ error: null }));

    const permissionsQuery: any = {
      select: mock(() => permissionsQuery),
      eq: mock(() => permissionsQuery),
      maybeSingle,
    };

    const preferencesQuery: any = {
      upsert,
    };

    const updateUser = mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }));

    const supabase = {
      auth: {
        getUser: mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null })),
        updateUser,
      },
      schema: mock((_schema: string) => ({
        from: mock((table: string) => {
          if (table === "permissions") {
            return permissionsQuery;
          }
          if (table === "user_brand_preferences") {
            return preferencesQuery;
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      })),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    await setActiveBrandPreference("brand-1");

    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = upsert.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(payload.user_id).toBe("user-1");
    expect(payload.active_brand_id).toBe("brand-1");
    expect(typeof payload.updated_at).toBe("string");
    expect(options).toEqual({ onConflict: "user_id" });

    expect(updateUser).toHaveBeenCalledWith({
      data: {
        onboarding: {
          activeBrandId: "brand-1",
        },
      },
    });
  });
});
