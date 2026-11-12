'use client';
import { useTranslations } from 'next-intl';

// Zero state for the Competitive Report: one primary action that kicks off the
// full discover → pull → analyze → gap pipeline.

import { Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ScanLauncher({
  website,
  onStart,
  onManageCompetitors,
}: {
  website?: string | null;
  onStart: () => void;
  onManageCompetitors: () => void;
}) {
  const uiText = useTranslations('competitor');
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border p-12 text-center">
      <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Radar aria-hidden="true" className="size-5" />
      </div>
      <div className="max-w-xl space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground">
          {uiText('scan_your_competitive_landscape_ae1bbc6')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {uiText('we_find_your_competitors_pull_their_meta_ads__ee926df')}
        </p>
        {website ? (
          <p className="text-xs text-muted-foreground">
            {uiText.rich('m_a68fe2250e', {
              website: () => <span className="font-medium text-foreground">{website}</span>,
            })}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col items-center gap-1">
        <Button onClick={onStart} type="button">
          {uiText('scan_my_competitors_80af81b')}
        </Button>
        <Button onClick={onManageCompetitors} size="sm" type="button" variant="link">
          {uiText('or_add_competitors_manually_6361ad9')}
        </Button>
      </div>
    </div>
  );
}
