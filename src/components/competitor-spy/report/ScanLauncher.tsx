'use client';

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
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border p-12 text-center">
      <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Radar aria-hidden="true" className="size-5" />
      </div>
      <div className="max-w-xl space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground">Scan your competitive landscape</h2>
        <p className="text-sm text-muted-foreground">
          We find your competitors, pull their Meta ads, break down the hooks and angles they keep
          scaling, and show exactly where your ads fall short.
        </p>
        {website ? (
          <p className="text-xs text-muted-foreground">
            Scanning around <span className="font-medium text-foreground">{website}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-col items-center gap-1">
        <Button onClick={onStart} type="button">
          Scan my competitors
        </Button>
        <Button onClick={onManageCompetitors} size="sm" type="button" variant="link">
          Or add competitors manually
        </Button>
      </div>
    </div>
  );
}
