'use client';

import {
  ArrowRight,
  CaretRight,
  CheckCircle,
  CircleNotch,
  Clock,
  MagnifyingGlass,
  PlugsConnected,
  ShieldCheck,
} from '@phosphor-icons/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getApiBaseUrl } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { cn } from '@/lib/utils';

type LinkPlatformClientProps = {
  platform: string;
  token: string | null;
};

type LinkAccount = {
  platform: string;
  handle: string | null;
  displayName: string | null;
  accountType: string | null;
};

type LinkBrand = {
  brandId: string;
  displayName: string | null;
  adAccountId: string | null;
  role: string;
  accounts?: LinkAccount[];
  iconUrl?: string | null;
  logoUrl?: string | null;
  avatarUrl?: string | null;
};

type LinkState =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'auth'; platformLabel: string }
  | { kind: 'empty'; platformLabel: string }
  | { kind: 'ready'; platformLabel: string; expiresAt: number | null; brands: LinkBrand[] }
  | { kind: 'done'; linked: number }
  | { kind: 'error'; message: string };

function formatPlatform(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'msteams' || normalized === 'teams') return 'Teams';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isLinkBrand(value: unknown): value is LinkBrand {
  if (!value || typeof value !== 'object') return false;
  const brand = value as Record<string, unknown>;
  return typeof brand.brandId === 'string' && typeof brand.role === 'string';
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function brandSearchText(brand: LinkBrand): string {
  return normalizeSearchText(
    [brand.displayName, brand.role, brand.adAccountId, brand.brandId].filter(Boolean).join(' '),
  );
}

function fuzzyIncludes(haystack: string, needle: string): boolean {
  if (!needle) return true;
  if (haystack.includes(needle)) return true;

  let cursor = 0;
  for (const char of needle) {
    const next = haystack.indexOf(char, cursor);
    if (next === -1) return false;
    cursor = next + 1;
  }
  return true;
}

function filterBrands(brands: LinkBrand[], query: string): LinkBrand[] {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return brands;

  return brands.filter((brand) => {
    const searchText = brandSearchText(brand);
    return terms.every((term) => fuzzyIncludes(searchText, term));
  });
}

function brandInitials(brand: LinkBrand): string {
  const source = normalizeSearchText(brand.displayName ?? brand.brandId);
  const words = source.split(/[\s_-]+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('');
  return (initials || 'C').toUpperCase();
}

async function parseJson<T>(response: Response): Promise<T> {
  const json = (await response.json()) as unknown;
  return json as T;
}

export default function LinkPlatformClient({ platform, token }: LinkPlatformClientProps) {
  const router = useRouter();
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const normalizedPlatform = platform.toLowerCase();
  const [state, setState] = useState<LinkState>({ kind: 'loading' });
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<string>>(new Set());
  const [brandSearchQuery, setBrandSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  const nextPath = useMemo(() => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    return `/link/${encodeURIComponent(normalizedPlatform)}${params.size ? `?${params.toString()}` : ''}`;
  }, [normalizedPlatform, token]);

  const loadLink = useCallback(async () => {
    if (!token) {
      setState({ kind: 'invalid', message: 'This link is missing its authorization token.' });
      return;
    }

    setState({ kind: 'loading' });

    try {
      const validationResponse = await fetch(
        `${apiBaseUrl}/api/chat/link/validate?token=${encodeURIComponent(token)}`,
        { cache: 'no-store' },
      );
      if (!validationResponse.ok) {
        setState({ kind: 'invalid', message: 'This link is invalid or has expired.' });
        return;
      }

      const validation = await parseJson<{
        ok: boolean;
        platform?: string;
        expiresAt?: number;
      }>(validationResponse);

      if (!validation.ok || !validation.platform) {
        setState({ kind: 'invalid', message: 'This link is invalid or has expired.' });
        return;
      }

      if (validation.platform.toLowerCase() !== normalizedPlatform) {
        setState({ kind: 'invalid', message: 'This link does not match the selected platform.' });
        return;
      }

      const platformLabel = formatPlatform(validation.platform);
      const accessToken = await getBrowserAccessToken();
      if (!accessToken) {
        setState({ kind: 'auth', platformLabel });
        return;
      }

      const brandsResponse = await fetch(`${apiBaseUrl}/api/chat/link/brands`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (brandsResponse.status === 401) {
        setState({ kind: 'auth', platformLabel });
        return;
      }
      if (!brandsResponse.ok) {
        throw new ApiError('Unable to load your brands.', brandsResponse.status);
      }

      const brandsPayload = await parseJson<{ brands?: unknown[] }>(brandsResponse);
      const brands = (brandsPayload.brands ?? []).filter(isLinkBrand);

      if (brands.length === 0) {
        setState({ kind: 'empty', platformLabel });
        return;
      }

      setBrandSearchQuery('');
      setSelectedBrandIds(new Set(brands.length === 1 ? [brands[0]!.brandId] : []));
      setState({
        kind: 'ready',
        platformLabel,
        expiresAt: typeof validation.expiresAt === 'number' ? validation.expiresAt : null,
        brands,
      });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unable to load this link.',
      });
    }
  }, [apiBaseUrl, normalizedPlatform, token]);

  useEffect(() => {
    void loadLink();
  }, [loadLink]);

  const handleSignIn = () => {
    router.push(`/login?redirectTo=${encodeURIComponent(nextPath)}`);
  };

  const handleConfirm = () => {
    if (state.kind !== 'ready' || !token || selectedBrandIds.size === 0) return;

    startTransition(async () => {
      try {
        const accessToken = await getBrowserAccessToken();
        if (!accessToken) {
          setState({ kind: 'auth', platformLabel: state.platformLabel });
          return;
        }

        const response = await fetch(`${apiBaseUrl}/api/chat/link/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            token,
            brandIds: Array.from(selectedBrandIds),
          }),
        });

        if (!response.ok) {
          throw new ApiError('Unable to link this platform account.', response.status);
        }

        const payload = await parseJson<{ linked?: number }>(response);
        setState({ kind: 'done', linked: payload.linked ?? selectedBrandIds.size });
      } catch (error) {
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Unable to link this platform account.',
        });
      }
    });
  };

  const expiresText =
    state.kind === 'ready' && state.expiresAt
      ? new Date(state.expiresAt * 1000).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;
  const selectedCount = selectedBrandIds.size;
  const visibleBrands = useMemo(
    () => (state.kind === 'ready' ? filterBrands(state.brands, brandSearchQuery) : []),
    [brandSearchQuery, state],
  );

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[oklch(14%_0.01_265)] px-4 py-6 text-[oklch(98%_0.005_265)] sm:px-6 lg:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(circle at 18% 14%, oklch(52% 0.22 275 / 0.18), transparent 28rem), radial-gradient(circle at 82% 76%, oklch(65% 0.13 180 / 0.14), transparent 24rem), linear-gradient(135deg, oklch(14% 0.01 265), oklch(11% 0.012 265))',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-10rem] h-[38rem] w-[38rem] -translate-x-1/2 rounded-full border border-[oklch(98%_0.005_265_/_0.06)]"
      />

      <div className="relative mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-[68rem] content-center gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:gap-6">
        <aside className="flex flex-col justify-between rounded-2xl border border-[oklch(98%_0.005_265_/_0.1)] bg-[oklch(16%_0.012_265_/_0.78)] p-5 shadow-[0_12px_24px_oklch(0%_0_0_/_0.46),inset_0_1px_0_oklch(100%_0_0_/_0.08)] backdrop-blur-md sm:p-7">
          <div>
            <Image
              src="/logos/Continuum.png"
              alt="Continuum"
              width={184}
              height={50}
              priority
              className="h-10 w-auto drop-shadow-[0_10px_24px_oklch(0%_0_0_/_0.32)]"
            />
            <div className="mt-10 max-w-[28rem]">
              <p className="text-xs font-medium tracking-[0.02em] text-[oklch(75%_0.015_265)]">
                External chat access
              </p>
              <h1 className="mt-2 text-[2rem] font-semibold leading-[1.1] tracking-[-0.01em] text-[oklch(98%_0.005_265)] sm:text-[2.5rem]">
                Link your brand
              </h1>
              <p className="mt-4 text-sm leading-6 text-[oklch(78%_0.018_265)]">
                Choose which Continuum brand contexts this chat identity can use.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-3 text-sm">
            <AccessFact
              icon={<ShieldCheck size={18} weight="regular" />}
              label="Access scope"
              value={
                state.kind === 'ready'
                  ? `${state.brands.length} eligible brand${state.brands.length === 1 ? '' : 's'}`
                  : 'Verified after sign in'
              }
            />
            <AccessFact
              icon={<Clock size={18} weight="regular" />}
              label="Link window"
              value={expiresText ? `Expires at ${expiresText}` : 'Time limited'}
            />
          </div>
        </aside>

        <section className="flex max-h-[calc(100dvh-3rem)] min-h-[34rem] flex-col rounded-2xl border border-[oklch(98%_0.005_265_/_0.12)] bg-[oklch(20%_0.015_265_/_0.94)] shadow-[0_12px_24px_oklch(0%_0_0_/_0.52),inset_0_1px_0_oklch(100%_0_0_/_0.12)]">
          <div className="flex items-center justify-between gap-4 border-b border-[oklch(98%_0.005_265_/_0.08)] px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[oklch(98%_0.005_265)]">Choose brand access</p>
              <p className="mt-1 text-xs leading-5 text-[oklch(75%_0.015_265)]">
                {state.kind === 'ready'
                  ? `${selectedCount} selected for ${state.platformLabel}`
                  : 'Connect a chat workspace to Continuum'}
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[oklch(65%_0.13_180_/_0.26)] bg-[oklch(65%_0.13_180_/_0.1)] text-[oklch(72%_0.13_180)]">
              <PlugsConnected size={20} weight="regular" />
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {state.kind === 'loading' ? (
              <StatusRow
                icon={<CircleNotch className="h-4 w-4 animate-spin" />}
                text="Checking this link..."
              />
            ) : null}

            {state.kind === 'invalid' || state.kind === 'error' ? (
              <StatusRow tone="error" text={state.message} />
            ) : null}

            {state.kind === 'auth' ? (
              <div className="space-y-5">
                <StatusRow
                  icon={<ShieldCheck className="h-4 w-4" />}
                  text={`Sign in before linking ${state.platformLabel}.`}
                />
                <Button
                  type="button"
                  size="lg"
                  disabled={isPending}
                  onClick={handleSignIn}
                  className="h-12 w-full cursor-pointer rounded-lg bg-[oklch(65%_0.13_180)] text-[oklch(14%_0.01_265)] shadow-[0_1px_3px_oklch(0%_0_0_/_0.4),inset_0_1px_0_oklch(100%_0_0_/_0.22)] transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[oklch(75%_0.13_180)] active:translate-y-px disabled:cursor-not-allowed"
                >
                  {isPending ? (
                    <CircleNotch className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Continue to sign in
                </Button>
              </div>
            ) : null}

            {state.kind === 'empty' ? (
              <StatusRow
                text={`You are signed in, but your Continuum account does not have an eligible brand for ${state.platformLabel}.`}
              />
            ) : null}

            {state.kind === 'ready' ? (
              <div className="space-y-3">
                <div className="grid gap-2">
                  <label
                    htmlFor="brand-search"
                    className="text-xs font-medium text-[oklch(75%_0.015_265)]"
                  >
                    Search brands
                  </label>
                  <div className="relative">
                    <MagnifyingGlass
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[oklch(75%_0.015_265)]"
                      size={16}
                      weight="regular"
                    />
                    <input
                      id="brand-search"
                      type="search"
                      value={brandSearchQuery}
                      onChange={(event) => setBrandSearchQuery(event.target.value)}
                      placeholder="Name, role, account ID"
                      className="h-11 w-full rounded-lg border border-[oklch(98%_0.005_265_/_0.14)] bg-[oklch(14%_0.01_265_/_0.72)] pl-10 pr-3 text-sm text-[oklch(98%_0.005_265)] outline-none transition-[border-color,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-[oklch(75%_0.015_265_/_0.72)] focus:border-[oklch(65%_0.13_180)] focus:ring-2 focus:ring-[oklch(65%_0.13_180_/_0.32)]"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  {visibleBrands.map((brand) => {
                    const checked = selectedBrandIds.has(brand.brandId);
                    return (
                      <div
                        key={brand.brandId}
                        className={cn(
                          'overflow-hidden rounded-xl border transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
                          checked
                            ? 'border-[oklch(65%_0.13_180_/_0.55)] bg-[oklch(65%_0.13_180_/_0.12)]'
                            : 'border-[oklch(98%_0.005_265_/_0.1)] bg-[oklch(98%_0.005_265_/_0.035)] hover:border-[oklch(98%_0.005_265_/_0.18)] hover:bg-[oklch(98%_0.005_265_/_0.06)]',
                        )}
                      >
                        <label className="group flex min-h-16 cursor-pointer items-center gap-3 p-4 transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] active:translate-y-px">
                          <BrandIcon brand={brand} />
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setSelectedBrandIds((current) => {
                                const next = new Set(current);
                                if (value) next.add(brand.brandId);
                                else next.delete(brand.brandId);
                                return next;
                              });
                            }}
                            className="size-5 border-[oklch(98%_0.005_265_/_0.5)] bg-[oklch(14%_0.01_265)] text-[oklch(14%_0.01_265)] focus-visible:ring-[oklch(65%_0.13_180_/_0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(20%_0.015_265)] data-[state=checked]:border-[oklch(65%_0.13_180)] data-[state=checked]:bg-[oklch(65%_0.13_180)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[oklch(98%_0.005_265)]">
                              {brand.displayName ?? brand.brandId}
                            </span>
                            <span className="mt-1 block truncate text-xs leading-5 text-[oklch(75%_0.015_265)]">
                              {brand.role}
                              {brand.adAccountId ? ` - ${brand.adAccountId}` : ''}
                            </span>
                          </span>
                          {checked ? (
                            <CheckCircle
                              aria-hidden="true"
                              className="shrink-0 text-[oklch(72%_0.13_180)]"
                              size={20}
                              weight="fill"
                            />
                          ) : null}
                        </label>
                        <BrandAccountsDisclosure accounts={brand.accounts ?? []} />
                      </div>
                    );
                  })}
                </div>
                {visibleBrands.length === 0 ? (
                  <StatusRow text={`No eligible brands match "${brandSearchQuery.trim()}".`} />
                ) : null}
              </div>
            ) : null}

            {state.kind === 'done' ? (
              <div className="space-y-4">
                <StatusRow
                  icon={<CheckCircle className="h-4 w-4" weight="fill" />}
                  text={`Linked ${state.linked} brand${state.linked === 1 ? '' : 's'}. You can return to Slack and run your command again.`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => window.close()}
                  className="h-12 w-full cursor-pointer rounded-lg border-[oklch(98%_0.005_265_/_0.15)] bg-[oklch(98%_0.005_265_/_0.03)] text-[oklch(98%_0.005_265)] transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[oklch(98%_0.005_265_/_0.06)] active:translate-y-px"
                >
                  Close window
                </Button>
              </div>
            ) : null}
          </div>

          {state.kind === 'ready' ? (
            <div className="border-t border-[oklch(98%_0.005_265_/_0.08)] bg-[oklch(18%_0.014_265_/_0.96)] p-5 sm:p-6">
              <Button
                type="button"
                size="lg"
                disabled={isPending || selectedBrandIds.size === 0}
                onClick={handleConfirm}
                className="h-12 w-full cursor-pointer rounded-lg bg-[oklch(65%_0.13_180)] text-[oklch(14%_0.01_265)] shadow-[0_1px_3px_oklch(0%_0_0_/_0.4),inset_0_1px_0_oklch(100%_0_0_/_0.22)] transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[oklch(75%_0.13_180)] active:translate-y-px disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <CircleNotch className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" weight="fill" />
                )}
                Link selected brands
              </Button>
              <p className="mt-3 text-center text-xs leading-5 text-[oklch(75%_0.015_265)]">
                {expiresText
                  ? `This ${state.platformLabel} link expires at ${expiresText}.`
                  : `This ${state.platformLabel} link is time limited.`}
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function BrandAccountsDisclosure({ accounts }: { accounts: LinkAccount[] }) {
  if (accounts.length === 0) {
    return (
      <p className="border-t border-[oklch(98%_0.005_265_/_0.08)] px-4 py-2.5 text-xs text-[oklch(70%_0.015_265)]">
        No connected accounts yet
      </p>
    );
  }

  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between gap-2 border-t border-[oklch(98%_0.005_265_/_0.08)] px-4 py-2.5 text-xs font-medium text-[oklch(78%_0.018_265)] outline-none transition-colors duration-150 hover:text-[oklch(98%_0.005_265)] focus-visible:text-[oklch(98%_0.005_265)]">
        <span>
          {accounts.length} connected account{accounts.length === 1 ? '' : 's'}
        </span>
        <CaretRight
          aria-hidden="true"
          size={14}
          weight="bold"
          className="shrink-0 text-[oklch(72%_0.13_180)] transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[state=open]:rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="space-y-1 px-4 pb-3">
          {accounts.map((account, index) => (
            <li
              key={`${account.platform}-${account.handle ?? account.displayName ?? index}`}
              className="flex items-center gap-2 rounded-lg bg-[oklch(14%_0.01_265_/_0.5)] px-3 py-2"
            >
              <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.06em] text-[oklch(72%_0.13_180)]">
                {account.platform}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-[oklch(92%_0.01_265)]">
                {account.handle ?? account.displayName ?? '-'}
              </span>
              {account.accountType ? (
                <span className="shrink-0 text-[0.65rem] text-[oklch(70%_0.015_265)]">
                  {account.accountType}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function BrandIcon({ brand }: { brand: LinkBrand }) {
  const iconUrl = brand.iconUrl ?? brand.logoUrl ?? brand.avatarUrl ?? null;

  if (iconUrl) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[oklch(98%_0.005_265_/_0.12)] bg-[oklch(14%_0.01_265)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[oklch(65%_0.13_180_/_0.24)] bg-[oklch(65%_0.13_180_/_0.1)] text-xs font-semibold tracking-[0.08em] text-[oklch(76%_0.13_180)]"
    >
      {brandInitials(brand)}
    </span>
  );
}

function AccessFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[oklch(98%_0.005_265_/_0.08)] bg-[oklch(98%_0.005_265_/_0.03)] p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[oklch(65%_0.13_180_/_0.1)] text-[oklch(72%_0.13_180)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-[oklch(75%_0.015_265)]">{label}</span>
        <span className="mt-0.5 block truncate text-sm font-medium text-[oklch(98%_0.005_265)]">
          {value}
        </span>
      </span>
    </div>
  );
}

function StatusRow({
  icon,
  text,
  tone = 'default',
}: {
  icon?: ReactNode;
  text: string;
  tone?: 'default' | 'error';
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-4 text-sm leading-6 ${
        tone === 'error'
          ? 'border-[oklch(55%_0.2_25_/_0.35)] bg-[oklch(55%_0.2_25_/_0.1)] text-[oklch(82%_0.1_25)]'
          : 'border-[oklch(98%_0.005_265_/_0.1)] bg-[oklch(98%_0.005_265_/_0.035)] text-[oklch(82%_0.015_265)]'
      }`}
    >
      {icon ? <span className="text-[oklch(65%_0.13_180)]">{icon}</span> : null}
      <span>{text}</span>
    </div>
  );
}
