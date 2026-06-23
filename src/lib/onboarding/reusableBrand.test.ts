import { describe, expect, it, vi } from "bun:test";
import { findReusableBrandId } from "./reusableBrand";

function makeSupabase(opts: {
  perms?: Array<{ brand_profile_id: string }>;
  permErr?: unknown;
  brands?: Array<{ id: string }>;
  brandErr?: unknown;
}) {
  return {
    schema: () => ({
      from: (table: string) => {
        if (table === "permissions") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: opts.perms ?? [], error: opts.permErr ?? null }),
              }),
            }),
          };
        }
        // brand_profiles
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                order: async () => ({ data: opts.brands ?? [], error: opts.brandErr ?? null }),
              }),
            }),
          }),
        };
      },
    }),
  } as never;
}

describe("findReusableBrandId", () => {
  it("returns the oldest active owned brand", async () => {
    const result = await findReusableBrandId(
      makeSupabase({
        perms: [{ brand_profile_id: "old" }, { brand_profile_id: "new" }],
        brands: [{ id: "old" }, { id: "new" }],
      }),
      "u1"
    );
    expect(result).toBe("old");
  });

  it("returns null when the user owns no brands", async () => {
    expect(await findReusableBrandId(makeSupabase({ perms: [] }), "u1")).toBeNull();
  });

  it("returns null when the user owns brands but none are active", async () => {
    const result = await findReusableBrandId(
      makeSupabase({ perms: [{ brand_profile_id: "dead" }], brands: [] }),
      "u1"
    );
    expect(result).toBeNull();
  });

  it("fails safe (null) when the permissions lookup errors", async () => {
    expect(
      await findReusableBrandId(makeSupabase({ permErr: { code: "XX" } }), "u1")
    ).toBeNull();
  });

  it("fails safe (null) when the brand lookup errors", async () => {
    const result = await findReusableBrandId(
      makeSupabase({ perms: [{ brand_profile_id: "x" }], brandErr: { code: "XX" } }),
      "u1"
    );
    expect(result).toBeNull();
  });
});
