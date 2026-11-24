'use client';

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
} from 'react';
import type { HomePresentation } from './homePresentation';

export const HomePresentationContext = createContext<HomePresentation>('current');
/** Catalog key: "Read-only draft — business changes are disabled." */
export const HOME_DRAFT_READ_ONLY = 'read_only_draft_business_changes_are_disabled_87abbf4';

export function useHomeDraft(): boolean {
  return useContext(HomePresentationContext) === 'dots';
}

export type HomeInspection = { scope: string; id: string; held: boolean } | null;
export const HomeInspectionContext = createContext<{
  active: HomeInspection;
  setActive: Dispatch<SetStateAction<HomeInspection>>;
} | null>(null);

/** One inspection across the board, so a held record cannot compete with another tile. */
export function HomeInspectionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<HomeInspection>(null);
  return <HomeInspectionContext value={{ active, setActive }}>{children}</HomeInspectionContext>;
}
