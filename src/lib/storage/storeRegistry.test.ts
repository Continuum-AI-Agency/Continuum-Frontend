import { describe, expect, it, beforeEach, mock } from "bun:test";
import { register, teardown, purge, reset, size } from "./storeRegistry";

describe("storeRegistry", () => {
  beforeEach(() => {
    reset();
  });

  it("registers and unregisters entries", () => {
    const unregister = register({
      name: "test",
      teardown: () => {},
    });

    expect(size()).toBe(1);
    unregister();
    expect(size()).toBe(0);
  });

  it("teardown invokes every registered handler with the previous brandId", () => {
    const a = mock(() => {});
    const b = mock(() => {});
    register({ name: "a", teardown: a });
    register({ name: "b", teardown: b });

    teardown("brand-prev");

    expect(a).toHaveBeenCalledWith("brand-prev");
    expect(b).toHaveBeenCalledWith("brand-prev");
  });

  it("teardown is a no-op when prevBrandId is empty", () => {
    const handler = mock(() => {});
    register({ name: "x", teardown: handler });

    teardown("");

    expect(handler).not.toHaveBeenCalled();
  });

  it("teardown continues after a handler throws", () => {
    const okHandler = mock(() => {});
    register({
      name: "throws",
      teardown: () => {
        throw new Error("nope");
      },
    });
    register({ name: "ok", teardown: okHandler });

    expect(() => teardown("brand-prev")).not.toThrow();
    expect(okHandler).toHaveBeenCalledWith("brand-prev");
  });

  it("purge only invokes entries that defined a purge handler", () => {
    const purgeA = mock(() => {});
    register({ name: "a", teardown: () => {}, purge: purgeA });
    register({ name: "b", teardown: () => {} });

    purge("brand-prev");

    expect(purgeA).toHaveBeenCalledWith("brand-prev");
  });
});
