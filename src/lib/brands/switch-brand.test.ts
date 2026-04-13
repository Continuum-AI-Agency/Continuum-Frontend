import { describe, expect, it, mock } from "bun:test";
import { switchBrand } from "./switch-brand";

describe("switchBrand", () => {
  it("returns false when targetBrandId is not provided", async () => {
    const switchAction = mock(async () => {});
    const refresh = mock(() => {});

    const result = await switchBrand({ switchAction, refresh });

    expect(result).toBe(false);
    expect(switchAction).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns false when target matches the current active brand", async () => {
    const switchAction = mock(async () => {});
    const refresh = mock(() => {});

    const result = await switchBrand({
      targetBrandId: "brand-a",
      activeBrandId: "brand-a",
      switchAction,
      refresh,
    });

    expect(result).toBe(false);
    expect(switchAction).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("calls switchAction with targetBrandId when brands differ", async () => {
    const switchAction = mock(async () => {});

    const result = await switchBrand({
      targetBrandId: "brand-b",
      activeBrandId: "brand-a",
      switchAction,
    });

    expect(result).toBe(true);
    expect(switchAction).toHaveBeenCalledTimes(1);
    expect(switchAction).toHaveBeenCalledWith("brand-b");
  });

  it("calls refresh after switchAction completes", async () => {
    const callOrder: string[] = [];
    const switchAction = mock(async () => {
      callOrder.push("switch");
    });
    const refresh = mock(() => {
      callOrder.push("refresh");
    });

    await switchBrand({
      targetBrandId: "brand-b",
      activeBrandId: "brand-a",
      switchAction,
      refresh,
    });

    expect(callOrder).toEqual(["switch", "refresh"]);
  });

  it("succeeds without a refresh callback", async () => {
    const switchAction = mock(async () => {});

    const result = await switchBrand({
      targetBrandId: "brand-b",
      activeBrandId: "brand-a",
      switchAction,
    });

    expect(result).toBe(true);
  });

  it("propagates errors thrown by switchAction", async () => {
    const switchAction = mock(async () => {
      throw new Error("DB write failed");
    });
    const refresh = mock(() => {});

    let caughtError: unknown;
    try {
      await switchBrand({
        targetBrandId: "brand-b",
        activeBrandId: "brand-a",
        switchAction,
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
