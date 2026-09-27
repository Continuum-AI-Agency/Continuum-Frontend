'use client';

// One share link's presentation settings and its reviewer activity, loaded by
// id (from the asset's link list) or by token (from a freshly made share URL).

import type { ShareLinkDetailResponse } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShareLinkActivity } from './ShareLinkActivity';
import { ShareLinkSettings } from './ShareLinkSettings';
import { fetchShareLinkDetail } from './shareLinkClient';

export function ShareLinkPanel({ by }: { by: { id: string } | { token: string } }) {
  const [detail, setDetail] = useState<ShareLinkDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isId = 'id' in by;
  const key = 'id' in by ? by.id : by.token;

  const load = useCallback(async () => {
    setError(null);
    try {
      setDetail(await fetchShareLinkDetail(isId ? { id: key } : { token: key }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the link');
    }
  }, [isId, key]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (!detail) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading link…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <ShareLinkSettings key={detail.link.id} detail={detail} onSaved={setDetail} />
      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground">Activity</h3>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
        <ShareLinkActivity events={detail.events} emptyLabel="Nobody has opened this link yet." />
      </section>
    </div>
  );
}
