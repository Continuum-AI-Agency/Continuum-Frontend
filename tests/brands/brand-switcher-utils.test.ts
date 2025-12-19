import { test, expect } from "bun:test";
import {
  getActiveBrandLabel,
  getBrandMenuItemLabel,
  getUserRoles,
  isAdminUser,
} from "@/lib/brands/brand-switcher-utils";

test("getUserRoles returns empty when roles missing", () => {
  expect(getUserRoles(null)).toEqual([]);
  expect(getUserRoles({ app_metadata: {} })).toEqual([]);
  expect(getUserRoles({ app_metadata: { roles: "admin" } })).toEqual([]);
});

test("getUserRoles returns roles when present", () => {
  expect(getUserRoles({ app_metadata: { roles: ["viewer", "admin"] } })).toEqual(["viewer", "admin"]);
});

test("isAdminUser respects is_admin flag and roles", () => {
  expect(isAdminUser({ app_metadata: { is_admin: true } })).toBe(true);
  expect(isAdminUser({ app_metadata: { roles: ["admin"] } })).toBe(true);
  expect(isAdminUser({ app_metadata: { roles: ["viewer"] } })).toBe(false);
});

test("brand label helpers match menu behavior", () => {
  const brands = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "" },
  ];

  expect(getActiveBrandLabel(brands, "a")).toBe("Alpha");
  expect(getActiveBrandLabel(brands, "b")).toBe("Brands");
  expect(getActiveBrandLabel(brands, "missing")).toBe("Brands");

  expect(getBrandMenuItemLabel(brands[0])).toBe("Alpha");
  expect(getBrandMenuItemLabel(brands[1])).toBe("Untitled brand");
});

