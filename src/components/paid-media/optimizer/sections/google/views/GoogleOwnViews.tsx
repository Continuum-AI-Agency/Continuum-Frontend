'use client';

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
  const target = { brandId, customerId, currency, resultBucket };
  return (
    <section aria-label="Google's own views" className="space-y-3" data-testid="google-own-views">
      <h3 className="font-semibold text-sm">Google's own views</h3>
      <ViewSection
        hint="impression share lost to budget vs rank"
        id="money-left"
        title="Money left on the table"
      >
        {() => <MoneyLeftOnTable {...target} window={window} />}
      </ViewSection>
      <ViewSection
        hint="grouped by root; ask Jaina about any"
        id="search-terms"
        title="Search terms"
      >
        {() => <SearchTermExplorer {...target} />}
      </ViewSection>
      <ViewSection
        hint="where spend sits on the 1–10 scale"
        id="quality-score"
        title="Quality Score map"
      >
        {() => <QualityScoreMap {...target} window={window} />}
      </ViewSection>
      <ViewSection
        hint="asset groups and spend by network"
        id="pmax"
        title="Performance Max health"
      >
        {() => <PmaxHealth {...target} window={window} />}
      </ViewSection>
    </section>
  );
}
