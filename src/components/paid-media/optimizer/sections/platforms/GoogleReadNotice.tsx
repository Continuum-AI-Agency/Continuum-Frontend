// What a Google Ads read that cannot happen says: the reason, and the one thing that fixes it —
// connect Google, grant the account, ask an owner, reconnect a refused login, or the API's own
// error. The Google tab shows it in place of its read; the Home shows it when every Google read
// it made was refused (PP-DT-K-home-google-no-access-conflated). One copy for both.

import { cn } from '@/lib/utils';
import * as typeScale from '../../typeScale';
import { PlatformChip } from './PlatformChip';
import { PlatformConnectLink } from './PlatformConnectLink';
import type { GoogleAdsOverviewState } from './useGoogleAdsOverview';

/** The states a Google read ends in when it has nothing to show. */
export type GoogleReadNoticeState = Extract<
  GoogleAdsOverviewState,
  { status: 'no-connection' | 'no-grant' | 'no-role' | 'no-access' | 'error' }
>;

function EmptyState({
  title,
  body,
  testId,
  connect,
}: {
  title: string;
  body: string;
  testId: string;
  connect: boolean;
}) {
  return (
    <section
      className="space-y-2 rounded-lg border border-border/70 border-dashed bg-card px-4 py-5"
      data-testid={testId}
    >
      <div className="flex flex-wrap items-center gap-2">
        <PlatformChip platform="google_ads" />
        <p className={cn(typeScale.body, 'font-semibold text-foreground')}>{title}</p>
      </div>
      <p className="text-muted-foreground text-sm">{body}</p>
      {connect ? <PlatformConnectLink platform="google_ads" /> : null}
    </section>
  );
}

export function GoogleReadNotice({ state }: { state: GoogleReadNoticeState }) {
  switch (state.status) {
    case 'no-connection':
      return (
        <EmptyState
          body="Google Ads isn't connected. Connect a Google login with access to the Ads account, then grant that account to this brand."
          connect
          testId="google-empty-no-connection"
          title="No Google connection"
        />
      );
    case 'no-grant':
      return (
        <EmptyState
          body="Your Google login is connected, but no Google Ads account is granted to this brand. Grant one in Settings → Integrations."
          connect
          testId="google-empty-no-grant"
          title="No Google Ads account granted to this brand"
        />
      );
    case 'no-role':
      return (
        <EmptyState
          body="Reading Google Ads needs the Operator, Admin or Owner role on this brand, and yours is Viewer. Ask an owner or admin of the brand to change it."
          connect={false}
          testId="google-empty-no-role"
          title="Your role on this brand can’t read Google Ads"
        />
      );
    case 'no-access':
      return (
        <EmptyState
          body="This brand lists the account, but no live Google connection grants it to the brand. Grant it again in Settings → Integrations."
          connect
          testId="google-empty-no-access"
          title={`No live Google grant reaches ${state.account.name ?? state.account.account_id}`}
        />
      );
    case 'error':
      return (
        <EmptyState
          body={state.message}
          connect={state.reconnect === true}
          testId="google-empty-error"
          title={
            state.account
              ? `Google Ads could not be read for ${state.account.name ?? state.account.account_id}`
              : 'Google Ads could not be read'
          }
        />
      );
  }
}
