'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  type ConsentBrandOption,
  confirmMcpRegistrationAction,
  listConsentBrandsAction,
} from './actions';

type AuthorizationDetails = {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
  scope: string;
};

export function ConsentContent({ authorizationId }: { authorizationId: string | null }) {
  const uiText = useTranslations('public');
  const formatUiError = useUiErrorMessage();
  const router = useRouter();

  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [brands, setBrands] = useState<ConsentBrandOption[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  useEffect(() => {
    if (!authorizationId) {
      setError(uiText('authorizationMissing'));
      setLoading(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!sessionData.session) {
        const returnPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
        router.replace(`/login?redirectTo=${encodeURIComponent(returnPath)}`);
        return;
      }

      void listConsentBrandsAction().then((result) => {
        setBrands(result.brands);
        setSelectedBrandId(result.activeBrandId ?? result.brands[0]?.id ?? null);
      });

      supabase.auth.oauth
        .getAuthorizationDetails(authorizationId)
        .then(({ data, error: detailsError }) => {
          if (detailsError || !data) {
            setError(detailsError ? formatUiError(detailsError) : uiText('authorizationExpired'));
            setLoading(false);
            return;
          }
          if ('redirect_url' in data) {
            // User already consented — follow the redirect immediately
            window.location.href = data.redirect_url;
            return;
          }
          setDetails(data as AuthorizationDetails);
          setLoading(false);
        });
    });
  }, [authorizationId, router, uiText, formatUiError]);

  async function approve() {
    if (!authorizationId || submitting || !details) return;
    setSubmitting(true);
    // Record the connector registration app-side BEFORE approving: the Supabase
    // SDK redirects the browser on success, so no post-redirect JS would run.
    const confirmation = await confirmMcpRegistrationAction({
      authorizationId,
      brandId: selectedBrandId,
    });
    if (!confirmation.registered) {
      setError(uiText('registrationFailed'));
      setSubmitting(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { error: approveError } = await supabase.auth.oauth.approveAuthorization(authorizationId);
    if (approveError) {
      setError(formatUiError(approveError));
      setSubmitting(false);
    }
    // On success the SDK auto-redirects the browser
  }

  async function deny() {
    if (!authorizationId || submitting) return;
    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error: denyError } = await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (denyError) {
      setError(formatUiError(denyError));
      setSubmitting(false);
    }
    // On success the SDK auto-redirects the browser
  }

  if (loading) return <ConsentSkeleton />;

  if (error) {
    return (
      <ConsentShell>
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              role="img"
              aria-label={uiText('error_54a0e8c')}
              className="text-red-500"
            >
              <path
                d="M10 6v4m0 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {uiText('authorization_failed_1cea488')}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
        </div>
      </ConsentShell>
    );
  }

  if (!details) return null;

  const scopes = details.scope ? details.scope.split(' ').filter(Boolean) : [];

  return (
    <ConsentShell>
      <div className="text-center space-y-3">
        {details.client.logo_uri ? (
          <img
            src={details.client.logo_uri}
            alt={details.client.name}
            className="h-12 w-12 rounded-xl object-contain mx-auto border border-zinc-200 dark:border-zinc-700 p-1"
          />
        ) : (
          <div className="h-12 w-12 rounded-xl bg-[#5A48F9]/10 flex items-center justify-center mx-auto">
            <span className="text-[#5A48F9] font-semibold text-lg">
              {details.client.name.charAt(0)}
            </span>
          </div>
        )}
        <div>
          <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {uiText.rich('sentence_dd0d226d6055', { v0: () => details.client.name })}
          </h1>
          {details.client.uri && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{details.client.uri}</p>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        {uiText.rich('authorizingAs', {
          email: () => (
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {details.user.email}
            </span>
          ),
        })}
      </div>

      {brands.length > 0 && (
        <div className="space-y-2">
          <label
            htmlFor="consent-brand"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide block"
          >
            {uiText('brand_to_connect_2edc4f8')}
          </label>
          {brands.length === 1 ? (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100">
              {brands[0].name}
            </div>
          ) : (
            <select
              id="consent-brand"
              value={selectedBrandId ?? ''}
              onChange={(event) => setSelectedBrandId(event.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#5A48F9]/40 disabled:opacity-50"
            >
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {uiText('the_connector_starts_on_this_brand_switch_any_60aa73c')}
          </p>
        </div>
      )}

      {scopes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            {uiText('permissions_requested_e9ae0b9')}
          </p>
          <ul className="space-y-1.5">
            {scopes.map((scope) => (
              <li
                key={scope}
                className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0 text-[#5A48F9]"
                >
                  <path
                    d="M2.5 7l3 3 6-6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {scope}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {uiText('allow_this_client_to_use_continuum_in_chatgpt_b82a2fd')}
      </p>

      <div className="space-y-2 pt-1">
        <Button type="button" onClick={approve} disabled={submitting} size="lg" className="w-full">
          {submitting ? uiText('authorizing_a4dfff4') : uiText('allow_access_e87c3e4')}
        </Button>
        <button
          type="button"
          onClick={deny}
          disabled={submitting}
          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-700 dark:text-zinc-300 text-sm font-medium py-2.5 px-4 transition-colors"
        >
          {uiText('deny_05a2d73')}
        </button>
      </div>
    </ConsentShell>
  );
}

function ConsentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-sm p-8 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 space-y-6">
        {children}
      </div>
    </div>
  );
}

export function ConsentSkeleton() {
  return (
    <ConsentShell>
      <div className="space-y-4">
        <Skeleton className="mx-auto h-12 w-12 rounded-xl" />
        <Skeleton className="mx-auto h-5 w-40 rounded" />
        <Skeleton className="h-10 rounded-lg" />
        <div className="space-y-2 pt-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      </div>
    </ConsentShell>
  );
}
