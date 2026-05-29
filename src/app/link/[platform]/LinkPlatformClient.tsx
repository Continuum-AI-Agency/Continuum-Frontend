"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, CheckCircle2, Loader2, MessageSquareText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError } from "@/lib/api/errors";
import { getApiBaseUrl } from "@/lib/api/config";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";

type LinkPlatformClientProps = {
  platform: string;
  token: string | null;
};

type LinkBrand = {
  brandId: string;
  displayName: string | null;
  adAccountId: string | null;
  role: string;
};

type LinkState =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "auth"; platformLabel: string }
  | { kind: "empty"; platformLabel: string }
  | { kind: "ready"; platformLabel: string; expiresAt: number | null; brands: LinkBrand[] }
  | { kind: "done"; linked: number }
  | { kind: "error"; message: string };

function formatPlatform(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "msteams" || normalized === "teams") return "Teams";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isLinkBrand(value: unknown): value is LinkBrand {
  if (!value || typeof value !== "object") return false;
  const brand = value as Record<string, unknown>;
  return typeof brand.brandId === "string" && typeof brand.role === "string";
}

async function parseJson<T>(response: Response): Promise<T> {
  const json = (await response.json()) as unknown;
  return json as T;
}

export default function LinkPlatformClient({ platform, token }: LinkPlatformClientProps) {
  const router = useRouter();
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const normalizedPlatform = platform.toLowerCase();
  const [state, setState] = useState<LinkState>({ kind: "loading" });
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const nextPath = useMemo(() => {
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    return `/link/${encodeURIComponent(normalizedPlatform)}${params.size ? `?${params.toString()}` : ""}`;
  }, [normalizedPlatform, token]);

  const loadLink = useCallback(async () => {
    if (!token) {
      setState({ kind: "invalid", message: "This link is missing its authorization token." });
      return;
    }

    setState({ kind: "loading" });

    try {
      const validationResponse = await fetch(
        `${apiBaseUrl}/api/chat/link/validate?token=${encodeURIComponent(token)}`,
        { cache: "no-store" }
      );
      if (!validationResponse.ok) {
        setState({ kind: "invalid", message: "This link is invalid or has expired." });
        return;
      }

      const validation = await parseJson<{
        ok: boolean;
        platform?: string;
        expiresAt?: number;
      }>(validationResponse);

      if (!validation.ok || !validation.platform) {
        setState({ kind: "invalid", message: "This link is invalid or has expired." });
        return;
      }

      if (validation.platform.toLowerCase() !== normalizedPlatform) {
        setState({ kind: "invalid", message: "This link does not match the selected platform." });
        return;
      }

      const platformLabel = formatPlatform(validation.platform);
      const accessToken = await getBrowserAccessToken();
      if (!accessToken) {
        setState({ kind: "auth", platformLabel });
        return;
      }

      const brandsResponse = await fetch(`${apiBaseUrl}/api/chat/link/brands`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (brandsResponse.status === 401) {
        setState({ kind: "auth", platformLabel });
        return;
      }
      if (!brandsResponse.ok) {
        throw new ApiError("Unable to load your brands.", brandsResponse.status);
      }

      const brandsPayload = await parseJson<{ brands?: unknown[] }>(brandsResponse);
      const brands = (brandsPayload.brands ?? []).filter(isLinkBrand);

      if (brands.length === 0) {
        setState({ kind: "empty", platformLabel });
        return;
      }

      setSelectedBrandIds(new Set(brands.length === 1 ? [brands[0]!.brandId] : []));
      setState({
        kind: "ready",
        platformLabel,
        expiresAt: typeof validation.expiresAt === "number" ? validation.expiresAt : null,
        brands,
      });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unable to load this link.",
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
    if (state.kind !== "ready" || !token || selectedBrandIds.size === 0) return;

    startTransition(async () => {
      try {
        const accessToken = await getBrowserAccessToken();
        if (!accessToken) {
          setState({ kind: "auth", platformLabel: state.platformLabel });
          return;
        }

        const response = await fetch(`${apiBaseUrl}/api/chat/link/confirm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            token,
            brandIds: Array.from(selectedBrandIds),
          }),
        });

        if (!response.ok) {
          throw new ApiError("Unable to link this platform account.", response.status);
        }

        const payload = await parseJson<{ linked?: number }>(response);
        setState({ kind: "done", linked: payload.linked ?? selectedBrandIds.size });
      } catch (error) {
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Unable to link this platform account.",
        });
      }
    });
  };

  const expiresText =
    state.kind === "ready" && state.expiresAt
      ? new Date(state.expiresAt * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : null;

  return (
    <main className="min-h-[100dvh] bg-[oklch(14%_0.01_265)] px-4 py-8 text-[oklch(98%_0.005_265)] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[34rem] flex-col justify-center">
        <div className="mb-6 flex justify-center">
          <Image
            src="/logos/Continuum.png"
            alt="Continuum"
            width={176}
            height={48}
            priority
            className="h-11 w-auto drop-shadow-[0_10px_24px_oklch(0%_0_0_/_0.32)]"
          />
        </div>

        <section className="rounded-2xl border border-white/10 bg-[oklch(20%_0.015_265_/_0.92)] p-5 shadow-[0_12px_24px_oklch(0%_0_0_/_0.52),inset_0_1px_0_oklch(100%_0_0_/_0.12)] sm:p-7">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[oklch(65%_0.13_180_/_0.28)] bg-[oklch(65%_0.13_180_/_0.1)] text-[oklch(65%_0.13_180)]">
              <MessageSquareText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[oklch(75%_0.015_265)]">External chat access</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl">Link your brand</h1>
              <p className="mt-2 text-sm leading-6 text-[oklch(75%_0.015_265)]">
                Connect this chat identity to the brand contexts you can operate in Continuum.
              </p>
            </div>
          </div>

          {state.kind === "loading" ? (
            <StatusRow icon={<Loader2 className="h-4 w-4 animate-spin" />} text="Checking this link..." />
          ) : null}

          {state.kind === "invalid" || state.kind === "error" ? (
            <StatusRow tone="error" text={state.message} />
          ) : null}

          {state.kind === "auth" ? (
            <div className="space-y-5">
              <StatusRow icon={<ShieldCheck className="h-4 w-4" />} text={`Sign in before linking ${state.platformLabel}.`} />
              <Button
                type="button"
                size="lg"
                disabled={isPending}
                onClick={handleSignIn}
                className="h-12 w-full rounded-lg bg-[oklch(65%_0.13_180)] text-[oklch(14%_0.01_265)] hover:bg-[oklch(75%_0.13_180)]"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Continue with Clerk
              </Button>
            </div>
          ) : null}

          {state.kind === "empty" ? (
            <StatusRow
              text={`You are signed in, but your Continuum account does not have an eligible brand for ${state.platformLabel}.`}
            />
          ) : null}

          {state.kind === "ready" ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-medium text-white">Choose brand access</p>
                <p className="mt-1 text-sm leading-6 text-[oklch(75%_0.015_265)]">
                  {expiresText ? `This ${state.platformLabel} link expires at ${expiresText}.` : `This ${state.platformLabel} link is time-limited.`}
                </p>
              </div>

              <div className="space-y-2">
                {state.brands.map((brand) => {
                  const checked = selectedBrandIds.has(brand.brandId);
                  return (
                    <label
                      key={brand.brandId}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4 transition-colors hover:bg-white/[0.06]"
                    >
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
                        className="border-white/30 data-[state=checked]:border-[oklch(65%_0.13_180)] data-[state=checked]:bg-[oklch(65%_0.13_180)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">
                          {brand.displayName ?? brand.brandId}
                        </span>
                        <span className="mt-1 block text-xs text-[oklch(75%_0.015_265)]">
                          {brand.role}
                          {brand.adAccountId ? ` · ${brand.adAccountId}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <Button
                type="button"
                size="lg"
                disabled={isPending || selectedBrandIds.size === 0}
                onClick={handleConfirm}
                className="h-12 w-full rounded-lg bg-[oklch(65%_0.13_180)] text-[oklch(14%_0.01_265)] hover:bg-[oklch(75%_0.13_180)]"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Link selected brands
              </Button>
            </div>
          ) : null}

          {state.kind === "done" ? (
            <div className="space-y-4">
              <StatusRow
                icon={<CheckCircle2 className="h-4 w-4" />}
                text={`Linked ${state.linked} brand${state.linked === 1 ? "" : "s"}. You can return to Slack and run your command again.`}
              />
              <Button type="button" variant="outline" size="lg" onClick={() => window.close()} className="h-12 w-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.06]">
                Close window
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function StatusRow({
  icon,
  text,
  tone = "default",
}: {
  icon?: ReactNode;
  text: string;
  tone?: "default" | "error";
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-4 text-sm leading-6 ${
        tone === "error"
          ? "border-[oklch(55%_0.2_25_/_0.35)] bg-[oklch(55%_0.2_25_/_0.1)] text-[oklch(82%_0.1_25)]"
          : "border-white/10 bg-white/[0.035] text-[oklch(75%_0.015_265)]"
      }`}
    >
      {icon ? <span className="text-[oklch(65%_0.13_180)]">{icon}</span> : null}
      <span>{text}</span>
    </div>
  );
}
