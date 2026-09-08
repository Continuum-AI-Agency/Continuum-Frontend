'use client';

// The active project — the optional second scope beneath the brand.
//
// Modelled on ActiveBrandProvider, including its BroadcastChannel cross-tab sync: a tab that
// selects a project broadcasts it, and other tabs adopt it only if they are on the SAME
// brand. Unlike the brand, there is no server-confirmed source of truth to reconcile against
// — null (the whole brand) is a legitimate, and the default, state.
//
// Selection is deliberately NOT persisted. A project is a scope on the work in front of you,
// and a stale one silently narrowing every read after a reload is the failure mode that
// costs more than re-selecting costs.

import type { Project } from '@continuum/contracts';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { useProjects } from '@/lib/projects/hooks';

const CHANNEL = 'continuum:project';

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

  // A project belongs to one brand, so a selection cannot survive a brand switch — carrying
  // it over would scope brand B's reads by brand A's project id and return nothing.
  useEffect(() => {
    setActiveProjectId(null);
  }, [activeBrandId]);

  // Archived or deleted elsewhere: drop the selection rather than hold an id that filters
  // every read down to zero rows with no visible cause.
  useEffect(() => {
    if (isLoading || activeProjectId === null) return;
    if (!projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(null);
    }
  }, [projects, activeProjectId, isLoading]);

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
    };
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, []);

  const selectProject = React.useCallback((projectId: string | null) => {
    setActiveProjectId(projectId);
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
