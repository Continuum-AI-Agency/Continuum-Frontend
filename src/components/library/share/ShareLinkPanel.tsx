'use client';

// One share link's presentation settings and its reviewer activity, loaded by
// id (from the asset's link list) or by token (from a freshly made share URL).

import type { ShareLinkDetailResponse } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUiErrorMessage } from '@/i18n/errors';
import { ShareLinkActivity } from './ShareLinkActivity';
import { ShareLinkSettings } from './ShareLinkSettings';
import { fetchShareLinkDetail } from './shareLinkClient';

export function ShareLinkPanel({ by }: { by: { id: string } | { token: string } }) {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('library');

  const [detail, setDetail] = useState<ShareLinkDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isId = 'id' in by;
  const key = 'id' in by ? by.id : by.token;

  const load = useCallback(async () => {
    setError(null);
    try {
      setDetail(await fetchShareLinkDetail(isId ? { id: key } : { token: key }));
    } catch (err) {
      setError(uiErrorText(err));
    }
  }, [isId, key, uiErrorText]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (!detail) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />{' '}
        {translateUi('loading_link_a58e52a2')}{' '}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <ShareLinkSettings key={detail.link.id} detail={detail} onSaved={setDetail} />
      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground">
            {translateUi('activity_38da1505')}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => void load()}
          >
            {' '}
            {translateUi('refresh_0e916101')}{' '}
          </Button>
        </div>
        <ShareLinkActivity
          events={detail.events}
          totals={detail.totals}
          emptyLabel={translateUi('shareNobodyOpenedLink')}
        />
      </section>
    </div>
  );
}
