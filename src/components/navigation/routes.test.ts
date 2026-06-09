import { describe, expect, it } from "bun:test";

import {
  APP_NAVIGATION,
  APP_NAVIGATION_FOOTER,
  APP_NAVIGATION_GROUPS,
  APP_NAVIGATION_PRIMARY,
  APP_NAVIGATION_SECONDARY,
  isRouteActive,
} from "./routes";

function params(query = ""): URLSearchParams {
  return new URLSearchParams(query);
}

describe("navigation structure", () => {
  it("exposes the four product areas in order", () => {
    expect(APP_NAVIGATION_PRIMARY.map((i) => i.label)).toEqual([
      "Home",
      "Canvas",
      "Organic",
      "Scale",
    ]);
    expect(APP_NAVIGATION_PRIMARY.map((i) => i.href)).toEqual([
      "/dashboard",
      "/ai-studio",
      "/organic",
      "/scale",
    ]);
  });

  it("demotes Library and Primitives to the secondary group", () => {
    expect(APP_NAVIGATION_SECONDARY.map((i) => i.label)).toEqual([
      "Library",
      "Primitives",
    ]);
  });

  it("renders primary group unlabeled and secondary group as Resources", () => {
    expect(APP_NAVIGATION_GROUPS).toHaveLength(2);
    expect(APP_NAVIGATION_GROUPS[0].label).toBeNull();
    expect(APP_NAVIGATION_GROUPS[0].items).toBe(APP_NAVIGATION_PRIMARY);
    expect(APP_NAVIGATION_GROUPS[1].label).toBe("Resources");
    expect(APP_NAVIGATION_GROUPS[1].items).toBe(APP_NAVIGATION_SECONDARY);
  });

  it("keeps a flat list of all six main items for non-grouped consumers", () => {
    expect(APP_NAVIGATION).toHaveLength(6);
    expect(APP_NAVIGATION).toEqual([
      ...APP_NAVIGATION_PRIMARY,
      ...APP_NAVIGATION_SECONDARY,
    ]);
  });

  it("footer is Settings + admin-gated Admin, with no Integrations entry", () => {
    expect(APP_NAVIGATION_FOOTER.map((i) => i.label)).toEqual([
      "Settings",
      "Admin",
    ]);
    expect(APP_NAVIGATION_FOOTER.find((i) => i.label === "Admin")?.adminOnly).toBe(
      true,
    );
    expect(APP_NAVIGATION_FOOTER.some((i) => i.label === "Integrations")).toBe(
      false,
    );
    expect(APP_NAVIGATION_FOOTER.some((i) => i.href.startsWith("/integrations"))).toBe(
      false,
    );
  });

  it("scale quick tabs point at the renamed /scale routes", () => {
    const scale = APP_NAVIGATION_PRIMARY.find((i) => i.label === "Scale");
    expect(scale?.items?.map((s) => s.href)).toEqual([
      "/scale?tab=dashboard",
      "/scale/approvals",
      "/scale?tab=jaina",
    ]);
  });

  it("greys out Primitives and carries no Beta badge anywhere", () => {
    const primitives = APP_NAVIGATION_SECONDARY.find((i) => i.label === "Primitives");
    expect(primitives?.disabled).toBe(true);

    const scale = APP_NAVIGATION_PRIMARY.find((i) => i.label === "Scale");
    expect(scale?.badge).toBeUndefined();
    expect(APP_NAVIGATION.every((i) => i.badge?.label !== "Beta")).toBe(true);
  });
});

describe("isRouteActive", () => {
  it("matches Home only on exact /dashboard", () => {
    expect(isRouteActive("/dashboard", params(), { href: "/dashboard" })).toBe(true);
    expect(isRouteActive("/dashboard/x", params(), { href: "/dashboard" })).toBe(false);
  });

  it("matches /scale exactly and as a parent prefix", () => {
    expect(isRouteActive("/scale", params(), { href: "/scale" })).toBe(true);
    expect(isRouteActive("/scale/approvals", params(), { href: "/scale" })).toBe(true);
    expect(isRouteActive("/scaled", params(), { href: "/scale" })).toBe(false);
  });

  it("matches the Approvals sub-route", () => {
    expect(
      isRouteActive("/scale/approvals", params(), { href: "/scale/approvals" }),
    ).toBe(true);
  });

  it("matches query-bearing quick tabs only when every param matches", () => {
    expect(
      isRouteActive("/scale", params("tab=jaina"), { href: "/scale?tab=jaina" }),
    ).toBe(true);
    expect(
      isRouteActive("/scale", params("tab=dashboard"), { href: "/scale?tab=jaina" }),
    ).toBe(false);
    expect(isRouteActive("/scale", params(), { href: "/scale?tab=jaina" })).toBe(false);
  });
});
