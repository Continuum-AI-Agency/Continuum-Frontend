"use client";

import { createContext, useCallback, useContext, useState } from "react";

// Minimal context that tracks whether the brand.md editor has unsaved local
// changes. `BrandBookActions` reads `isDirty` to suppress auto-refresh while
// the user is mid-edit; `BrandMdEditor` calls `setDirty` as the draft changes.
//
// Scoped under `BrandBookSection` so it never leaks outside the settings panel.

type BrandMdDirtyContextValue = {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
};

const BrandMdDirtyContext = createContext<BrandMdDirtyContextValue | null>(null);

export function BrandMdDirtyProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const setDirty = useCallback((dirty: boolean) => setIsDirty(dirty), []);
  return (
    <BrandMdDirtyContext.Provider value={{ isDirty, setDirty }}>
      {children}
    </BrandMdDirtyContext.Provider>
  );
}

export function useBrandMdDirty(): BrandMdDirtyContextValue {
  const ctx = useContext(BrandMdDirtyContext);
  if (!ctx) throw new Error("useBrandMdDirty must be used inside BrandMdDirtyProvider");
  return ctx;
}

// Safe read: returns false when called outside the provider (e.g. BrandBookActions
// rendered in isolation without the editor mounted).
export function useBrandMdDirtyOptional(): boolean {
  const ctx = useContext(BrandMdDirtyContext);
  return ctx?.isDirty ?? false;
}
