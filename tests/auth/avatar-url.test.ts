import test from "node:test";
import assert from "node:assert/strict";

import { proxyAvatarUrlIfNeeded } from "../../src/lib/auth/avatar-url";

test("proxyAvatarUrlIfNeeded returns same url for non-google hosts", () => {
  assert.equal(proxyAvatarUrlIfNeeded("https://example.com/avatar.png"), "https://example.com/avatar.png");
});

test("proxyAvatarUrlIfNeeded proxies googleusercontent avatar urls", () => {
  assert.equal(
    proxyAvatarUrlIfNeeded("https://lh3.googleusercontent.com/a/abc=s96-c"),
    "/api/avatar?src=https%3A%2F%2Flh3.googleusercontent.com%2Fa%2Fabc%3Ds96-c"
  );
});

