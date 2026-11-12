'use client';
import { useTranslations } from 'next-intl';

// Google's own views on the Google tab (P6 lane B: money left on the table, search terms, Quality
// Score map, PMax health), mounted once by GoogleAdsTab under the account read, on the read's own
// window. Each waits behind a text disclosure so the tab stays short at 375px, and makes its reads
// only once opened: the search-term read alone can be 27k rows.

import type { GoogleResultBucket } from '@continuum/contracts';
import { type ReactNode, useState } from 'react';
import { TEXT_DISCLOSURE } from '../../../components/disclosure';
import type { GoogleReadWindow } from '../googleReads';
import { MoneyLeftOnTable } from './MoneyLeftOnTable';
import { PmaxHealth } from './PmaxHealth';
import { QualityScoreMap } from './QualityScoreMap';
import { SearchTermExplorer } from './SearchTermExplorer';

export type GoogleOwnViewsProps = {
  brandId: string;
  customerId: string;
  /** The customer's currency code, or null when no source reports it. */
  currency: string | null;
  window: GoogleReadWindow;
  /** The portfolios' goal result the tab counts (useGoogleAdsOverview); null when none. */
  resultBucket?: GoogleResultBucket | null;
};

function ViewSection({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  /** Called only once the section is open, so a closed view makes no read. */
  children: () => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group border-border/60 border-t pt-3"
      data-testid={`google-view-${id}`}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className={TEXT_DISCLOSURE}>
        <span className="font-medium text-foreground text-sm">{title}</span>
        <span className="group-open:hidden"> · {hint}</span>
      </summary>
      {open ? <div className="mt-3">{children()}</div> : null}
    </details>
  );
}

export function GoogleOwnViews({
  brandId,
  customerId,
  currency,
  window,
  resultBucket = null,
}: GoogleOwnViewsProps) {
  const uiText = useTranslations('scale');
  const target = { brandId, customerId, currency, resultBucket };
  return (
    <section
      aria-label={uiText('google_s_own_views_30c7404')}
      className="space-y-3"
      data-testid="google-own-views"
    >
      <h3 className="font-semibold text-sm">{uiText('google_s_own_views_30c7404')}</h3>
      <ViewSection
        hint={uiText('impression_share_lost_to_budget_vs_rank_0315244')}
        id="money-left"
        title={uiText('money_left_on_the_table_b18e437')}
      >
        {() => <MoneyLeftOnTable {...target} window={window} />}
      </ViewSection>
      <ViewSection
        hint={uiText('grouped_by_root_ask_jaina_about_any_9697c35')}
        id="search-terms"
        title={uiText('search_terms_616578c')}
      >
        {() => <SearchTermExplorer {...target} />}
      </ViewSection>
      <ViewSection
        hint={uiText('where_spend_sits_on_the_1_10_scale_966c71c')}
        id="quality-score"
        title={uiText('quality_score_map_fd7c613')}
      >
        {() => <QualityScoreMap {...target} window={window} />}
      </ViewSection>
      <ViewSection
        hint={uiText('asset_groups_and_spend_by_network_d14cb71')}
        id="pmax"
        title={uiText('performance_max_health_10cb6f2')}
      >
        {() => <PmaxHealth {...target} window={window} />}
      </ViewSection>
    </section>
  );
}
