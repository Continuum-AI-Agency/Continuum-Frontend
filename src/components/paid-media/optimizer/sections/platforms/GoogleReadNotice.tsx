import { useTranslations as useBetaTranslations } from 'next-intl';
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
  const betaUiText = useBetaTranslations('scale');

  switch (state.status) {
    case 'no-connection':
      return (
        <EmptyState
          body={betaUiText('beta_53a7dff28d74')}
          connect
          testId="google-empty-no-connection"
          title={betaUiText('beta_afe8a59981aa')}
        />
      );
    case 'no-grant':
      return (
        <EmptyState
          body={betaUiText('beta_968e25cb93a7')}
          connect
          testId="google-empty-no-grant"
          title={betaUiText('beta_e53da3192cd0')}
        />
      );
    case 'no-role':
      return (
        <EmptyState
          body={betaUiText('beta_720c0426fa0a')}
          connect={false}
          testId="google-empty-no-role"
          title={betaUiText('beta_f65f2bac3b82')}
        />
      );
    case 'no-access':
      return (
        <EmptyState
          body={betaUiText('beta_a4e4dd1e1ad7')}
          connect
          testId="google-empty-no-access"
          title={betaUiText('beta_cb401de56d6f', {
            value0: String(state.account.name ?? state.account.account_id),
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
              ? betaUiText('beta_bd04b02158fe', {
                  value0: String(state.account.name ?? state.account.account_id),
                })
              : betaUiText('beta_6d8c63abbea1')
          }
        />
      );
  }
}
