import test from "node:test";
import assert from "node:assert/strict";

import { resolveHeadersOrigin } from "../../src/lib/server/origin";

function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key];
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("resolveHeadersOrigin prefers localhost origin in development", () => {
  withEnv(
    {
      NODE_ENV: "development",
      NEXT_PUBLIC_SITE_URL: "https://app.continuum.example",
      SITE_URL: undefined,
      OAUTH_ALLOWED_ORIGINS: undefined,
      NEXT_PUBLIC_OAUTH_ALLOWED_ORIGINS: undefined,
    },
    () => {
      const headerStore = new Headers({
        host: "localhost:3000",
        origin: "http://localhost:3000",
      });

      const origin = resolveHeadersOrigin(headerStore, "https://app.continuum.example");
      assert.equal(origin, "http://localhost:3000");
    }
  );
});

test("resolveHeadersOrigin falls back to env origin in production for unlisted origins", () => {
  withEnv(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://app.continuum.example",
      SITE_URL: undefined,
      OAUTH_ALLOWED_ORIGINS: undefined,
      NEXT_PUBLIC_OAUTH_ALLOWED_ORIGINS: undefined,
    },
    () => {
      const headerStore = new Headers({
        host: "evil.example",
        origin: "https://evil.example",
      });

      const origin = resolveHeadersOrigin(headerStore, "https://app.continuum.example");
      assert.equal(origin, "https://app.continuum.example");
    }
  );
});

test("resolveHeadersOrigin accepts explicitly allowed origins in production", () => {
  withEnv(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://app.continuum.example",
      NEXT_PUBLIC_OAUTH_ALLOWED_ORIGINS: "https://staging.continuum.example",
    },
    () => {
      const headerStore = new Headers({
        host: "staging.continuum.example",
        origin: "https://staging.continuum.example",
      });

      const origin = resolveHeadersOrigin(headerStore, "https://app.continuum.example");
      assert.equal(origin, "https://staging.continuum.example");
    }
  );
});

