import test from "node:test";
import assert from "node:assert/strict";

import { invokeDeleteBrandProfile, type SupabaseFunctionClient } from "../../src/lib/brands/profile";

function createClient(overrides?: Partial<SupabaseFunctionClient>): SupabaseFunctionClient {
  return {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "token-123" } },
        error: null,
      }),
      ...(overrides?.auth ?? {}),
    },
    functions: {
      invoke: async (_name, _options) => ({
        data: { ok: true },
        error: null,
      }),
      ...(overrides?.functions ?? {}),
    },
  };
}

test("invokeDeleteBrandProfile throws when session cannot be read", async () => {
  const client = createClient({
    auth: {
      getSession: async () => ({
        data: { session: null },
        error: new Error("session failed"),
      }),
    },
  });

  await assert.rejects(
    () => invokeDeleteBrandProfile("brand-1", client),
    /Unable to read session: session failed/
  );
});

test("invokeDeleteBrandProfile throws when access token is missing", async () => {
  const client = createClient({
    auth: {
      getSession: async () => ({
        data: { session: null },
        error: null,
      }),
    },
  });

  await assert.rejects(
    () => invokeDeleteBrandProfile("brand-1", client),
    /Missing session access token/
  );
});

test("invokeDeleteBrandProfile throws when function returns an error", async () => {
  const client = createClient({
    functions: {
      invoke: async () => ({
        data: null,
        error: { message: "Edge failure" },
      }),
    },
  });

  await assert.rejects(
    () => invokeDeleteBrandProfile("brand-1", client),
    /Edge failure/
  );
});

test("invokeDeleteBrandProfile throws when response body contains an error", async () => {
  const client = createClient({
    functions: {
      invoke: async () => ({
        data: { error: "Forbidden" },
        error: null,
      }),
    },
  });

  await assert.rejects(
    () => invokeDeleteBrandProfile("brand-1", client),
    /Forbidden/
  );
});

test("invokeDeleteBrandProfile forwards bearer token to the edge function", async () => {
  let receivedOptions: { body: { brandId: string }; headers?: Record<string, string> } | null = null;
  const client = createClient({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "bearer-xyz" } },
        error: null,
      }),
    },
    functions: {
      invoke: async (_name, options) => {
        receivedOptions = options;
        return { data: { ok: true }, error: null };
      },
    },
  });

  await invokeDeleteBrandProfile("brand-123", client);

  assert.deepEqual(receivedOptions?.body, { brandId: "brand-123" });
  assert.equal(receivedOptions?.headers?.Authorization, "Bearer bearer-xyz");
});
