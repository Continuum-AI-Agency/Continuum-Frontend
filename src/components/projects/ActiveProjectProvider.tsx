'use client';

// The active project — the optional second scope beneath the brand.
//
// Modelled on ActiveBrandProvider, including its BroadcastChannel cross-tab sync: a tab that
// selects a project broadcasts it, and other tabs adopt it only if they are on the SAME
// brand. Unlike the brand, there is no server-confirmed source of truth to reconcile against
// — null (the whole brand) is a legitimate, and the default, state.
//
// Selection IS persisted, per brand, in localStorage. It deliberately was not, on the
// argument that a stale scope silently narrowing every read is worse than re-selecting. The
// argument holds; the conclusion did not follow. The chip sits in the header at all times, so
// the scope is not silent — and the provider already drops a selection whose project has been
// archived or deleted, which is the actual staleness this feared. What amnesia bought instead
// was re-selecting on every page load, which is a per-navigation tax on a feature whose whole
// promise is that you set a scope once.
//
// The old state was also incoherent: a BroadcastChannel carried the selection to a DIFFERENT
// tab while refusing to survive a reload of the SAME one. Both halves now agree.

import type { Project } from '@continuum/contracts';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { useProjects } from '@/lib/projects/hooks';

const CHANNEL = 'continuum:project';
/** Per BRAND, because a project id means nothing under another brand. */
const storageKey = (brandId: string) => `continuum:project:${brandId}`;

/** Every access is wrapped: private windows and blocked site data throw on read AND write. */
const readStored = (brandId: string | undefined): string | null => {
  if (!brandId || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(storageKey(brandId));
  } catch {
    return null;
  }
};

const writeStored = (brandId: string | undefined, projectId: string | null): void => {
  if (!brandId || typeof window === 'undefined') return;
  try {
    if (projectId) window.localStorage.setItem(storageKey(brandId), projectId);
    else window.localStorage.removeItem(storageKey(brandId));
  } catch {
    /* storage is a convenience here, never a source of truth */
  }
};

type ProjectSelectedMessage = {
  type: 'project-selected';
  brandId: string;
  projectId: string | null;
};

export type ActiveProjectContextValue = {
  /** null means brand scope — the default, and always reachable. */
  activeProjectId: string | null;
  activeProject: Project | null;
  /** The brand's active projects, so consumers need no second query for a selector. */
  projects: Project[];
  isLoading: boolean;
  error: Error | null;
  selectProject: (projectId: string | null) => void;
};

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(null);

export function ActiveProjectProvider({ children }: { children: React.ReactNode }) {
  const { activeBrandId } = useActiveBrandContext();
  const { projects, isLoading, error } = useProjects(activeBrandId);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // A project belongs to one brand, so brand A's selection cannot carry into brand B — but
  // each brand remembers its OWN last scope, which is what makes switching back cheap.
  //
  // Restored in an effect rather than in useState's initializer because this renders on the
  // server too, where there is no localStorage: seeding from storage during render would make
  // the first client paint disagree with the server's and hydrate mismatched.
  useEffect(() => {
    setActiveProjectId(readStored(activeBrandId));
  }, [activeBrandId]);

  // Archived or deleted elsewhere: drop the selection rather than hold an id that filters
  // every read down to zero rows with no visible cause.
  useEffect(() => {
    if (isLoading || activeProjectId === null) return;
    if (!projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(null);
      // Forget it too, or the next reload restores the same dead id and drops it again.
      writeStored(activeBrandId, null);
    }
  }, [projects, activeProjectId, isLoading, activeBrandId]);

  const brandRef = React.useRef(activeBrandId);
  brandRef.current = activeBrandId;

  const channelRef = React.useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      return;
    }
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as Partial<ProjectSelectedMessage> | undefined;
      if (!data || data.type !== 'project-selected') return;
      // Another tab on another brand: its selection means nothing here.
      if (data.brandId !== brandRef.current) return;
      setActiveProjectId(data.projectId ?? null);
      writeStored(brandRef.current, data.projectId ?? null);
    };
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, []);

  const selectProject = React.useCallback((projectId: string | null) => {
    setActiveProjectId(projectId);
    writeStored(brandRef.current, projectId);
    try {
      channelRef.current?.postMessage({
        type: 'project-selected',
        brandId: brandRef.current,
        projectId,
      } satisfies ProjectSelectedMessage);
    } catch {
      /* cross-tab notify is best-effort */
    }
  }, []);

  const value = useMemo<ActiveProjectContextValue>(
    () => ({
      activeProjectId,
      activeProject: projects.find((project) => project.id === activeProjectId) ?? null,
      projects,
      isLoading,
      error,
      selectProject,
    }),
    [activeProjectId, projects, isLoading, error, selectProject],
  );

  return <ActiveProjectContext.Provider value={value}>{children}</ActiveProjectContext.Provider>;
}

/**
 * The context when a provider is mounted, else null.
 *
 * For surfaces that legitimately render both inside and outside the dashboard shell — the
 * Jaina surface is embedded in the Campaign Canvas as well as the Scale route. Throwing there
 * would turn a missing optional scope into a blank screen.
 */
export function useActiveProjectOptional(): ActiveProjectContextValue | null {
  return useContext(ActiveProjectContext);
}

export function useActiveProject(): ActiveProjectContextValue {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) {
    throw new Error('useActiveProject must be used within ActiveProjectProvider');
  }
  return ctx;
}
