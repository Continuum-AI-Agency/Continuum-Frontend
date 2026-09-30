'use client';

import * as React from 'react';

/**
 * What a scaffold card needs from the conversation around it, without every message layer
 * passing it down.
 *
 * `sessionId` rides "Open on canvas" so the canvas can lead back to THIS thread, not the
 * newest one. `onScaffoldFocus` is set by a host that keeps a companion canvas beside the
 * chat (the Scale page): a card hands its scaffold to that canvas instead of opening a
 * read-only dialog.
 */
export type ScaffoldThread = {
  sessionId: string | null;
  onScaffoldFocus?: (parentScaffoldId: string) => void;
};

export const ScaffoldThreadContext = React.createContext<ScaffoldThread>({ sessionId: null });

export const useScaffoldThread = (): ScaffoldThread => React.useContext(ScaffoldThreadContext);

/** The canvas page for a scaffold, remembering the thread it was opened from. */
export const scaffoldCanvasHref = (parentScaffoldId: string, sessionId: string | null): string => {
  const params = new URLSearchParams({ scaffold: parentScaffoldId });
  if (sessionId) params.set('session', sessionId);
  return `/scale/campaign-canvas?${params.toString()}`;
};
