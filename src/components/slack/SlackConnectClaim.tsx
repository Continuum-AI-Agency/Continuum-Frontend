'use client';

import type { SlackClaimPreviewResponse, SlackConnectErrorCode } from '@continuum/contracts';
import { Loader2, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
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
const ERROR_COPY: Record<SlackConnectErrorCode, string> = {
  slack_denied: 'The install was cancelled in Slack, so nothing was added to your workspace.',
  missing_params: 'Slack sent back an incomplete answer. Start the install again.',
  invalid_state: 'This install could not be verified. Start it again.',
  expired_state: 'The install took longer than 10 minutes to finish. Start it again.',
  state_mismatch:
    'This install was finished in a different browser from the one that started it. Start it again and finish it in the same browser.',
  exchange_failed: 'Slack did not confirm the install. Try again in a moment.',
  incomplete_grant:
    'Slack granted fewer permissions than Continuum needs. Start the install again and approve every permission.',
  not_configured: 'Slack installs are not set up for this environment yet.',
  invalid_claim:
    'This connect link is not valid. Install Continuum in Slack again to get a new one.',
  expired_claim:
    'This connect link is more than 24 hours old. Install Continuum in Slack again to get a new one.',
  claim_used:
    'This link has already been used to connect the workspace. Open Settings to see it, or add Slack to another brand from there.',
  installation_revoked:
    'Continuum has been removed from this Slack workspace. Reinstall it, then connect it to a brand.',
  forbidden_brand: 'You need to be an owner or admin of that brand to connect Slack to it.',
};

const GENERIC_ERROR = 'Something went wrong connecting Slack. Try again.';

function errorCopy(code: string): string {
  return ERROR_COPY[code as SlackConnectErrorCode] ?? GENERIC_ERROR;
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
      if (code === 'forbidden_brand') setRedeemError(errorCopy(code));
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
          <h1 className="text-base font-semibold">Connect Slack to Continuum</h1>
        </header>

        {state.kind === 'checking' ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Checking this link…
          </p>
        ) : null}

        {state.kind === 'signed_out' ? (
          <div className="space-y-4">
            <p className="text-sm leading-6">
              Continuum is installed in your Slack workspace. Sign in as a brand admin to connect it
              to a brand, or send this link to your Continuum admin — it works for 24 hours.
            </p>
            <Link
              href={`/login?redirectTo=${encodeURIComponent(
                `${SLACK_CONNECT_PATH}?${new URLSearchParams({ claim: claim ?? '' })}`,
              )}`}
              className={buttonVariants({ className: 'w-full' })}
            >
              Sign in
            </Link>
          </div>
        ) : null}

        {state.kind === 'failed' ? <FailedClaim code={state.code} /> : null}

        {state.kind === 'ready' ? (
          state.preview.brands.length === 0 ? (
            <p className="text-sm leading-6">
              Continuum is installed in{' '}
              <strong>{state.preview.teamName ?? state.preview.teamId}</strong>, but you are not an
              owner or admin of any brand. Ask a brand owner or admin to open this link, or to add
              you as an admin first.
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
                <span className="text-muted-foreground">Brand</span>
                <select
                  aria-label="Brand"
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
                Connect <strong>{state.preview.teamName ?? state.preview.teamId}</strong> to{' '}
                <strong>
                  {state.preview.brands.find((brand) => brand.id === brandId)?.name ?? 'this brand'}
                </strong>
                ? Everyone on the brand can then post renders and optimizer updates to its channels.
              </p>
              {redeemError ? <p className="text-sm text-destructive">{redeemError}</p> : null}
              <Button type="submit" className="w-full" disabled={redeeming || !brandId}>
                {redeeming ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Connect workspace
              </Button>
            </form>
          )
        ) : null}
      </section>
    </main>
  );
}

function FailedClaim({ code }: { code: string }) {
  // A used claim already connected something; everything else needs a fresh install.
  const toSettings = code === 'claim_used' || code === 'forbidden_brand';
  return (
    <div className="space-y-4">
      <p role="alert" className="text-sm leading-6">
        {errorCopy(code)}
      </p>
      {toSettings ? (
        <Link
          href={SLACK_SETTINGS_PATH}
          className={buttonVariants({ variant: 'outline', className: 'w-full' })}
        >
          Open Slack settings
        </Link>
      ) : code === 'not_configured' ? null : (
        <a
          href={slackInstallStartHref(null)}
          className={buttonVariants({ variant: 'outline', className: 'w-full' })}
        >
          Install Continuum in Slack again
        </a>
      )}
    </div>
  );
}
