import { describe, expect, it, beforeEach, mock } from "bun:test";
import { onBrandChange, registerBrandScopedStore } from "./brand-switch";
import * as storeRegistry from "../storage/storeRegistry";

describe("brand-switch", () => {
  beforeEach(() => {
    storeRegistry.reset();
  });

  describe("onBrandChange", () => {
    it("fires the subscriber with the full event when teardown runs", () => {
      const handler = mock(() => {});
      const unsubscribe = onBrandChange(handler);

      storeRegistry.teardown("brand-a", {
        prevBrandId: "brand-a",
        nextBrandId: "brand-b",
        reason: "local-switch",
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        prevBrandId: "brand-a",
        nextBrandId: "brand-b",
        reason: "local-switch",
      });

      unsubscribe();
    });

    it("unsubscribe stops the handler from receiving further events", () => {
      const handler = mock(() => {});
      const unsubscribe = onBrandChange(handler);
      unsubscribe();

      storeRegistry.teardown("brand-a");

      expect(handler).not.toHaveBeenCalled();
    });

    it("constructs a default local-switch event when teardown is called without one", () => {
      const handler = mock(() => {});
      onBrandChange(handler);

      storeRegistry.teardown("brand-a");

      expect(handler).toHaveBeenCalledWith({
        prevBrandId: "brand-a",
        nextBrandId: null,
        reason: "local-switch",
      });
    });

    it("a throwing subscriber does not block other subscribers", () => {
      const ok = mock(() => {});
      onBrandChange(() => {
        throw new Error("boom");
      });
      onBrandChange(ok);

      expect(() => storeRegistry.teardown("brand-a")).not.toThrow();
      expect(ok).toHaveBeenCalled();
    });

    it("fires for cross-tab-sync reason too", () => {
      const handler = mock(() => {});
      onBrandChange(handler);

      storeRegistry.teardown("brand-a", {
        prevBrandId: "brand-a",
        nextBrandId: "brand-b",
        reason: "cross-tab-sync",
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "cross-tab-sync" })
      );
    });
  });

  describe("registerBrandScopedStore", () => {
    it("calls reset on teardown", () => {
      const reset = mock(() => {});
      registerBrandScopedStore({ name: "my-store", reset });

      storeRegistry.teardown("brand-a");

      expect(reset).toHaveBeenCalledTimes(1);
    });

    it("calls purge on storeRegistry.purge", () => {
      const reset = mock(() => {});
      const purge = mock(() => {});
      registerBrandScopedStore({ name: "my-store", reset, purge });

      storeRegistry.purge("brand-a");

      expect(purge).toHaveBeenCalledTimes(1);
    });

    it("a throwing reset does not stop other entries", () => {
      const otherReset = mock(() => {});
      registerBrandScopedStore({
        name: "throws",
        reset: () => {
          throw new Error("boom");
        },
      });
      registerBrandScopedStore({ name: "ok", reset: otherReset });

      expect(() => storeRegistry.teardown("brand-a")).not.toThrow();
      expect(otherReset).toHaveBeenCalled();
    });

    it("registration is keyed by name (same name overwrites prior entry)", () => {
      const firstReset = mock(() => {});
      const secondReset = mock(() => {});
      registerBrandScopedStore({ name: "store", reset: firstReset });
      registerBrandScopedStore({ name: "store", reset: secondReset });

      storeRegistry.teardown("brand-a");

      expect(firstReset).not.toHaveBeenCalled();
      expect(secondReset).toHaveBeenCalled();
    });
  });
});
