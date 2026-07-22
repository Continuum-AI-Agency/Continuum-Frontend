'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import React from 'react';
import { CreativeLibrarySidebar } from '@/components/creative-assets/CreativeLibrarySidebar';
import {
  buildAiStudioStorageKey,
  type PlannerAiStudioHandoff,
  plannerAiStudioHandoffSchema,
} from '@/lib/organic/ai-studio-bridge';

const StudioCanvas = dynamic(
  () => import('@/StudioCanvas/components/StudioCanvas').then((mod) => mod.StudioCanvas),
  { ssr: false },
);

type AIStudioClientProps = {
  brandProfileId: string;
  brandName: string;
  initialRoomId: string;
  focusNodeId?: string;
};

function readOrganicPlannerSeedContext(draftId: string): PlannerAiStudioHandoff | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(buildAiStudioStorageKey(draftId));
  if (!raw) return null;

  try {
    const parsed = plannerAiStudioHandoffSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default function AIStudioClient({
  brandProfileId,
  brandName,
  initialRoomId,
  focusNodeId,
}: AIStudioClientProps) {
  const searchParams = useSearchParams();
  const source = searchParams.get('source');
  const draftId = searchParams.get('draftId');
  const [organicPlannerSeed, setOrganicPlannerSeed] = React.useState<PlannerAiStudioHandoff | null>(
    null,
  );

  React.useEffect(() => {
    if (source !== 'organic-planner' || !draftId) {
      setOrganicPlannerSeed(null);
      return;
    }

    setOrganicPlannerSeed(readOrganicPlannerSeedContext(draftId));
  }, [draftId, source]);

  return (
    <div className="fixed inset-x-0 top-0 h-dvh md:left-[var(--app-sidebar-width,3.5rem)] isolate flex flex-col overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(59,130,246,0.15),transparent_35%),radial-gradient(circle_at_88%_12%,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,rgba(10,12,24,0.95) 0%,rgba(10,12,24,0.98) 50%,rgba(7,9,18,1) 100%)]" />

      <main className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-semibold text-white">AI Studio</h1>
            <span className="text-sm text-gray-400">Build flows for {brandName}</span>
          </div>
        </div>

        {/* Full-bleed: the canvas fills the remaining viewport with no padded or
            bordered box around it, so panning reaches the true edges and the
            toolbar/composer/chat overlays are never clipped by a shrunken frame. */}
        <div data-tour-id="studio-canvas" className="min-h-0 w-full flex-1 overflow-hidden">
          <StudioCanvas
            brandProfileId={brandProfileId}
            initialRoomId={initialRoomId}
            focusNodeId={focusNodeId}
            organicPlannerSeed={organicPlannerSeed}
          />
        </div>
      </main>

      <CreativeLibrarySidebar brandProfileId={brandProfileId} />
    </div>
  );
}
