'use client';

import type { SlackClaimPreviewResponse, SlackConnectErrorCode } from '@continuum/contracts';
import { Loader2, MessageSquareText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/api/errors';
import {
  previewSlackClaim,
  redeemSlackClaim,
  SLACK_SETTINGS_PATH,
  slackInstallStartHref,
} from '@/lib/api/slackWorkspaces.client';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

// Where a Slack install lands. Installing never needs a Continuum account, so this page is
// public: signed out it explains what happened and how to finish; signed in it names both
// sides — the workspace and the brand — before a brand owner/admin connects them.

const SLACK_CONNECT_PATH = '/slack/connect';

// Typed over every contract code, so a code the Backend adds without copy fails the build.
const ERROR_KEYS = {
  slack_denied: 'm_57efb17039',
  missing_params: 'm_ca8c4fd1f7',
  invalid_state: 'm_ffbea8bc06',
  expired_state: 'm_ee7ad8dab3',
  state_mismatch: 'm_99dd661982',
  exchange_failed: 'm_ec0de39863',
  incomplete_grant: 'm_611e8b7b71',
  not_configured: 'm_8868c96ded',
  invalid_claim: 'm_749c6335ba',
  expired_claim: 'm_f2e0a1938e',
  claim_used: 'm_d82bb33f9b',
  installation_revoked: 'm_11740a51e7',
  forbidden_brand: 'm_8376913f8a',
} as const satisfies Record<SlackConnectErrorCode, string>;
function errorCopy(code: string, t: ReturnType<typeof useTranslations<'common'>>) {
  return Object.hasOwn(ERROR_KEYS, code)
    ? t(ERROR_KEYS[code as keyof typeof ERROR_KEYS])
    : t('m_96c2bb7ae4');
}

// The Backend answers `{ error: <code> }`, which ApiError carries as its message.
const errorCode = (error: unknown) => (error instanceof ApiError ? error.message : '');

// returnTo round-trips through a signed claim, but only ever navigate within this app.
const isAppPath = (path: string | null): path is string =>
  Boolean(path?.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\'));

type ClaimState =
  | { kind: 'checking' }
  | { kind: 'signed_out' }
  | { kind: 'failed'; code: string }
  | { kind: 'ready'; preview: SlackClaimPreviewResponse };

export function SlackConnectClaim({
  claim,
  error,
}: {
  claim: string | null;
  error: string | null;
}) {
  const uiText = useTranslations('common');
  const router = useRouter();
  const [state, setState] = useState<ClaimState>(() =>
    error
      ? { kind: 'failed', code: error }
      : claim
        ? { kind: 'checking' }
        : { kind: 'failed', code: 'invalid_claim' },
  );
  const [brandId, setBrandId] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    if (error || !claim) return;
    let cancelled = false;
    void (async () => {
      if (!(await getBrowserAccessToken())) {
        if (!cancelled) setState({ kind: 'signed_out' });
        return;
      }
      // A signed-in reader redeems it here, so the single-use token leaves the address bar
      // (and history) now. Signed out, the URL stays — it is the link they forward.
      window.history.replaceState(null, '', SLACK_CONNECT_PATH);
      try {
        const preview = await previewSlackClaim(claim);
        if (cancelled) return;
        const preselected = preview.brands.find((brand) => brand.id === preview.brandId);
        setBrandId((preselected ?? preview.brands[0])?.id ?? '');
        setState({ kind: 'ready', preview });
      } catch (failure) {
        if (cancelled) return;
        if (failure instanceof ApiError && failure.status === 401) setState({ kind: 'signed_out' });
        else setState({ kind: 'failed', code: errorCode(failure) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claim, error]);

  const connect = async () => {
    if (!claim || !brandId) return;
    setRedeeming(true);
    setRedeemError(null);
    try {
      const redeemed = await redeemSlackClaim(claim, brandId);
      router.replace(isAppPath(redeemed.returnTo) ? redeemed.returnTo : SLACK_SETTINGS_PATH);
    } catch (failure) {
      const code = errorCode(failure);
      // A brand the caller cannot connect leaves the other choices open; every other failure
      // means this claim cannot be redeemed at all.
      if (code === 'forbidden_brand') setRedeemError(errorCopy(code, uiText));
      else setState({ kind: 'failed', code });
      setRedeeming(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
        <header className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md border border-border bg-muted/30">
            <MessageSquareText className="size-4 text-muted-foreground" aria-hidden />
          </span>
          <h1 className="text-base font-semibold">{uiText('m_6798d8e0bb')}</h1>
        </header>

        {state.kind === 'checking' ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {uiText('m_51a7fce29c')}
          </p>
        ) : null}

        {state.kind === 'signed_out' ? (
          <div className="space-y-4">
            <p className="text-sm leading-6">{uiText('m_0489b9798d')}</p>
            <Link
              href={`/login?redirectTo=${encodeURIComponent(
                `${SLACK_CONNECT_PATH}?${new URLSearchParams({ claim: claim ?? '' })}`,
              )}`}
              className={buttonVariants({ className: 'w-full' })}
            >
              {uiText('sign_in_bfd402b')}
            </Link>
          </div>
        ) : null}

        {state.kind === 'failed' ? <FailedClaim code={state.code} /> : null}

        {state.kind === 'ready' ? (
          state.preview.brands.length === 0 ? (
            <p className="text-sm leading-6">
              {uiText('m_1df91707e7')}{' '}
              <strong>{state.preview.teamName ?? state.preview.teamId}</strong>
              {uiText('m_00b5d068bc')}
            </p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void connect();
              }}
            >
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{uiText('brand_090ed43')}</span>
                <select
                  aria-label={uiText('brand_090ed43')}
                  value={brandId}
                  onChange={(event) => setBrandId(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {state.preview.brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm leading-6">
                {uiText('m_6d2b01e492')}
                <strong>{state.preview.teamName ?? state.preview.teamId}</strong>
                {uiText('m_bcca28f832')}{' '}
                <strong>
                  {state.preview.brands.find((brand) => brand.id === brandId)?.name ??
                    uiText('this_brand_c31b658')}
                </strong>
                {uiText('m_2afabe21ee')}
              </p>
              {redeemError ? <p className="text-sm text-destructive">{redeemError}</p> : null}
              <Button type="submit" className="w-full" disabled={redeeming || !brandId}>
                {redeeming ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {uiText('m_59db6e6cc0')}
              </Button>
            </form>
          )
        ) : null}
      </section>
    </main>
  );
}

function FailedClaim({ code }: { code: string }) {
  const uiText = useTranslations('common');
  // A used claim already connected something; everything else needs a fresh install.
  const toSettings = code === 'claim_used' || code === 'forbidden_brand';
  return (
    <div className="space-y-4">
      <p role="alert" className="text-sm leading-6">
        {errorCopy(code, uiText)}
      </p>
      {toSettings ? (
        <Link
          href={SLACK_SETTINGS_PATH}
          className={buttonVariants({ variant: 'outline', className: 'w-full' })}
        >
          {uiText('open_slack_settings_d46e621')}
        </Link>
      ) : code === 'not_configured' ? null : (
        <a
          href={slackInstallStartHref(null)}
          className={buttonVariants({ variant: 'outline', className: 'w-full' })}
        >
          {uiText('m_c72bfcd928')}
        </a>
      )}
    </div>
  );
}
