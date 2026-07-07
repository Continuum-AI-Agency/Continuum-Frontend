
"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, PlugZapIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PAID_SETUP_CONNECT_HREF } from "./paid-setup-diagnostics";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBrandIntegrations } from "@/hooks/useBrandIntegrations";
import type { BrandIntegrationAccountSummary } from "@/lib/integrations/brandProfile";
import type { PaidMediaPlatform } from "@/lib/paid-media/performance-types";
import { cn } from "@/lib/utils";

export type AdAccount = {
  id: string;
  name: string;
};

type AdAccountSelectorProps = {
  brandId: string;
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
  /** Which ad platform's accounts to surface. Defaults to Meta. */
  platform?: PaidMediaPlatform;
  /** Server-provided initial accounts to avoid a client-side fetch waterfall. */
  initialTimelineAccounts?: AdAccount[];
};

// After this long without a resolved account list we stop showing a disabled
// "Loading accounts" control and surface a real recovery path (BUG-003).
const ACCOUNT_LOAD_TIMEOUT_MS = 12000;

export function AdAccountSelector({
  brandId,
  selectedAccountId,
  onSelect,
  platform = "meta",
  initialTimelineAccounts,
}: AdAccountSelectorProps) {
  const isGoogleAds = platform === "google-ads";
  const isLinkedIn = platform === "linkedin";
  const { integrations, isLoading, isError, refresh } = useBrandIntegrations(brandId);
  const [open, setOpen] = React.useState(false);
  const [timedOut, setTimedOut] = React.useState(false);
  const [reloadNonce, setReloadNonce] = React.useState(0);
  const hasInitialAccounts = initialTimelineAccounts && initialTimelineAccounts.length > 0;
  const [timelineAccounts, setTimelineAccounts] = React.useState<AdAccount[]>(
    initialTimelineAccounts ?? []
  );
  const [timelineAccountsLoaded, setTimelineAccountsLoaded] = React.useState(
    hasInitialAccounts ?? false
  );

  const adAccounts = React.useMemo(() => {
    const seen = new Set<string>();
    const merged: AdAccount[] = [];

    const pushIntegrationAccounts = (accounts: BrandIntegrationAccountSummary[] | undefined) => {
      (accounts ?? []).forEach((account) => {
        const id = account.externalAccountId ?? account.integrationAccountId;
        if (!id || seen.has(id)) return;
        seen.add(id);
        merged.push({ id, name: account.name });
      });
    };

    // Google Ads accounts come straight from the brand integration summary —
    // the Meta-only timeline endpoint has no Google equivalent.
    if (isGoogleAds) {
      pushIntegrationAccounts(integrations?.googleAds?.accounts);
      return merged;
    }
    if (isLinkedIn) {
      pushIntegrationAccounts(integrations?.linkedin?.accounts);
      return merged;
    }

    timelineAccounts.forEach((account) => {
      if (seen.has(account.id)) return;
      seen.add(account.id);
      merged.push(account);
    });
    pushIntegrationAccounts(integrations?.facebook?.accounts);

    return merged;
  }, [integrations, timelineAccounts, isGoogleAds, isLinkedIn]);

  const initialAccountsUsedRef = React.useRef(hasInitialAccounts);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadNonce is a manual re-run signal for the Retry action; it is intentionally not read in the effect body.
  React.useEffect(() => {
    // Non-Meta paid platforms have no timeline endpoint — accounts come from
    // the brand integration summary.
    if (isGoogleAds || isLinkedIn) {
      initialAccountsUsedRef.current = false;
      setTimelineAccounts([]);
      setTimelineAccountsLoaded(true);
      return;
    }

    // Skip client-side fetch on first render when server-provided data exists
    if (initialAccountsUsedRef.current) {
      initialAccountsUsedRef.current = false;
      return;
    }

    let isCancelled = false;
    setTimelineAccountsLoaded(false);
    setTimelineAccounts([]);

    const fetchAccounts = async () => {
      try {
        const response = await fetch("/api/paid-media/timeline/accounts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ brandId }),
          cache: "no-store",
        });

        if (!response.ok) {
          if (!isCancelled) {
            setTimelineAccountsLoaded(true);
          }
          return;
        }

        const payload = (await response.json()) as { accounts?: AdAccount[] };
        const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
        if (!isCancelled) {
          setTimelineAccounts(accounts);
          setTimelineAccountsLoaded(true);
        }
      } catch {
        if (!isCancelled) {
          setTimelineAccounts([]);
          setTimelineAccountsLoaded(true);
        }
      }
    };

    void fetchAccounts();

    return () => {
      isCancelled = true;
    };
  }, [brandId, isGoogleAds, isLinkedIn, reloadNonce]);

  // Auto-select first account if none selected
  React.useEffect(() => {
    if (!timelineAccountsLoaded) return;
    if (!selectedAccountId && adAccounts.length > 0) {
      onSelect(adAccounts[0].id);
    }
  }, [timelineAccountsLoaded, selectedAccountId, adAccounts, onSelect]);

  // A hung account load can otherwise sit forever on a disabled "Loading
  // accounts" control. Once we've been settling with nothing to show past the
  // timeout, flip to the recovery state so the user always has a next action.
  const isSettling = (isLoading || !timelineAccountsLoaded) && adAccounts.length === 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadNonce re-arms the timeout after a Retry even when isSettling is unchanged; it is intentionally not read in the body.
  React.useEffect(() => {
    if (!isSettling) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), ACCOUNT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isSettling, reloadNonce]);

  const handleRetry = React.useCallback(() => {
    setTimedOut(false);
    setReloadNonce((nonce) => nonce + 1);
    void refresh();
  }, [refresh]);

  const resolved = !isLoading && timelineAccountsLoaded;
  const showRecovery = isError || timedOut || (resolved && adAccounts.length === 0);

  if (showRecovery) {
    return (
      <div className="flex items-center gap-1.5">
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs">
          <Link href={PAID_SETUP_CONNECT_HREF}>
            <PlugZapIcon aria-hidden="true" className="h-3.5 w-3.5" />
            Connect ad account
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label="Retry loading ad accounts"
          onClick={handleRetry}
        >
          <RefreshCwIcon aria-hidden="true" className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const selectedAccount = selectedAccountId
    ? adAccounts.find((account) => account.id === selectedAccountId)
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={isLoading || adAccounts.length === 0}
          className="h-8 min-w-[12rem] max-w-[24rem] justify-between px-2 text-xs font-normal sm:min-w-[16rem]"
        >
          <span className="truncate">
            {isLoading
              ? "Loading accounts..."
              : selectedAccount
                ? selectedAccount.name
                : "Select ad account"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search ad accounts..." className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty>No ad accounts found.</CommandEmpty>
            <CommandGroup heading="Ad accounts">
              {adAccounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={`${account.name} ${account.id}`}
                  keywords={[account.id]}
                  onSelect={() => {
                    onSelect(account.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-1.5 h-3.5 w-3.5",
                      selectedAccountId === account.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate text-xs">{account.name}</span>
                  <span className="ml-auto truncate text-2xs text-muted-foreground">{account.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
