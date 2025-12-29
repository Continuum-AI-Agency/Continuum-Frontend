import { expect, test } from "bun:test";

import { resolveAuthUserName } from "../../supabase/functions/admin-list-users/user-name";

test("resolveAuthUserName prefers name over full_name", () => {
  const result = resolveAuthUserName({ name: "Duane Smith", full_name: "Duane T. Smith" });

  expect(result).toBe("Duane Smith");
});

test("resolveAuthUserName falls back to full_name", () => {
  const result = resolveAuthUserName({ full_name: "Duane T. Smith" });

  expect(result).toBe("Duane T. Smith");
});

test("resolveAuthUserName returns null for empty metadata", () => {
  const result = resolveAuthUserName({ name: "  ", full_name: "" });

  expect(result).toBeNull();
});
