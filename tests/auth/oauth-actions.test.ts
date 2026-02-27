import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const mockSignInWithOAuth = mock(() =>
  Promise.resolve({
    data: { url: "https://accounts.example.com/oauth/start" },
    error: null,
  }),
);

const mockCreateSupabaseServerClient = mock(() =>
  Promise.resolve({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
);

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

mock.module("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mock(() => ({
    auth: {
      admin: {
        listUsers: mock(() => Promise.resolve({ data: { users: [] }, error: null })),
      },
    },
  })),
}));

mock.module("next/cache", () => ({
  revalidatePath: mock(() => {}),
}));

mock.module("next/navigation", () => ({
  redirect: mock((_path: string) => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

mock.module("next/headers", () => ({
  cookies: mock(async () => ({
    delete: mock(() => {}),
  })),
}));

import { signInWithGoogleAction, signInWithLinkedInAction } from "@/lib/auth/actions";

describe("oauth actions invite redirect support", () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.trycontinuum.ai";
    mockCreateSupabaseServerClient.mockClear();
    mockSignInWithOAuth.mockClear();
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.example.com/oauth/start" },
      error: null,
    });
  });

  afterEach(() => {
    if (typeof previousSiteUrl === "undefined") {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }
  });

  it("signInWithGoogleAction forwards invite callback redirect", async () => {
    const result = await signInWithGoogleAction("/invite/callback?token=tok-1&brand=brand-1");

    expect(result.success).toBe(true);
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://app.trycontinuum.ai/invite/callback?token=tok-1&brand=brand-1",
      },
    });
  });

  it("signInWithGoogleAction rejects external redirect and falls back to /callback", async () => {
    const result = await signInWithGoogleAction("https://evil.example.com/phish");

    expect(result.success).toBe(true);
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://app.trycontinuum.ai/callback",
      },
    });
  });

  it("signInWithLinkedInAction forwards invite callback redirect", async () => {
    const result = await signInWithLinkedInAction("/invite/callback?token=tok-2&brand=brand-2");

    expect(result.success).toBe(true);
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "linkedin_oidc",
      options: {
        redirectTo: "https://app.trycontinuum.ai/invite/callback?token=tok-2&brand=brand-2",
      },
    });
  });
});
