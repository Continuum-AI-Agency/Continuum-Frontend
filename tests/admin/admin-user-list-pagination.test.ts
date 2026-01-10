import { expect, test } from "bun:test";

import { resolveTotalPages } from "../../supabase/functions/admin-list-users/pagination";

test("resolveTotalPages prefers lastPage when provided", () => {
  const result = resolveTotalPages({ lastPage: 4, total: 120 }, 50);

  expect(result).toBe(4);
});

test("resolveTotalPages uses total when lastPage is missing", () => {
  const result = resolveTotalPages({ total: 120 }, 50);

  expect(result).toBe(3);
});

test("resolveTotalPages returns null when total is missing", () => {
  const result = resolveTotalPages({}, 50);

  expect(result).toBeNull();
});
