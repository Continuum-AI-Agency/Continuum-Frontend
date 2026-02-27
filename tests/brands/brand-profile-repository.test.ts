import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockSetActiveBrandPreference = mock(() => Promise.resolve());

mock.module("@/lib/brands/preferences", () => ({
  setActiveBrandPreference: mockSetActiveBrandPreference,
}));

import { createSupabaseBrandProfileRepository } from "@/lib/repositories/brandProfile";

describe("createSupabaseBrandProfileRepository", () => {
  beforeEach(() => {
    mockSetActiveBrandPreference.mockReset();
  });

  it("switchActiveBrand uses active brand preference persistence", async () => {
    const repository = createSupabaseBrandProfileRepository();

    await repository.switchActiveBrand("brand-123");

    expect(mockSetActiveBrandPreference).toHaveBeenCalledWith("brand-123");
  });
});
