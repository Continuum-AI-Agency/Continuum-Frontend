import { describe, expect, it, beforeEach, mock } from "bun:test";

const switchActiveBrandActionMock = mock(async (_brandId: string) => {});

mock.module("@/app/(post-auth)/settings/actions", () => ({
  switchActiveBrandAction: switchActiveBrandActionMock,
}));

const { switchBrand } = await import("./switch-brand");

describe("switchBrand", () => {
  beforeEach(() => {
    switchActiveBrandActionMock.mockClear();
    switchActiveBrandActionMock.mockImplementation(async () => {});
  });

  it("returns false when targetBrandId is not provided", async () => {
    const refresh = mock(() => {});
    const result = await switchBrand({ refresh });

    expect(result).toBe(false);
    expect(switchActiveBrandActionMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns false when target matches the current active brand", async () => {
    const refresh = mock(() => {});
    const result = await switchBrand({
      targetBrandId: "brand-a",
      activeBrandId: "brand-a",
      refresh,
    });

    expect(result).toBe(false);
    expect(switchActiveBrandActionMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("calls switchActiveBrandAction with targetBrandId when brands differ", async () => {
    const result = await switchBrand({
      targetBrandId: "brand-b",
      activeBrandId: "brand-a",
    });

    expect(result).toBe(true);
    expect(switchActiveBrandActionMock).toHaveBeenCalledTimes(1);
    expect(switchActiveBrandActionMock).toHaveBeenCalledWith("brand-b");
  });

  it("calls refresh after switchActiveBrandAction completes", async () => {
    const callOrder: string[] = [];
    switchActiveBrandActionMock.mockImplementation(async () => {
      callOrder.push("switch");
    });
    const refresh = mock(() => {
      callOrder.push("refresh");
    });

    await switchBrand({
      targetBrandId: "brand-b",
      activeBrandId: "brand-a",
      refresh,
    });

    expect(callOrder).toEqual(["switch", "refresh"]);
  });

  it("succeeds without a refresh callback", async () => {
    const result = await switchBrand({
      targetBrandId: "brand-b",
      activeBrandId: "brand-a",
    });

    expect(result).toBe(true);
  });

  it("propagates errors thrown by switchActiveBrandAction", async () => {
    switchActiveBrandActionMock.mockImplementation(async () => {
      throw new Error("DB write failed");
    });
    const refresh = mock(() => {});

    let caughtError: unknown;
    try {
      await switchBrand({
        targetBrandId: "brand-b",
        activeBrandId: "brand-a",
        refresh,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe("DB write failed");
    expect(refresh).not.toHaveBeenCalled();
  });
});
