import { afterEach, expect, test } from "bun:test";

import {
  getClientCommitSha,
  getServerCommitSha,
  isVersionMismatch,
  LOCAL_DEV_SHA,
  parseVersionResponse,
} from "@/lib/system/version";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
});

test("getServerCommitSha uses VERCEL_GIT_COMMIT_SHA when set", () => {
  process.env.VERCEL_GIT_COMMIT_SHA = "sha-server";
  expect(getServerCommitSha()).toBe("sha-server");
});

test("getServerCommitSha falls back to local dev when unset", () => {
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  expect(getServerCommitSha()).toBe(LOCAL_DEV_SHA);
});

test("getClientCommitSha uses NEXT_PUBLIC_COMMIT_SHA when set", () => {
  process.env.NEXT_PUBLIC_COMMIT_SHA = "sha-client";
  expect(getClientCommitSha()).toBe("sha-client");
});

test("getClientCommitSha falls back to local dev when unset", () => {
  delete process.env.NEXT_PUBLIC_COMMIT_SHA;
  expect(getClientCommitSha()).toBe(LOCAL_DEV_SHA);
});

test("isVersionMismatch returns false for local dev", () => {
  expect(isVersionMismatch({ clientSha: LOCAL_DEV_SHA, serverSha: "sha" })).toBe(false);
  expect(isVersionMismatch({ clientSha: "sha", serverSha: LOCAL_DEV_SHA })).toBe(false);
});

test("isVersionMismatch detects different shas", () => {
  expect(isVersionMismatch({ clientSha: "sha-a", serverSha: "sha-b" })).toBe(true);
  expect(isVersionMismatch({ clientSha: "sha-a", serverSha: "sha-a" })).toBe(false);
});

test("parseVersionResponse validates shape", () => {
  expect(parseVersionResponse({ sha: "sha-1" }).sha).toBe("sha-1");
  expect(() => parseVersionResponse({})).toThrow();
});
