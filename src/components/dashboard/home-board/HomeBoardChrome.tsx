'use client';

// What the board lends every tile frame without the tile knowing: whether the tile is pinned and
// how to pin it. A tile draws its own figures; the pin is the board's.
import type { HomeTileId } from '@continuum/contracts';
import { createContext, useContext } from 'react';

export type HomeBoardChrome = {
  isPinned: (id: HomeTileId) => boolean;
  togglePin: (id: HomeTileId) => void;
};

const NO_PINS: HomeBoardChrome = { isPinned: () => false, togglePin: () => {} };

export const HomeBoardChromeContext = createContext<HomeBoardChrome>(NO_PINS);

export function useHomeBoardChrome(): HomeBoardChrome {
  return useContext(HomeBoardChromeContext);
}
