'use client';

// The brand and ad account the Jaina tab is open on, for client components inside a
// rendered report that need to write something brand-scoped (a saved dashboard) without
// threading two ids through the whole chat surface.

import { createContext, useContext } from 'react';

export type JainaBrandScope = { brandId: string; adAccountId: string | null };

const JainaBrandScopeContext = createContext<JainaBrandScope | null>(null);

export function JainaBrandScopeProvider({
  brandId,
  adAccountId,
  children,
}: JainaBrandScope & { children: React.ReactNode }) {
  return (
    <JainaBrandScopeContext.Provider value={{ brandId, adAccountId }}>
      {children}
    </JainaBrandScopeContext.Provider>
  );
}

/** Null outside the Jaina tab — a report rendered elsewhere simply hides brand-scoped actions. */
export function useJainaBrandScope(): JainaBrandScope | null {
  return useContext(JainaBrandScopeContext);
}
