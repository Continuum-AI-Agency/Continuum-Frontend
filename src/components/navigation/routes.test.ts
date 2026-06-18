import { describe, expect, it } from "bun:test";

import {
  APP_NAVIGATION,
  APP_NAVIGATION_FOOTER,
  APP_NAVIGATION_GROUPS,
  isRouteActive,
} from "./routes";

function params(query = ""): URLSearchParams {
  return new URLSearchParams(query);
}

describe("navigation structure", () => {
  it("keeps a flat list of navigable areas for breadcrumb + command palette", () => {
    expect(APP_NAVIGATION.map((i) => i.label)).toEqual([
      "Home",
      "Canvas",
      "Organic",
      "Scale",
      "Library",
    ]);
    expect(APP_NAVIGATION.map((i) => i.href)).toEqual([
      "/dashboard",
      "/ai-studio",
      "/organic",
      "/scale",
      "/library",
    ]);
  });

  it("groups the sidebar into Hessian-style sections", () => {
    expect(APP_NAVIGATION_GROUPS.map((g) => g.label)).toEqual([
      null,
      "Organic",
      "Scale",
      "Storage",
      null,
    ]);
  });

  it("puts Home + Canvas in the unlabeled lead group", () => {
    const lead = APP_NAVIGATION_GROUPS[0];
    expect(lead.label).toBeNull();
    expect(lead.items.map((i) => i.href)).toEqual(["/dashboard", "/ai-studio"]);
  });

  it("nests Organic sub-routes as Agent / Analytics / Calendar", () => {
    const organic = APP_NAVIGATION_GROUPS.find((g) => g.label === "Organic");
    expect(organic?.items.map((i) => i.label)).toEqual([
      "Agent",
      "Analytics",
      "Calendar",
    ]);
    expect(organic?.items.map((i) => i.href)).toEqual([
      "/organic?tab=agent",
      "/organic?tab=metrics",
      "/organic?tab=planner",
    ]);
  });

  it("nests Scale sub-routes as Agent / Analytics / Optimization", () => {
    const scale = APP_NAVIGATION_GROUPS.find((g) => g.label === "Scale");
    expect(scale?.items.map((i) => i.label)).toEqual([
      "Agent",
      "Analytics",
      "Optimization",
    ]);
    expect(scale?.items.map((i) => i.href)).toEqual([
      "/scale?tab=jaina",
      "/scale?tab=dashboard",
      "/scale?tab=performance",
    ]);
  });

  it("puts Library under a Storage section", () => {
    const storage = APP_NAVIGATION_GROUPS.find((g) => g.label === "Storage");
    expect(storage?.items.map((i) => i.href)).toEqual(["/library"]);
  });

  it("exposes a single locked, greyed-out Developers entry", () => {
    const developers = APP_NAVIGATION_GROUPS.flatMap((g) => g.items).find(
      (i) => i.label === "Developers",
    );
    expect(developers).toBeDefined();
    expect(developers!.disabled).toBe(true);
    expect(developers!.locked).toBe(true);
  });

  it("footer is Settings + admin-gated Admin", () => {
    expect(APP_NAVIGATION_FOOTER.map((i) => i.label)).toEqual(["Settings", "Admin"]);
    expect(APP_NAVIGATION_FOOTER.find((i) => i.label === "Admin")?.adminOnly).toBe(true);
  });

  it("carries no Beta badge anywhere", () => {
    expect(APP_NAVIGATION.every((i) => i.badge?.label !== "Beta")).toBe(true);
  });
});

describe("isRouteActive", () => {
  it("matches Home only on exact /dashboard", () => {
    expect(isRouteActive("/dashboard", params(), { href: "/dashboard" })).toBe(true);
    expect(isRouteActive("/dashboard/x", params(), { href: "/dashboard" })).toBe(false);
  });

  it("matches /scale as a parent prefix", () => {
    expect(isRouteActive("/scale", params(), { href: "/scale" })).toBe(true);
    expect(isRouteActive("/scale/approvals", params(), { href: "/scale" })).toBe(true);
    expect(isRouteActive("/scaled", params(), { href: "/scale" })).toBe(false);
  });

  it("matches query-bearing sub-routes only when every param matches", () => {
    expect(
      isRouteActive("/scale", params("tab=performance"), { href: "/scale?tab=performance" }),
    ).toBe(true);
    expect(
      isRouteActive("/scale", params("tab=dashboard"), { href: "/scale?tab=performance" }),
    ).toBe(false);
    expect(
      isRouteActive("/organic", params("tab=metrics"), { href: "/organic?tab=metrics" }),
    ).toBe(true);
    expect(isRouteActive("/scale", params(), { href: "/scale?tab=jaina" })).toBe(false);
  });
});
