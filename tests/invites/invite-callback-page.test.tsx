import { beforeEach, describe, expect, it, mock } from "bun:test";

const getFunctionsInvokeErrorMessageSpy = mock<(error: { message?: string }) => Promise<string | null>>(() =>
  Promise.resolve("Invite failed"),
);
const createSupabaseServerClientSpy = mock<() => Promise<any>>(() => Promise.resolve({}));
const setActiveBrandPreferenceSpy = mock((_brandId: string) => Promise.resolve());

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientSpy,
}));

mock.module("@/lib/supabase/functions-errors", () => ({
  getFunctionsInvokeErrorMessage: getFunctionsInvokeErrorMessageSpy,
}));

mock.module("@/lib/brands/preferences", () => ({
  setActiveBrandPreference: setActiveBrandPreferenceSpy,
}));

mock.module("server-only", () => ({}));

import { finalizeInviteAcceptance } from "@/lib/invites/finalize";

function createSupabaseStub(options?: {
  sessionError?: Error | null;
  sessionPayload?: {
    session: {
      access_token: string;
      user?: { id: string };
    } | null;
  };
  invokeError?: { message?: string } | null;
  membership?: { id: string } | null;
}) {
  const auth = {
    getSession: mock(async () => ({
      data: options?.sessionPayload ?? { session: { access_token: "access-token", user: { id: "user-1" } } },
      error: options?.sessionError ?? null,
    })),
  };

  const invoke = mock(async () => ({ error: options?.invokeError ?? null }));
  const maybeSingle = mock(async () => ({ data: options?.membership ?? null, error: null }));

  const permissionQuery: any = {
    select: mock(() => permissionQuery),
    eq: mock(() => permissionQuery),
    maybeSingle,
  };

  return {
    auth,
    functions: { invoke },
    schema: mock(() => ({
      from: mock((table: string) => {
        if (table === "permissions") {
          return permissionQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    })),
    spies: { invoke, maybeSingle },
  };
}

describe("finalizeInviteAcceptance", () => {
  const brandId = "a90c3556-30a6-4d0d-9a04-1b5c058d05c5";

  beforeEach(() => {
    createSupabaseServerClientSpy.mockReset();
    getFunctionsInvokeErrorMessageSpy.mockReset();
    setActiveBrandPreferenceSpy.mockReset();
    getFunctionsInvokeErrorMessageSpy.mockResolvedValue("Invite failed");
    setActiveBrandPreferenceSpy.mockResolvedValue(undefined);
  });

  it("redirects to login when no active session token exists", async () => {
    const supabase = createSupabaseStub({ sessionPayload: { session: null } });
    createSupabaseServerClientSpy.mockResolvedValue(supabase);

    const result = await finalizeInviteAcceptance("invite-token", brandId);

    expect(result.path).toBe(`/login?token=invite-token&brand=${brandId}`);
  });

  it("accepts invite, persists active brand, and returns dashboard success", async () => {
    const supabase = createSupabaseStub();
    createSupabaseServerClientSpy.mockResolvedValue(supabase);

    const result = await finalizeInviteAcceptance("invite-token", brandId);

    expect(result.path).toBe(`/dashboard?invite=accepted&welcome=brand:${brandId}`);
    expect(supabase.spies.invoke).toHaveBeenCalledWith("brand_invite", {
      body: { action: "accept", token: "invite-token", brandId },
      headers: { Authorization: "Bearer access-token" },
    });
    expect(setActiveBrandPreferenceSpy).toHaveBeenCalledWith(brandId);
  });

  it("treats function error as accepted when membership already exists", async () => {
    const supabase = createSupabaseStub({
      invokeError: { message: "Already accepted" },
      membership: { id: "perm-1" },
    });
    createSupabaseServerClientSpy.mockResolvedValue(supabase);

    const result = await finalizeInviteAcceptance("invite-token", brandId);

    expect(result.path).toBe(`/dashboard?invite=accepted&welcome=brand:${brandId}`);
    expect(supabase.spies.maybeSingle).toHaveBeenCalled();
    expect(setActiveBrandPreferenceSpy).toHaveBeenCalledWith(brandId);
  });

  it("redirects to invite error when active brand preference persistence fails", async () => {
    const supabase = createSupabaseStub();
    createSupabaseServerClientSpy.mockResolvedValue(supabase);
    setActiveBrandPreferenceSpy.mockRejectedValue(new Error("preference write failed"));

    const result = await finalizeInviteAcceptance("invite-token", brandId);

    expect(result.path).toBe("/dashboard?invite=error&message=preference%20write%20failed");
  });

  it("redirects to invite error with detailed message when acceptance fails", async () => {
    const supabase = createSupabaseStub({ invokeError: { message: "failed" }, membership: null });
    createSupabaseServerClientSpy.mockResolvedValue(supabase);
    getFunctionsInvokeErrorMessageSpy.mockResolvedValue("Token expired");

    const result = await finalizeInviteAcceptance("invite-token", brandId);

    expect(result.path).toBe("/dashboard?invite=error&message=Token%20expired");
  });
});
