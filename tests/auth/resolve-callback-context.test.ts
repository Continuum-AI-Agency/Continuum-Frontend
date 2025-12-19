import test from "node:test";
import assert from "node:assert/strict";

import { resolveCallbackContext } from "../../src/lib/auth/callback-context";

test("resolveCallbackContext prefers query params over cookies", () => {
  const resolved = resolveCallbackContext({
    queryContext: "login",
    queryProvider: "google",
    cookieContext: "auth",
    cookieProvider: "github",
  });

  assert.deepEqual(resolved, { context: "login", provider: "google" });
});

test("resolveCallbackContext falls back to cookies when query is absent", () => {
  const resolved = resolveCallbackContext({
    queryContext: null,
    queryProvider: null,
    cookieContext: "auth",
    cookieProvider: "google",
  });

  assert.deepEqual(resolved, { context: "auth", provider: "google" });
});

test("resolveCallbackContext uses default context when none supplied", () => {
  const resolved = resolveCallbackContext({
    queryContext: null,
    queryProvider: null,
    cookieContext: undefined,
    cookieProvider: undefined,
    defaultContext: "login",
  });

  assert.deepEqual(resolved, { context: "login", provider: null });
});
