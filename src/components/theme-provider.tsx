"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Theme } from "@radix-ui/themes";

type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  mode: ThemeMode;
  appearance: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredMode(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return null;
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyDomTheme(appearance: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (appearance === "dark") {
    root.setAttribute("data-theme", "dark");
    root.style.colorScheme = "dark";
  } else {
    root.setAttribute("data-theme", "light");
    root.style.colorScheme = "light";
  }

  // Ensure background/foreground take effect even when legacy utility classes linger.
  const computed = getComputedStyle(root);
  const bg = computed.getPropertyValue("--background") || "";
  const fg = computed.getPropertyValue("--foreground") || "";
  document.body.style.backgroundColor = bg.trim();
  document.body.style.color = fg.trim();
}

export function ThemeProvider({ children, initialAppearance }: { children: React.ReactNode; initialAppearance?: "light" | "dark" }) {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredMode() ?? "system");
  const [appearance, setAppearance] = useState<"light" | "dark">(initialAppearance ?? "light");

  // Sync appearance with mode and system preference
  useEffect(() => {
    const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    const compute = () => {
      const resolvedDark = mode === "dark" || (mode === "system" && (media?.matches ?? false));
      const nextAppearance: "light" | "dark" = resolvedDark ? "dark" : "light";
      setAppearance(nextAppearance);
      applyDomTheme(nextAppearance);
      try {
        // Persist current resolved appearance for SSR to pick up on next request
        document.cookie = `appearance=${nextAppearance}; Path=/; Max-Age=31536000; SameSite=Lax`;
      } catch {
        // no-op
      }
    };

    compute();

    if (media) {
      const listener = () => {
        if (mode === "system") compute();
      };
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
  }, [mode]);

  // Persist explicit user preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mode === "system") {
      window.localStorage.removeItem("theme");
    } else {
      window.localStorage.setItem("theme", mode);
    }
    try {
      // Persist the selected mode for informational purposes (not used for SSR directly)
      document.cookie = `themeMode=${mode}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {
      // no-op
    }
  }, [mode]);

  const setModeSafe = useCallback((next: ThemeMode) => setMode(next), []);
  const toggle = useCallback(() => {
    setMode((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ mode, appearance, setMode: setModeSafe, toggle }), [mode, appearance, setModeSafe, toggle]);

  return (
    <ThemeContext.Provider value={value}>
      <Theme appearance={appearance} accentColor="violet" grayColor="slate" radius="medium">
        {children}
      </Theme>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
