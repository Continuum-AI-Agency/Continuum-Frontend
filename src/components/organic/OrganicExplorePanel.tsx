'use client';

// Explore tab of the Organic workspace: look up any public Instagram
// business/creator account through the brand's own viewer token (Graph
// business_discovery — the same path as Brand Spy search) and save posts into
// the shared Inspiration Library. Saving reuses SaveToLibraryButton and the
// shared saved-ids query, so a post saved here reads as Saved in Library >
// Inspiration and vice versa. Organic-only: no Paid sources in this tab.

import { useState, type ReactNode } from 'react';
import { SaveToBoardButton } from '@/components/competitor-spy/SaveToBoardButton';
import { CompetitorOrganicExplorer } from '@/components/competitors/CompetitorOrganicExplorer';
import type { CompetitorPostView } from '@/components/competitors/competitorPostView';
import { Segmented } from '@/components/competitors/inspirationControls';
import { SavedInspiration } from '@/components/competitors/SavedInspiration';
import { SaveToLibraryButton } from '@/components/competitors/SaveToLibraryButton';

type Source = 'explore' | 'saved';

const SOURCE_OPTIONS: Array<{ id: Source; label: string }> = [
  { id: 'explore', label: 'Explore' },
  { id: 'saved', label: 'Saved' },
];

// Same save affordances as the Library inspiration tab: YouTube posts stay out
// of the Library (API retention rule), tracked posts can also go to a board.
function ExploreSave({ brandId }: { brandId: string }) {
  return (view: CompetitorPostView): ReactNode =>
    view.post.platform === 'youtube' ? null : (
      <div className="flex items-center gap-1.5">
        {view.competitorId ? (
          <SaveToBoardButton
            brandId={brandId}
            request={{
              kind: 'organic',
              competitorId: view.competitorId,
              competitorName: view.competitorName,
              instagramUsername: view.instagramUsername,
              post: view.post,
            }}
          />
        ) : null}
        <SaveToLibraryButton brandId={brandId} view={view} />
      </div>
    );
}

export function OrganicExplorePanel({ brandId }: { brandId: string }) {
  const [source, setSource] = useState<Source>('explore');
  const renderActions = ExploreSave({ brandId });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center">
        <Segmented label="Source" value={source} options={SOURCE_OPTIONS} onChange={setSource} />
      </div>
      {source === 'explore' ? (
        <CompetitorOrganicExplorer brandId={brandId} renderActions={renderActions} />
      ) : (
        <SavedInspiration brandId={brandId} renderActions={renderActions} />
      )}
    </div>
  );
}
