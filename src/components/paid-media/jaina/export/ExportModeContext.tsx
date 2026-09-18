'use client';

import { createContext, useContext } from 'react';

// Export mode is a rendering mode, not a feature flag: it is true only inside the
// offscreen document `renderExportDocument` builds, and false in every live surface.
//
// It exists because paper cannot hover. Components that defer work until a pointer
// arrives — `CreativeCell` resolves its preview image on hover-open — would render
// permanently empty in an export, and the old raster exporter shipped exactly that
// hole without anyone noticing. A context rather than a prop so the signal reaches
// a leaf through `BlockRenderer`'s lazy boundary without threading a prop through
// every block component that does not care.
const ExportModeContext = createContext(false);

export function ExportModeProvider({ children }: { children: React.ReactNode }) {
  return <ExportModeContext.Provider value={true}>{children}</ExportModeContext.Provider>;
}

export function useIsExportMode(): boolean {
  return useContext(ExportModeContext);
}
