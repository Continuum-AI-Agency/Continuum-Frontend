// The five structure designs, mounted the way an answer mounts them: the real
// `JainaCampaignStructures` inside the brand scope and the thread context, in a column the width
// of the chat answer. The payloads come from the spec (`window.__structureVisual`), which fills
// each compiled design's height from the real Backend compiler. Only the sign hop is routed.

import type { CampaignStructurePayload } from '@continuum/contracts';
import { createRoot } from 'react-dom/client';
import { JainaCampaignStructures } from '../../src/components/paid-media/jaina/blocks/JainaCampaignStructure';
import { ScaffoldThreadContext } from '../../src/components/paid-media/jaina/scaffold/scaffoldThreadContext';
import { JainaBrandScopeProvider } from '../../src/lib/jaina/brandScope';

declare global {
  interface Window {
    __structureVisual: { brandId: string; structures: CampaignStructurePayload[] };
    __structureVisualMounted?: boolean;
  }
}

const { brandId, structures } = window.__structureVisual;

function Bench() {
  return (
    <JainaBrandScopeProvider adAccountId="act_521903353286118" brandId={brandId}>
      <ScaffoldThreadContext.Provider value={{ sessionId: 'visual-bench' }}>
        {/* The chat answer column: full width on a phone, capped on a desktop. */}
        <main className="mx-auto w-full max-w-3xl px-4 py-6">
          <JainaCampaignStructures structures={structures} />
        </main>
      </ScaffoldThreadContext.Provider>
    </JainaBrandScopeProvider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('campaign structure visual bench: no #root');
createRoot(root).render(<Bench />);
window.__structureVisualMounted = true;
