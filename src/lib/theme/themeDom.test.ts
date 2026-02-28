import { afterEach, describe, expect, it } from "vitest";

import {
  applyThemeAppearanceToRoot,
  readThemeAppearanceFromRoot,
  resolveThemeAppearance,
} from "./themeDom";

afterEach(() => {
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  root.style.colorScheme = "";
  root.classList.remove("dark", "light");
});

describe("resolveThemeAppearance", () => {
  it("prefers cookie appearance over stored mode", () => {
    expect(
      resolveThemeAppearance({
        cookieAppearance: "dark",
        storedMode: "light",
        prefersDark: false,
      })
    ).toBe("dark");
  });

  it("resolves system mode from prefers-color-scheme", () => {
    expect(
      resolveThemeAppearance({
        storedMode: "system",
        prefersDark: true,
      })
    ).toBe("dark");
  });

  it("falls back to default appearance", () => {
    expect(
      resolveThemeAppearance({
        storedMode: null,
        prefersDark: false,
        defaultAppearance: "dark",
      })
    ).toBe("dark");
  });

  it("falls back to light when no explicit default is provided", () => {
    expect(
      resolveThemeAppearance({
        storedMode: null,
        prefersDark: true,
      })
    ).toBe("light");
  });
});

describe("theme root helpers", () => {
  it("applies class, color-scheme and data-theme consistently", () => {
    const root = document.documentElement;
    applyThemeAppearanceToRoot(root, "dark");

    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("light")).toBe(false);
  });

  it("reads data-theme before class fallback", () => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "light");
    root.classList.add("dark");

    expect(readThemeAppearanceFromRoot(root)).toBe("light");
  });
});
