'use client';

import { createContext, type ReactNode, useContext } from 'react';

export type CanvasRuntime = {
  brandProfileId: string;
  roomId: string;
  flushSave(): Promise<void>;
};

const CanvasRuntimeContext = createContext<CanvasRuntime | null>(null);

export function CanvasRuntimeProvider({
  value,
  children,
}: {
  value: CanvasRuntime | null;
  children: ReactNode;
}) {
  return <CanvasRuntimeContext.Provider value={value}>{children}</CanvasRuntimeContext.Provider>;
}

export function useCanvasRuntime(): CanvasRuntime | null {
  return useContext(CanvasRuntimeContext);
}
