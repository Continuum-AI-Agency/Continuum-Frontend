'use client';

import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getLocalStorageJSON, removeLocalStorage, setLocalStorageJSON } from '@/lib/storage';
import { STORAGE_KEY_THEME } from '@/lib/storage-keys';
import {
  applyThemeAppearanceToRoot,
  readThemeAppearanceFromRoot,
  type ThemeAppearance,
  type ThemeMode,
} from '@/lib/theme/themeDom';

type ThemeContextValue = {
  mode: ThemeMode;
  appearance: ThemeAppearance;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredMode(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  const stored = getLocalStorageJSON<string | null>(STORAGE_KEY_THEME, null);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return null;
}

function applyDomTheme(appearance: ThemeAppearance) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  applyThemeAppearanceToRoot(root, appearance);

  // Ensure background/foreground take effect even when legacy utility classes linger.
  const computed = getComputedStyle(root);
  const bg = computed.getPropertyValue('--background') || '';
  const fg = computed.getPropertyValue('--foreground') || '';
  document.body.style.backgroundColor = bg.trim();
  document.body.style.color = fg.trim();
}

export function ThemeProvider({
  children,
  initialAppearance,
}: {
  children: React.ReactNode;
  initialAppearance?: ThemeAppearance;
}) {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredMode() ?? 'light');
  const [appearance, setAppearance] = useState<ThemeAppearance>(() => {
    if (initialAppearance) return initialAppearance;
    if (typeof document === 'undefined') return 'light';
    return readThemeAppearanceFromRoot(document.documentElement) ?? 'light';
  });

  // Sync appearance with mode and system preference
  useEffect(() => {
    const media =
      typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    const compute = () => {
      const resolvedDark = mode === 'dark' || (mode === 'system' && (media?.matches ?? false));
      const nextAppearance: ThemeAppearance = resolvedDark ? 'dark' : 'light';
      setAppearance(nextAppearance);
      applyDomTheme(nextAppearance);
    };

    compute();

    if (media) {
      const listener = () => {
        if (mode === 'system') compute();
      };
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [mode]);

  // Persist explicit user preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (mode === 'system') {
      removeLocalStorage(STORAGE_KEY_THEME);
    } else {
      setLocalStorageJSON(STORAGE_KEY_THEME, mode);
    }
  }, [mode]);

  const setModeSafe = useCallback((next: ThemeMode) => setMode(next), []);
  const toggle = useCallback(() => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, appearance, setMode: setModeSafe, toggle }),
    [mode, appearance, setModeSafe, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
