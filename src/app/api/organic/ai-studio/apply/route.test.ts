import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    (globalThis as { __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown })
      .__testCreateSupabaseServerClient?.(...args),
}));

import { POST } from "./route";

describe("POST /api/organic/ai-studio/apply", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = undefined;
  });

  it("returns 400 for invalid payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/organic/ai-studio/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
  });

  it("persists assets and returns normalized apply payload", async () => {
    const uploadMock = mock().mockResolvedValue({ error: null });
    const createSignedUrlMock = mock().mockResolvedValue({ data: { signedUrl: "https://signed.example.com/file.png" }, error: null });
    const rpcMock = mock().mockResolvedValue({ data: true, error: null });
    const getUserMock = mock().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = mock().mockResolvedValue({
      auth: { getUser: getUserMock },
      schema: mock().mockReturnValue({ rpc: rpcMock }),
      storage: {
        from: mock().mockReturnValue({
          upload: uploadMock,
          createSignedUrl: createSignedUrlMock,
        }),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/organic/ai-studio/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "planner_ai_apply_v1",
          draftId: "draft-1",
          brandProfileId: "brand-1",
          postType: "post",
          platform: "instagram",
          overwrite: true,
          contentPatch: {
            captionPreview: "Updated caption",
          },
          assets: [
            {
              role: "primary",
              kind: "image",
              sourceDataUrl:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5M4V8AAAAASUVORK5CYII=",
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
    const payload = await response.json();
    expect(payload.schemaVersion).toBe("planner_ai_apply_v1");
    expect(payload.assets[0].storageUrl).toBe("https://signed.example.com/file.png");
  });
});
