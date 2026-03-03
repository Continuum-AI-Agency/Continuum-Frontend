import { afterEach, beforeEach, describe, expect, it, mock, vi } from "bun:test";
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";

const replaceSpy = vi.fn<(path: string) => void>();
const getFunctionsInvokeErrorMessageSpy = vi.fn<(error: { message?: string }) => Promise<string | null>>();
const createSupabaseBrowserClientSpy = vi.fn<() => any>();

let params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceSpy }),
  useSearchParams: () => ({
    get: (key: string) => params.get(key),
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientSpy,
}));

vi.mock("@/lib/supabase/functions-errors", () => ({
  getFunctionsInvokeErrorMessage: getFunctionsInvokeErrorMessageSpy,
}));

import InviteCallbackPage from "@/app/invite/callback/page";

type SessionPayload = {
  session: {
    access_token: string;
    user?: { id: string };
  } | null;
};

function createSupabaseStub(options?: {
  sessionError?: Error | null;
  sessionPayload?: SessionPayload;
  invokeError?: { message?: string } | null;
  membership?: { id: string } | null;
  preferenceError?: { message?: string } | null;
}) {
  const auth = {
    setSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    getSession: vi.fn(async () => ({
      data: options?.sessionPayload ?? { session: { access_token: "access-token", user: { id: "user-1" } } },
      error: options?.sessionError ?? null,
    })),
    updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
  };

  const invoke = vi.fn(async () => ({ error: options?.invokeError ?? null }));
  const maybeSingle = vi.fn(async () => ({ data: options?.membership ?? null, error: null }));
  const upsert = vi.fn(async () => ({ error: options?.preferenceError ?? null }));

  const permissionQuery: any = {
    select: vi.fn(() => permissionQuery),
    eq: vi.fn(() => permissionQuery),
    maybeSingle,
  };

  const preferenceQuery: any = {
    upsert,
  };

  const schema = vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "permissions") {
        return permissionQuery;
      }
      if (table === "user_brand_preferences") {
        return preferenceQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  }));

  return {
    auth,
    functions: { invoke },
    schema,
    spies: { auth, invoke, maybeSingle, upsert },
  };
}

describe("InviteCallbackPage", () => {
  const brandId = "a90c3556-30a6-4d0d-9a04-1b5c058d05c5";

  beforeEach(() => {
    replaceSpy.mockReset();
    createSupabaseBrowserClientSpy.mockReset();
    getFunctionsInvokeErrorMessageSpy.mockReset();
    getFunctionsInvokeErrorMessageSpy.mockResolvedValue("Invite failed");
    params = new URLSearchParams();
    window.location.hash = "";
  });

  afterEach(() => {
    cleanup();
    window.location.hash = "";
  });

  it("redirects to missing params when token or brand are invalid", async () => {
    const supabase = createSupabaseStub();
    createSupabaseBrowserClientSpy.mockReturnValue(supabase);
    params = new URLSearchParams();

    render(<InviteCallbackPage />);

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith("/dashboard?invite=missing_params");
    });
  });

  it("redirects to login when no active session token exists", async () => {
    const supabase = createSupabaseStub({ sessionPayload: { session: null } });
    createSupabaseBrowserClientSpy.mockReturnValue(supabase);
    params = new URLSearchParams({ token: "invite-token", brand: brandId });

    render(<InviteCallbackPage />);

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith(
        `/login?token=invite-token&brand=${brandId}`,
      );
    });
  });

  it("accepts invite and redirects to dashboard success", async () => {
    const supabase = createSupabaseStub();
    createSupabaseBrowserClientSpy.mockReturnValue(supabase);
    params = new URLSearchParams({ token: "invite-token", brand: brandId });

    render(<InviteCallbackPage />);

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith("/dashboard?invite=accepted");
    });

    expect(supabase.spies.invoke).toHaveBeenCalledWith("brand_invite", {
      body: { action: "accept", token: "invite-token", brandId },
      headers: { Authorization: "Bearer access-token" },
    });
    expect(supabase.spies.upsert).toHaveBeenCalledTimes(1);
    expect(supabase.spies.auth.updateUser).toHaveBeenCalledWith({
      data: {
        onboarding: {
          activeBrandId: brandId,
        },
      },
    });
  });

  it("treats function error as accepted when membership already exists", async () => {
    const supabase = createSupabaseStub({
      invokeError: { message: "Already accepted" },
      membership: { id: "perm-1" },
    });
    createSupabaseBrowserClientSpy.mockReturnValue(supabase);
    params = new URLSearchParams({ token: "invite-token", brand: brandId });

    render(<InviteCallbackPage />);

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith("/dashboard?invite=accepted");
    });

    expect(supabase.spies.maybeSingle).toHaveBeenCalled();
    expect(supabase.spies.upsert).toHaveBeenCalledTimes(1);
  });

  it("redirects to invite error when active brand preference persistence fails", async () => {
    const supabase = createSupabaseStub({
      preferenceError: { message: "preference write failed" },
    });
    createSupabaseBrowserClientSpy.mockReturnValue(supabase);
    params = new URLSearchParams({ token: "invite-token", brand: brandId });

    render(<InviteCallbackPage />);

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith(
        "/dashboard?invite=error&message=preference%20write%20failed",
      );
    });
  });

  it("redirects to invite error with detailed message when acceptance fails", async () => {
    const supabase = createSupabaseStub({ invokeError: { message: "failed" }, membership: null });
    createSupabaseBrowserClientSpy.mockReturnValue(supabase);
    getFunctionsInvokeErrorMessageSpy.mockResolvedValue("Token expired");
    params = new URLSearchParams({ token: "invite-token", brand: brandId });

    render(<InviteCallbackPage />);

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith(
        "/dashboard?invite=error&message=Token%20expired",
      );
    });
  });

  it("hydrates session from hash auth tokens before accepting invite", async () => {
    const supabase = createSupabaseStub();
    createSupabaseBrowserClientSpy.mockReturnValue(supabase);
    params = new URLSearchParams({ token: "invite-token", brand: brandId });
    window.location.hash = "#access_token=hash-access&refresh_token=hash-refresh";

    render(<InviteCallbackPage />);

    await waitFor(() => {
      expect(supabase.spies.auth.setSession).toHaveBeenCalledWith({
        access_token: "hash-access",
        refresh_token: "hash-refresh",
      });
    });
  });
});
