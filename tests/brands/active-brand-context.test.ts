import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockCreateSupabaseServerClient = mock(() => Promise.resolve({} as any));
const mockSetActiveBrandPreference = mock(() => Promise.resolve());

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

mock.module("@/lib/brands/preferences", () => ({
  setActiveBrandPreference: mockSetActiveBrandPreference,
}));

mock.module("server-only", () => ({}));

import { getActiveBrandContext } from "@/lib/brands/active-brand-context";

describe("getActiveBrandContext", () => {
  beforeEach(() => {
    mockCreateSupabaseServerClient.mockReset();
    mockSetActiveBrandPreference.mockReset();
  });

  it("persists fallback active brand when rpc candidate is missing", async () => {
    const permissions = [{ brand_profile_id: "brand-1", role: "owner" }];
    const invites: Array<{ brand_profile_id: string; role: string }> = [];
    const brands = [
      {
        id: "brand-1",
        brand_name: "Acme",
        logo_path: null,
        tier: 2,
        completed_at: "2026-02-26T09:00:00.000Z",
      },
    ];

    const permissionsQuery: any = {
      select: mock(() => permissionsQuery),
      eq: mock(() => Promise.resolve({ data: permissions, error: null })),
    };

    const invitesQuery: any = {
      select: mock(() => invitesQuery),
      eq: mock(() => invitesQuery),
      is: mock(() => invitesQuery),
      gt: mock(() => Promise.resolve({ data: invites, error: null })),
    };

    const brandsQuery: any = {
      select: mock(() => brandsQuery),
      in: mock(() => Promise.resolve({ data: brands, error: null })),
    };

    const schemaBuilder = {
      from: mock((table: string) => {
        if (table === "permissions") return permissionsQuery;
        if (table === "invites") return invitesQuery;
        if (table === "brand_profiles") return brandsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: mock((_fn: string) => Promise.resolve({ data: null, error: null })),
    };

    const supabase = {
      auth: {
        getUser: mock(() =>
          Promise.resolve({
            data: { user: { id: "user-1", email: "owner@example.com" } },
            error: null,
          }),
        ),
      },
      schema: mock((_schema: string) => schemaBuilder),
      storage: {
        from: mock(() => ({ createSignedUrl: mock(() => Promise.resolve({ data: null, error: null })) })),
      },
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    const context = await getActiveBrandContext();

    expect(context.activeBrandId).toBe("brand-1");
    expect(context.activeBrandTier).toBe(2);
    expect(context.brandSummaries).toEqual([
      {
        id: "brand-1",
        name: "Acme",
        completed: true,
        logoPath: null,
        logoUrl: null,
        isPending: false,
      },
    ]);
    expect(mockSetActiveBrandPreference).toHaveBeenCalledWith("brand-1");
  });
});
