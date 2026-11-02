'use client';

// The dashboard's sub-tab lives in the URL hash (`#embudo`), as in the module prototype, so a
// section link is shareable and the browser's back button walks the sections. The Performance+
// tab itself stays in the query string (`optimizerView=dashboard`); the two never collide.

import { useCallback, useEffect, useState } from 'react';

export const DASHBOARD_SECTIONS = [
  'piloto',
  'meta',
  'embudo',
  'campanas',
  'ofertas',
  'audiencias',
  'sucursales',
  'medicion',
  'plan',
] as const;

export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

export function parseDashboardSection(hash: string): DashboardSection {
  const value = hash.replace(/^#/, '');
  return DASHBOARD_SECTIONS.find((section) => section === value) ?? 'piloto';
}

export function useDashboardSection(): [DashboardSection, (next: DashboardSection) => void] {
  const [section, setSection] = useState<DashboardSection>('piloto');

  useEffect(() => {
    const sync = () => setSection(parseDashboardSection(window.location.hash));
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const select = useCallback((next: DashboardSection) => {
    const url = new URL(window.location.href);
    url.hash = next;
    window.history.pushState(null, '', url);
    setSection(next);
  }, []);

  return [section, select];
}
