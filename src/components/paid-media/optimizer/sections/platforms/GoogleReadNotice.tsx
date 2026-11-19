// What a Google Ads read that cannot happen says: the reason, and the one thing that fixes it —
// connect Google, grant the account, ask an owner, reconnect a refused login, or the API's own
// error. The Google tab shows it in place of its read; the Home shows it when every Google read
// it made was refused (PP-DT-K-home-google-no-access-conflated). One copy for both.

import { useTranslations } from 'next-intl';
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
  const uiText = useTranslations('scale');
  switch (state.status) {
    case 'no-connection':
      return (
        <EmptyState
          body={uiText('googleTabNoConnection')}
          connect
          testId="google-empty-no-connection"
          title={uiText('no_google_connection_afe8a59')}
        />
      );
    case 'no-grant':
      return (
        <EmptyState
          body={uiText('googleTabNoGrant')}
          connect
          testId="google-empty-no-grant"
          title={uiText('no_google_ads_account_granted_to_this_brand_e53da31')}
        />
      );
    case 'no-role':
      return (
        <EmptyState
          body={uiText('reading_google_ads_needs_the_operator_admin_o_720c042')}
          connect={false}
          testId="google-empty-no-role"
          title={uiText('your_role_on_this_brand_can_t_read_google_ads_f65f2ba')}
        />
      );
    case 'no-access':
      return (
        <EmptyState
          body={uiText('this_brand_lists_the_account_but_no_live_goog_a4e4dd1')}
          connect
          testId="google-empty-no-access"
          title={uiText('no_live_google_grant_reaches_account_143ce8a', {
            account: state.account.name ?? state.account.account_id,
          })}
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
              ? uiText('template_7f7ae35fd49f', {
                  v0: state.account.name ?? state.account.account_id,
                })
              : uiText('google_ads_could_not_be_read_6d8c63a')
          }
        />
      );
  }
}
